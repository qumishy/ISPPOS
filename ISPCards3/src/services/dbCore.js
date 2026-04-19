import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabase('app.db');

let _online = false;
let _dataListeners = [];

export const setOnlineStatus = (status) => {
  _online = !!status;
};

export const isDbOnline = () => _online;

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

export const execSQL = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(
          sql,
          params,
          (_, result) => {
            resolve(result);
          },
          (_, error) => {
            console.log("❌ SQL ERROR IN QUERY:", sql);
            console.log("❌ SQLError:", error);
            reject(error);
            return true; // Return true to ROLLBACK properly and release SQLite lock!
          }
        );
      },
      (err) => {
        console.log("❌ TX ERROR:", err);
        reject(err);
      }
    );
  });

export const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });

export const addToSyncQueue = async (tableName, operation, payload, recordId = null) => {
  await execSQL(
    `INSERT INTO sync_queue (table_name, operation, payload, record_id, attempts, created_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'))`,
    [tableName, operation, JSON.stringify(payload || {}), recordId]
  );
  notifyDataChanged('sync_queue');
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
  await execSQL(`CREATE TABLE IF NOT EXISTS sync_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT, record_id TEXT, attempts INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, name TEXT, username TEXT, role TEXT, phone TEXT, password_hash TEXT, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS pos_customers (id TEXT PRIMARY KEY NOT NULL, name TEXT, owner_name TEXT, phone TEXT, city TEXT, credit_limit REAL DEFAULT 0, credit_used REAL DEFAULT 0, is_blocked INTEGER DEFAULT 0, assigned_agent_id TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS card_categories (id TEXT PRIMARY KEY NOT NULL, name TEXT, price REAL DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY NOT NULL, batch_number TEXT, category_id TEXT, serial_number TEXT, total_cards INTEGER DEFAULT 0, available_cards INTEGER DEFAULT 0, received_date TEXT, status TEXT DEFAULT 'active', active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY NOT NULL, invoice_number TEXT, pos_id TEXT, agent_id TEXT, type TEXT, total_amount REAL DEFAULT 0, net_amount REAL DEFAULT 0, paid_amount REAL DEFAULT 0, status TEXT DEFAULT 'pending', notes TEXT, invoice_date TEXT, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0, notified_overdue INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS invoice_items (id TEXT PRIMARY KEY NOT NULL, invoice_id TEXT, category_id TEXT, batch_id TEXT, wallet_id TEXT, from_card TEXT, to_card TEXT, quantity INTEGER DEFAULT 0, unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY NOT NULL, collection_number TEXT, agent_id TEXT, pos_id TEXT, invoice_id TEXT, amount REAL DEFAULT 0, method TEXT DEFAULT 'cash', reference_number TEXT, status TEXT DEFAULT 'pending', approved_at TEXT, rejection_reason TEXT, collection_date TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS agent_wallets (id TEXT PRIMARY KEY NOT NULL, agent_id TEXT, batch_id TEXT, category_id TEXT, from_card TEXT, to_card TEXT, total_cards INTEGER DEFAULT 0, sold_cards INTEGER DEFAULT 0, issued_by TEXT, notes TEXT, created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS supplies (id TEXT PRIMARY KEY NOT NULL, supply_number TEXT, user_id TEXT, amount REAL DEFAULT 0, notes TEXT, type TEXT DEFAULT 'deposit', created_at TEXT, synced INTEGER DEFAULT 0)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS app_notifications (id TEXT PRIMARY KEY NOT NULL, user_id TEXT, title TEXT, body TEXT, route TEXT, params TEXT, is_read INTEGER DEFAULT 0, created_at TEXT)`);
  await execSQL(`CREATE TABLE IF NOT EXISTS app_permissions (id TEXT PRIMARY KEY NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, screen_name TEXT NOT NULL, can_view INTEGER DEFAULT 0, can_add INTEGER DEFAULT 0, can_edit INTEGER DEFAULT 0, can_delete INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, synced INTEGER DEFAULT 0)`);
};

const resetDatabaseOnce = async () => {
  try {
    await execSQL(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)`);
    const r = await execSQL("SELECT value FROM app_config WHERE key='db_initialized'");
    const initialized = r.rows._array[0]?.value === '6';
    if (!initialized) {
      const tables = ['users', 'pos_customers', 'card_categories', 'batches', 'invoices', 'invoice_items', 'collections', 'agent_wallets', 'sync_queue', 'sync_meta', 'supplies', 'app_permissions'];
      for (const t of tables) await execSQL(`DROP TABLE IF EXISTS ${t}`);
      await execSQL("INSERT OR REPLACE INTO app_config (key,value) VALUES ('db_initialized','6')");
    }
  } catch (e) { console.log("RESET ERROR:", e); }
};

let _initPromise = null;

export const initDatabase = async () => {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    let retries = 3;
    while (retries > 0) {
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
        { t: 'collections', c: 'active', d: 'INTEGER DEFAULT 1' },
        { t: 'invoices', c: 'notified_overdue', d: 'INTEGER DEFAULT 0' },
        { t: 'invoices', c: 'approved_amount', d: 'REAL DEFAULT 0' },
        { t: 'invoices', c: 'due_date', d: 'TEXT' },
        { t: 'invoices', c: 'approval_notes', d: 'TEXT' },
        { t: 'collections', c: 'approval_notes', d: 'TEXT' },
        { t: 'collections', c: 'approved_by', d: 'TEXT' },
        { t: 'collections', c: 'supply_id', d: 'TEXT' },
        { t: 'supplies', c: 'status', d: "TEXT DEFAULT 'pending'" },
        { t: 'supplies', c: 'approved_at', d: 'TEXT' },
        { t: 'supplies', c: 'approval_notes', d: 'TEXT' },
        { t: 'supplies', c: 'agent_id', d: 'TEXT' }
      ];
      for (const m of migrations) {
        try {
          const info = await execSQL(`PRAGMA table_info(${m.t})`);
          if (!(info.rows._array || []).map(c => c.name).includes(m.c)) {
            await execSQL(`ALTER TABLE ${m.t} ADD COLUMN ${m.c} ${m.d}`);
          }
        } catch (e) { }
      }
      await execSQL(`INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('last_pull', '2000-01-01T00:00:00Z')`);
      await execSQL(`UPDATE sync_queue SET attempts = 0 WHERE COALESCE(attempts,0) >= 5`);
      console.log("✅ Database Initialized Fully.");
      notifyDataChanged('db_ready');
      return true;
      } catch (err) {
        retries--;
        console.log(`❌ DB Init Failed. Retries left: ${retries}`, err);
        if (retries === 0) {
          _initPromise = null;
          throw err;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  })();
  return _initPromise;
};
