import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabase('app.db');

let _online = false;
let _dataListeners = [];
let _DB_READY = false;
let _initPromise = null;
let _dbWriteQueue = Promise.resolve();

const LOCK_RETRY_DELAYS_MS = [100, 250, 500, 500];
const SQLITE_WRITE_PREFIX = /^(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|PRAGMA|VACUUM|BEGIN|COMMIT|ROLLBACK)/i;
const DB_READY_WAIT_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isLockedError = (error) => {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('database is locked') || text.includes('sqlite_busy') || text.includes('sqlitedatabasebusyexception');
};

const runSqlOnce = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(
          sql,
          params,
          (_, result) => resolve(result),
          (_, error) => {
            reject(error);
            return true;
          }
        );
      },
      (err) => reject(err)
    );
  });

const runSqlWithRetry = async (sql, params = []) => {
  let attempt = 0;
  while (true) {
    try {
      return await runSqlOnce(sql, params);
    } catch (error) {
      if (!isLockedError(error) || attempt >= LOCK_RETRY_DELAYS_MS.length) {
        console.log("❌ SQL ERROR IN QUERY:", sql);
        console.log("❌ SQLError:", error);
        throw error;
      }
      const delayMs = LOCK_RETRY_DELAYS_MS[attempt];
      console.log(`[SQLite] retry ${attempt + 1}/${LOCK_RETRY_DELAYS_MS.length} after lock (${delayMs}ms) sql=${sql.slice(0, 80)}`);
      attempt += 1;
      await sleep(delayMs);
    }
  }
};

const enqueueDbWrite = (runner) => {
  const next = _dbWriteQueue.then(runner, runner);
  _dbWriteQueue = next.catch(() => {});
  return next;
};

export const setOnlineStatus = (status) => {
  _online = !!status;
};

export const isDbOnline = () => _online;

export const getProjectId = async () => {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return await AsyncStorage.getItem('isp_project_id');
  } catch (e) {
    return null;
  }
};

export const subscribeDataChanges = (fn) => {
  _dataListeners.push(fn);
  return () => {
    _dataListeners = _dataListeners.filter(x => x !== fn);
  };
};

export const notifyDataChanged = (type = 'all', payload = null) => {
  _dataListeners.forEach(fn => {
    try { fn({ type, payload, at: Date.now() }); } catch (e) { }
  });
};

export const setDbReady = (value) => {
  _DB_READY = !!value;
};

export const isDbReady = () => _DB_READY;

export const waitForDbReady = async () => {
  if (_DB_READY) return true;
  if (_initPromise) {
    try {
      await Promise.race([
        _initPromise,
        new Promise((resolve) => setTimeout(() => resolve(false), DB_READY_WAIT_TIMEOUT_MS)),
      ]);
    } catch (e) { }
    return _DB_READY;
  }
  return false;
};

export const execSQL = (sql, params = []) => {
  const runner = () => runSqlWithRetry(sql, params);
  return SQLITE_WRITE_PREFIX.test(String(sql || '').trim())
    ? enqueueDbWrite(runner)
    : runner();
};

export const ensureSingleRowAffected = (result, context = 'database update') => {
  const affected = Number(result?.rowsAffected ?? 0);
  if (affected !== 1) {
    throw new Error(`${context} expected to affect exactly 1 row, affected ${affected}`);
  }
  return result;
};

/**
 * Run a sequence of SQL queries inside ONE atomic SQLite transaction.
 * Because expo-sqlite does not support async/await inside db.transaction,
 * we use a Generator function. Yield an object {sql, params} to execute.
 * The yield expression evaluates to the SQL result set.
 * If you throw an error, it rolls back.
 *
 * Usage:
 *   await withTransaction(function* () {
 *     const w = yield { sql: 'SELECT ...', params: [id] };
 *     yield { sql: 'INSERT ...', params: [...] };
 *     return payload;
 *   });
 */
export const withTransaction = (generatorFactory) =>
  enqueueDbWrite(() =>
    new Promise((resolve, reject) => {
      let finalResult;
      db.transaction(
        tx => {
          console.log("⚡ TX START");
          const iter = generatorFactory();

          function step(resumeValue) {
            try {
              const { value, done } = iter.next(resumeValue);
              if (done) {
                finalResult = value;
                return;
              }
              if (!value || !value.sql) {
                throw new Error("withTransaction: yielded value must be {sql, params}");
              }
              tx.executeSql(
                value.sql,
                value.params || [],
                (_, result) => {
                  step(result);
                },
                (_, error) => {
                  console.log("❌ TX-ATOMIC SQL ERROR:", value.sql);
                  console.log("❌ SQLError:", error);
                  reject(error);
                  return true;
                }
              );
            } catch (err) {
              console.log("❌ TX-ATOMIC LOGIC ERROR:", err);
              tx.executeSql('SELECT _FORCE_ROLLBACK_NOW_', [], () => {}, () => true);
              reject(err);
            }
          }

          step();
        },
        async (err) => {
          if (isLockedError(err)) {
            console.log("[SQLite] transaction locked after queue serialization");
          }
          console.log("⚡ TX ROLLBACK (Error)", err?.message || err);
          reject(err);
        },
        () => {
          console.log("⚡ TX COMMIT (Success)");
          resolve(finalResult);
        }
      );
    })
  );

export const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });

export const addToSyncQueue = async (tableName, operation, payload, recordId = null, operationGroupId = null) => {
  const resolvedProjectId = (payload || {}).project_id || await getProjectId();
  const projectId = resolvedProjectId || null;

  // ── Phase Locking Guard ──
  if (['invoices', 'collections', 'supplies', 'agent_wallets'].includes(tableName) && ['INSERT', 'UPDATE', 'DELETE'].includes(operation)) {
    const phaseId = (payload || {}).phase_id;
    let isClosed = false;
    
    if (phaseId) {
       const r = await execSQL(`SELECT status FROM phases WHERE id = ? LIMIT 1`, [phaseId]);
       if (r.rows._array?.[0]?.status === 'closed') isClosed = true;
    } else if (operation === 'INSERT' || operation === 'UPDATE') {
       // If no phaseId is provided, check if there's an active phase
       let r;
       if (projectId) {
         r = await execSQL(`SELECT id FROM phases WHERE status = 'active' AND project_id = ? LIMIT 1`, [projectId]);
       } else {
         r = await execSQL(`SELECT id FROM phases WHERE status = 'active' LIMIT 1`);
       }
       if (!r.rows._array || r.rows._array.length === 0) {
         throw new Error('لا توجد مرحلة نشطة لإجراء هذه العملية.');
       }
       if (payload) payload.phase_id = r.rows._array[0].id;
    }

    if (isClosed) {
      throw new Error('لا يمكن إجراء هذه العملية لأن المرحلة الخاصة بها مغلقة (وضع القراءة فقط).');
    }
  }

  const enhancedPayload = { ...(payload || {}) };
  if (projectId) enhancedPayload.project_id = projectId;
  
  const normalizedPayload = JSON.stringify(enhancedPayload);
  const existing = await execSQL(
    `SELECT id FROM sync_queue
     WHERE table_name = ?
       AND operation = ?
       AND COALESCE(record_id, '') = COALESCE(?, '')
       AND COALESCE(payload, '') = COALESCE(?, '')
       AND COALESCE(attempts, 0) < 5
     LIMIT 1`,
    [tableName, operation, recordId, normalizedPayload]
  );
  if ((existing.rows._array || []).length > 0) {
    try {
      const { ensureOperationLogForSyncQueueId } = require('./operationLogger');
      await ensureOperationLogForSyncQueueId(existing.rows._array[0].id);
    } catch (e) { }
    return existing.rows._array[0].id;
  }

  const ins = await execSQL(
    `INSERT INTO sync_queue (operation_group_id, table_name, operation, payload, record_id, project_id, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
    [operationGroupId, tableName, operation, normalizedPayload, recordId, projectId]
  );
  try {
    const { logQueuedOperation } = require('./operationLogger');
    await logQueuedOperation({
      syncQueueId: ins.insertId,
      tableName,
      operation,
      payload: enhancedPayload,
      recordId,
      projectId,
      operationGroupId,
    });
  } catch (e) { }
  notifyDataChanged('sync_queue');
  return ins.insertId;
};

export const getSyncQueueCount = async () => {
  const r = await execSQL(
    `SELECT COUNT(*) as count FROM sync_queue WHERE COALESCE(attempts,0) < 5`
  );
  return r.rows._array?.[0]?.count || 0;
};

export const isRecordInSyncQueue = async (id) => {
  const r = await execSQL(`SELECT id FROM sync_queue WHERE record_id=? LIMIT 1`, [id]);
  return (r.rows._array || []).length > 0;
};

export const getFailedSyncCount = async () => {
  try {
    const r = await execSQL(`SELECT COUNT(*) as count FROM sync_queue WHERE attempts >= 5`);
    return r.rows._array?.[0]?.count || 0;
  } catch (e) {
    return 0;
  }
};

export const resetFailedSyncItems = async () => {
  await execSQL(`UPDATE sync_queue SET attempts = 0 WHERE attempts >= 5`);
  notifyDataChanged('sync_queue');
};

export const getSetting = async (key, defaultValue) => {
  try {
    const r = await execSQL("SELECT value FROM sync_meta WHERE key = ?", [key]);
    if (r.rows._array && r.rows._array.length > 0) return r.rows._array[0].value;
    return defaultValue;
  } catch (e) { return defaultValue; }
};

export const saveSetting = async (key, value) => {
  try {
    await execSQL("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", [key, String(value)]);
  } catch (e) { }
};

const createTables = async () => {
  await execSQL(`CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS sync_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, operation_group_id TEXT, table_name TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT, record_id TEXT, attempts INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, project_id TEXT)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS operations_log (id TEXT PRIMARY KEY NOT NULL, operation_group_id TEXT, sync_queue_id INTEGER, actor_user_id TEXT, actor_name TEXT, actor_role TEXT, operation_type TEXT NOT NULL, table_name TEXT NOT NULL, entity_name TEXT, record_id TEXT, reference_text TEXT, message_ar TEXT NOT NULL, old_values TEXT, new_values TEXT, project_id TEXT, phase_id TEXT, source TEXT DEFAULT 'sqlite', sync_status TEXT DEFAULT 'pending', sync_error TEXT, sync_details TEXT, device_id TEXT, session_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, synced_at TEXT)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, name TEXT, username TEXT, role TEXT, phone TEXT, password_hash TEXT, push_token TEXT, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS pos_customers (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, name TEXT, owner_name TEXT, phone TEXT, city TEXT, credit_limit REAL DEFAULT 0, credit_used REAL DEFAULT 0, is_blocked INTEGER DEFAULT 0, assigned_agent_id TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS card_categories (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, name TEXT, price REAL DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, batch_number TEXT, category_id TEXT, serial_number TEXT, total_cards INTEGER DEFAULT 0, available_cards INTEGER DEFAULT 0, received_date TEXT, status TEXT DEFAULT 'active', active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, invoice_number TEXT, pos_id TEXT, agent_id TEXT, type TEXT, total_amount REAL DEFAULT 0, net_amount REAL DEFAULT 0, paid_amount REAL DEFAULT 0, status TEXT DEFAULT 'pending', notes TEXT, invoice_date TEXT, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0, notified_overdue INTEGER DEFAULT 0, notified_overdue_warning INTEGER DEFAULT 0, discount_requested_value REAL DEFAULT 0, discount_applied_value REAL DEFAULT 0, discount_status TEXT DEFAULT 'none', discount_requested_reason TEXT, discount_requested_by TEXT, discount_approved_by TEXT, discount_approved_at TEXT, is_deleted INTEGER DEFAULT 0, deleted_at TEXT, deleted_by TEXT, delete_reason TEXT)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS invoice_items (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, invoice_id TEXT, category_id TEXT, batch_id TEXT, wallet_id TEXT, quantity INTEGER DEFAULT 0, unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`DROP INDEX IF EXISTS idx_invoice_items_unique_batch`);
  await execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_items_safe_unique ON invoice_items (invoice_id, batch_id, wallet_id, category_id, unit_price)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, collection_number TEXT, agent_id TEXT, pos_id TEXT, invoice_id TEXT, amount REAL DEFAULT 0, method TEXT DEFAULT 'cash', reference_number TEXT, status TEXT DEFAULT 'pending', approved_at TEXT, rejection_reason TEXT, collection_date TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS agent_wallets (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, agent_id TEXT, batch_id TEXT, category_id TEXT, total_cards INTEGER DEFAULT 0, sold_cards INTEGER DEFAULT 0, issued_by TEXT, notes TEXT, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS supplies (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, supply_number TEXT, user_id TEXT, amount REAL DEFAULT 0, notes TEXT, type TEXT DEFAULT 'deposit', created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS invoice_notifications_log (
    id TEXT PRIMARY KEY NOT NULL,
    invoice_id TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    recipient_user_id TEXT,
    recipient_role TEXT,
    project_id TEXT,
    phase_id TEXT,
    delivery_status TEXT DEFAULT 'pending',
    error_message TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await execSQL(`DELETE FROM invoice_notifications_log WHERE notification_type = 'overdue' AND id NOT IN (SELECT MIN(id) FROM invoice_notifications_log WHERE notification_type = 'overdue' GROUP BY invoice_id, notification_type, COALESCE(project_id, ''), COALESCE(phase_id, ''))`);
  await execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_notifications_log_unique ON invoice_notifications_log (invoice_id, notification_type, recipient_user_id, recipient_role, project_id, phase_id)`);
  await execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_notifications_log_overdue_once ON invoice_notifications_log (invoice_id, notification_type, COALESCE(project_id, ''), COALESCE(phase_id, '')) WHERE notification_type = 'overdue'`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoice_notifications_log_invoice ON invoice_notifications_log (invoice_id, notification_type, created_at DESC)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS app_notifications (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, user_id TEXT, title TEXT, body TEXT, type TEXT, reference_id TEXT, event_key TEXT, route TEXT, params TEXT, is_read INTEGER DEFAULT 0, created_at TEXT)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_app_notifications_event_key ON app_notifications(project_id, event_key, created_at DESC)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS app_permissions (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, screen_name TEXT NOT NULL, can_view INTEGER DEFAULT 0, can_add INTEGER DEFAULT 0, can_edit INTEGER DEFAULT 0, can_delete INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS invoice_discount_approvals (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, invoice_id TEXT NOT NULL, requested_by TEXT, requested_value REAL DEFAULT 0, requested_reason TEXT, applied_value REAL DEFAULT 0, approved_by TEXT, approved_at TEXT, status TEXT NOT NULL, decision_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS project (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, license_number TEXT, owner_name TEXT, owner_phone TEXT, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS phases (id TEXT PRIMARY KEY NOT NULL, project_id TEXT, name TEXT NOT NULL, description TEXT, start_date TEXT, end_date TEXT, target_new_pos INTEGER DEFAULT 0, expected_total_sales REAL DEFAULT 0, expected_total_collections REAL DEFAULT 0, status TEXT DEFAULT 'active', created_by TEXT, created_at TEXT, closed_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS phase_invoice_carryforwards (id TEXT PRIMARY KEY NOT NULL, invoice_id TEXT NOT NULL, project_id TEXT, source_phase_id TEXT, target_phase_id TEXT NOT NULL, invoice_number TEXT, net_amount REAL DEFAULT 0, paid_amount REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_carryforwards_invoice_target ON phase_invoice_carryforwards(invoice_id, target_phase_id)`);
  await execSQL(`CREATE INDEX IF NOT EXISTS idx_phase_carryforwards_source_target ON phase_invoice_carryforwards(source_phase_id, target_phase_id, project_id)`);
};

const resetDatabaseOnce = async () => {
  try {
    await execSQL(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)`);
    const r = await execSQL("SELECT value FROM app_config WHERE key='db_initialized'");
    const initialized = r.rows._array[0]?.value === '8';
    if (!initialized) {
      const tables = ['users', 'pos_customers', 'card_categories', 'batches', 'invoices', 'invoice_items', 'collections', 'agent_wallets', 'sync_queue', 'sync_meta', 'supplies', 'invoice_notifications_log', 'app_permissions', 'project', 'phases', 'operations_log', 'phase_invoice_carryforwards'];
      for (const t of tables) await execSQL(`DROP TABLE IF EXISTS ${t}`);
      await execSQL("INSERT OR REPLACE INTO app_config (key,value) VALUES ('db_initialized','8')");
    }
  } catch (e) { console.log("RESET ERROR:", e); }
};

export const initDatabase = async () => {
  if (_initPromise) {
    console.log("⏳ initDatabase: already running or done, returning shared promise.");
    return _initPromise;
  }
  
  console.log("🚀 initDatabase: START");
  _initPromise = (async () => {
    try {
      await resetDatabaseOnce();
      await createTables();
      const migrations = [
        { t: 'invoices', c: 'active', d: 'INTEGER DEFAULT 1' },
        { t: 'pos_customers', c: 'active', d: 'INTEGER DEFAULT 1' },
        { t: 'pos_customers', c: 'is_blocked', d: 'INTEGER DEFAULT 0' },
        { t: 'users', c: 'active', d: 'INTEGER DEFAULT 1' },
        { t: 'card_categories', c: 'active', d: 'INTEGER DEFAULT 1' },
        { t: 'batches', c: 'active', d: 'INTEGER DEFAULT 1' },
        { t: 'batches', c: 'is_deleted', d: 'INTEGER DEFAULT 0' },
        { t: 'batches', c: 'deleted_at', d: 'TEXT' },
        { t: 'batches', c: 'deleted_by', d: 'TEXT' },
        { t: 'batches', c: 'delete_reason', d: 'TEXT' },
        { t: 'collections', c: 'active', d: 'INTEGER DEFAULT 1' },
        { t: 'invoices', c: 'notified_overdue', d: 'INTEGER DEFAULT 0' },
        { t: 'invoices', c: 'notified_overdue_warning', d: 'INTEGER DEFAULT 0' },
        { t: 'invoices', c: 'approved_amount', d: 'REAL DEFAULT 0' },
        { t: 'invoices', c: 'due_date', d: 'TEXT' },
        { t: 'invoices', c: 'approval_notes', d: 'TEXT' },
        { t: 'invoices', c: 'discount_requested_value', d: 'REAL DEFAULT 0' },
        { t: 'invoices', c: 'discount_applied_value', d: 'REAL DEFAULT 0' },
        { t: 'invoices', c: 'discount_status', d: "TEXT DEFAULT 'none'" },
        { t: 'invoices', c: 'discount_requested_reason', d: 'TEXT' },
        { t: 'invoices', c: 'discount_requested_by', d: 'TEXT' },
        { t: 'invoices', c: 'discount_approved_by', d: 'TEXT' },
        { t: 'invoices', c: 'discount_approved_at', d: 'TEXT' },
        { t: 'invoices', c: 'is_deleted', d: 'INTEGER DEFAULT 0' },
        { t: 'invoices', c: 'deleted_at', d: 'TEXT' },
        { t: 'invoices', c: 'deleted_by', d: 'TEXT' },
        { t: 'invoices', c: 'delete_reason', d: 'TEXT' },
        { t: 'collections', c: 'approval_notes', d: 'TEXT' },
        { t: 'collections', c: 'approved_by', d: 'TEXT' },
        { t: 'collections', c: 'supply_id', d: 'TEXT' },
        { t: 'supplies', c: 'status', d: "TEXT DEFAULT 'pending'" },
        { t: 'supplies', c: 'approved_at', d: 'TEXT' },
        { t: 'supplies', c: 'approval_notes', d: 'TEXT' },
        { t: 'supplies', c: 'agent_id', d: 'TEXT' },
        { t: 'app_notifications', c: 'type', d: 'TEXT' },
        { t: 'app_notifications', c: 'reference_id', d: 'TEXT' },
        { t: 'app_notifications', c: 'event_key', d: 'TEXT' },
        { t: 'invoices', c: 'phase_id', d: 'TEXT' },
        { t: 'collections', c: 'phase_id', d: 'TEXT' },
        { t: 'supplies', c: 'phase_id', d: 'TEXT' },
        { t: 'agent_wallets', c: 'phase_id', d: 'TEXT' },
        { t: 'batches', c: 'phase_id', d: 'TEXT' },
        { t: 'invoice_items', c: 'phase_id', d: 'TEXT' },
        { t: 'sync_queue', c: 'project_id', d: 'TEXT' },
        { t: 'users', c: 'project_id', d: 'TEXT' },
        { t: 'users', c: 'push_token', d: 'TEXT' },
        { t: 'pos_customers', c: 'project_id', d: 'TEXT' },
        { t: 'card_categories', c: 'project_id', d: 'TEXT' },
        { t: 'batches', c: 'project_id', d: 'TEXT' },
        { t: 'invoices', c: 'project_id', d: 'TEXT' },
        { t: 'invoice_items', c: 'project_id', d: 'TEXT' },
        { t: 'collections', c: 'project_id', d: 'TEXT' },
        { t: 'agent_wallets', c: 'project_id', d: 'TEXT' },
        { t: 'supplies', c: 'project_id', d: 'TEXT' },
        { t: 'app_notifications', c: 'project_id', d: 'TEXT' },
        { t: 'app_permissions', c: 'project_id', d: 'TEXT' },
        { t: 'invoice_discount_approvals', c: 'project_id', d: 'TEXT' },
        { t: 'sync_queue', c: 'operation_group_id', d: 'TEXT' },
        { t: 'operations_log', c: 'operation_group_id', d: 'TEXT' },
        { t: 'operations_log', c: 'sync_queue_id', d: 'INTEGER' },
        { t: 'operations_log', c: 'actor_user_id', d: 'TEXT' },
        { t: 'operations_log', c: 'actor_name', d: 'TEXT' },
        { t: 'operations_log', c: 'actor_role', d: 'TEXT' },
        { t: 'operations_log', c: 'operation_type', d: "TEXT DEFAULT 'edit'" },
        { t: 'operations_log', c: 'table_name', d: 'TEXT' },
        { t: 'operations_log', c: 'entity_name', d: 'TEXT' },
        { t: 'operations_log', c: 'record_id', d: 'TEXT' },
        { t: 'operations_log', c: 'reference_text', d: 'TEXT' },
        { t: 'operations_log', c: 'message_ar', d: 'TEXT' },
        { t: 'operations_log', c: 'old_values', d: 'TEXT' },
        { t: 'operations_log', c: 'new_values', d: 'TEXT' },
        { t: 'operations_log', c: 'project_id', d: 'TEXT' },
        { t: 'operations_log', c: 'phase_id', d: 'TEXT' },
        { t: 'operations_log', c: 'source', d: "TEXT DEFAULT 'sqlite'" },
        { t: 'operations_log', c: 'sync_status', d: "TEXT DEFAULT 'pending'" },
        { t: 'operations_log', c: 'sync_error', d: 'TEXT' },
        { t: 'operations_log', c: 'sync_details', d: 'TEXT' },
        { t: 'operations_log', c: 'device_id', d: 'TEXT' },
        { t: 'operations_log', c: 'session_id', d: 'TEXT' },
        { t: 'operations_log', c: 'created_at', d: 'TEXT' },
        { t: 'operations_log', c: 'updated_at', d: 'TEXT' },
        { t: 'operations_log', c: 'synced_at', d: 'TEXT' },
      ];
      for (const m of migrations) {
        try {
          const info = await execSQL(`PRAGMA table_info(${m.t})`);
          if (!(info.rows._array || []).map(c => c.name).includes(m.c)) {
            await execSQL(`ALTER TABLE ${m.t} ADD COLUMN ${m.c} ${m.d}`);
          }
        } catch (e) { }
      }
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_app_notifications_event_key ON app_notifications(project_id, event_key, created_at DESC)`);
      await execSQL(`UPDATE invoices
        SET discount_requested_value = COALESCE(discount_requested_value, 0),
            discount_applied_value = COALESCE(discount_applied_value, 0),
            net_amount = MAX(0, COALESCE(total_amount, 0) - COALESCE(discount_applied_value, 0))
      `);
      await execSQL(`INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('last_pull', '2000-01-01T00:00:00Z')`);
      await execSQL(`UPDATE sync_queue SET attempts = 0 WHERE COALESCE(attempts,0) >= 5`);
      await execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_operations_log_sync_queue ON operations_log(sync_queue_id)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_operations_log_actor_created ON operations_log(actor_user_id, created_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_operations_log_project_phase ON operations_log(project_id, phase_id, created_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_operations_log_status ON operations_log(sync_status, created_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoices_reports_project_active_date ON invoices(project_id, active, invoice_date DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoices_reports_project_phase ON invoices(project_id, phase_id, active)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoices_reports_agent ON invoices(project_id, agent_id, active)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoice_items_reports_invoice ON invoice_items(invoice_id)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoice_items_reports_batch ON invoice_items(batch_id)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_collections_reports_invoice_status ON collections(project_id, invoice_id, active, status)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_collections_reports_pending_agent ON collections(project_id, status, active, agent_id, collection_date DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_collections_reports_approved_cashier ON collections(project_id, status, active, approved_by, approved_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_batches_reports_project_active ON batches(project_id, active, created_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_agent_wallets_reports_batch_project ON agent_wallets(project_id, batch_id, created_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_users_reports_project_role_active ON users(project_id, role, active)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_phases_reports_project_created ON phases(project_id, created_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_sync_queue_project_attempts_created ON sync_queue(project_id, attempts, created_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoices_list_project_phase_status_date ON invoices(project_id, phase_id, status, invoice_date DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_collections_list_project_phase_status_date ON collections(project_id, phase_id, status, collection_date DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_batches_list_project_phase_created ON batches(project_id, phase_id, created_at DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_collections_supply_candidates ON collections(project_id, status, active, supply_id, collection_date DESC)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoice_items_batch_invoice ON invoice_items(batch_id, invoice_id)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_invoice_items_wallet_invoice ON invoice_items(wallet_id, invoice_id)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_agent_wallets_batch_phase_project ON agent_wallets(batch_id, phase_id, project_id)`);
      await execSQL(`CREATE INDEX IF NOT EXISTS idx_agent_wallets_category_project ON agent_wallets(category_id, project_id)`);
      try {
        const { backfillOperationsFromSyncQueue } = require('./operationLogger');
        await backfillOperationsFromSyncQueue(500);
      } catch (e) { }

      // Seed default project and phase
      const { ensureDefaultProjectAndPhase } = require('./phaseService');
      await ensureDefaultProjectAndPhase();

      setDbReady(true);
      console.log("✅ initDatabase: DONE");
      notifyDataChanged('db_ready');
      return true;
    } catch (err) {
      setDbReady(false);
      console.log(`❌ initDatabase: FAILED`, err);
      _initPromise = null; // Allow caller to try again if they want
      throw err;
    }
  })();
  return _initPromise;
};
