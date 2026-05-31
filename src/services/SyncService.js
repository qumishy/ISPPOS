import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { execSQL, setOnlineStatus, getSyncQueueCount, notifyDataChanged } from './database';
import { saveNotificationHistory } from './NotificationService';
import {
  markOperationSyncing,
  markOperationSynced,
  markOperationSyncFailed,
  ensureOperationLogForSyncQueueId,
  backfillOperationsFromSyncQueue,
} from './operationLogger';

let _isOnline = false;
let _isSyncing = false;
let _unsubscribe = null;
let _syncInterval = null;
let _listeners = [];
let _currentUser = null;
let _realtimeChannel = null;
let _initialSyncPromise = null;
let _INITIAL_SYNC_IN_PROGRESS = false;
let _INITIAL_SYNC_READY = false;

export const isInitialSyncInProgress = () => _INITIAL_SYNC_IN_PROGRESS;
export const isInitialSyncReady = () => _INITIAL_SYNC_READY;
export const setInitialSyncReady = (v) => { _INITIAL_SYNC_READY = !!v; };

export async function hasLocalRequiredData(projectId) {
  if (!projectId) return false;
  try {
    const checks = await Promise.all([
      execSQL(`SELECT COUNT(*) as c FROM project WHERE id = ?`, [projectId]),
      execSQL(`SELECT COUNT(*) as c FROM users WHERE project_id = ?`, [projectId]),
      execSQL(`SELECT COUNT(*) as c FROM pos_customers WHERE project_id = ?`, [projectId]),
      execSQL(`SELECT COUNT(*) as c FROM card_categories WHERE project_id = ?`, [projectId]),
      execSQL(`SELECT COUNT(*) as c FROM phases WHERE project_id = ?`, [projectId]),
    ]);
    return checks.every(r => Number(r.rows._array?.[0]?.c || 0) > 0);
  } catch (e) {
    return false;
  }
}

async function getUserName(userId, fallback = 'مستخدم') {
  if (!userId) return fallback;
  if (!_currentUser?.project_id) return fallback;
  try {
    const r = await execSQL(`SELECT name FROM users WHERE id = ? AND project_id = ? LIMIT 1`, [userId, _currentUser.project_id]);
    return r.rows._array?.[0]?.name || fallback;
  } catch (e) {
    return fallback;
  }
}

async function getPOSName(posId, fallback = 'نقطة بيع غير محددة') {
  if (!posId) return fallback;
  if (!_currentUser?.project_id) return fallback;
  try {
    const r = await execSQL(`SELECT name FROM pos_customers WHERE id = ? AND project_id = ? LIMIT 1`, [posId, _currentUser.project_id]);
    return r.rows._array?.[0]?.name || fallback;
  } catch (e) {
    return fallback;
  }
}

function normalizeRejectionReason(reason) {
  const txt = String(reason || '').toLowerCase();
  if (!txt) return 'غير محدد';
  if (txt.includes('net.http_post') || txt.includes('http_post')) {
    return 'تعذر إرسال إشعار الشبكة. يرجى المحاولة لاحقاً.';
  }
  return String(reason);
}

export function setCurrentUser(user) {
  _currentUser = user;
  // عند تعيين المستخدم، أعد تشغيل الاشتراك الفوري
  if (user && _isOnline) {
    startRealtimeSubscription();
  }
}

// ── الاشتراك الفوري في Supabase Realtime ──
function startRealtimeSubscription() {
  // إلغاء الاشتراك السابق
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  const user = _currentUser;
  if (!user?.project_id) {
    console.log('[Realtime] blocked subscription without project_id');
    return;
  }

  _realtimeChannel = supabase
    .channel('db-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoices' }, async (payload) => {
      const inv = payload.new;
      if (!inv.project_id || inv.project_id !== user.project_id) return;
      // لا تنبه على السجلات التي أنشأها المستخدم نفسه
      if (inv.agent_id === user.id) return;

      if (user.role === 'admin' || user.role === 'cashier') {
        const actorName = await getUserName(inv.agent_id, 'مندوب');
        const posName = await getPOSName(inv.pos_id);
        await saveNotificationHistory(
          '📄 فاتورة جديدة وردت',
          `${actorName} سجّل عملية بيع لنقطة (${posName}) بقيمة ${Number(inv.net_amount || inv.total_amount || 0)} ر.ي.`,
          { project_id: user.project_id }
        );
      }
      // سحب فوري لتحديث الواجهة
      try { await pullRemoteChanges(user); notifyListeners(); } catch (e) { }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collections' }, async (payload) => {
      const col = payload.new;
      if (!col.project_id || col.project_id !== user.project_id) return;
      if (col.agent_id === user.id) return;

      if (user.role === 'admin' || user.role === 'cashier') {
        const actorName = await getUserName(col.agent_id, 'مندوب');
        const posName = await getPOSName(col.pos_id);
        await saveNotificationHistory(
          '📥 تحصيل جديد بانتظار الاعتماد',
          `${actorName} سجّل تحصيلاً من (${posName}) بقيمة ${col.amount} ر.ي.`,
          { project_id: user.project_id }
        );
      }
      try { await pullRemoteChanges(user); notifyListeners(); } catch (e) { }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_wallets' }, async (payload) => {
      const aw = payload.new;
      if (!aw.project_id || aw.project_id !== user.project_id) return;
      const issuerName = await getUserName(aw.issued_by, 'الإدارة');
      // إشعار المندوب فقط عند توزيع محفظة له
      if (user.role === 'agent' && aw.agent_id === user.id) {
        await saveNotificationHistory(
          '🗂️ محفظة جديدة وصلتك',
          `${issuerName} وزّع ${aw.total_cards} ورقة على محفظتك.`,
          { project_id: user.project_id }
        );
      }
      if (user.role === 'admin' && aw.issued_by !== user.id) {
        const agentName = await getUserName(aw.agent_id, 'مندوب');
        await saveNotificationHistory(
          '🗂️ توزيع مخزون',
          `${issuerName} وزّع ${aw.total_cards} ورقة للمندوب ${agentName}.`,
          { project_id: user.project_id }
        );
      }
      // سحب فوري لتحديث محافظ المندوب
      try { await pullRemoteChanges(user); notifyListeners(); } catch (e) { }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_wallets' }, async (payload) => {
      if (!payload.new.project_id || payload.new.project_id !== user.project_id) return;
      // تحديث المحفظة (مثلاً عند الاسترداد)
      try { await pullRemoteChanges(user); notifyListeners(); } catch (e) { }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'invoices' }, async (payload) => {
      if (!payload.new.project_id || payload.new.project_id !== user.project_id) return;
      // تحديث الفاتورة فوراً في الجهاز
      const inv = sanitizePayload('invoices', payload.new);
      try {
        await applyLocalRow('invoices', inv);
        notifyDataChanged('invoices');
      } catch (e) { }
      try { await pullRemoteChanges(user); notifyListeners(); } catch (e) { }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'collections' }, async (payload) => {
      if (!payload.new.project_id || payload.new.project_id !== user.project_id) return;
      const col = sanitizePayload('collections', payload.new);
      const cols = Object.keys(col).join(',');
      const ph = Object.keys(col).map(() => '?').join(',');
      const vals = Object.values(col).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : (v === 'true' ? 1 : v === 'false' ? 0 : v));
      try {
        await execSQL(`INSERT OR REPLACE INTO collections (${cols},synced) VALUES (${ph},1)`, vals);
        notifyDataChanged('collections');
      } catch (e) { }

      // تنبيه المندوب عند اعتماد أو رفض تحصيله
      if (user.role === 'agent' && col.agent_id === user.id) {
        const actorName = await getUserName(col.approved_by, 'الإدارة');
        const posName = await getPOSName(col.pos_id);
        // فحص الحالة المحلية بدلاً من old (لأن Supabase لا يرسلها افتراضياً)
        try {
          const localR = await execSQL(`SELECT status FROM collections WHERE id=?`, [col.id]);
          const localStatus = localR.rows._array[0]?.status;

          if (localStatus === 'pending' && col.status === 'approved') {
            await saveNotificationHistory('✅ تم اعتماد تحصيلك', `${actorName} اعتمد تحصيلاً من (${posName}) بقيمة ${col.amount} ر.ي.`, { project_id: user.project_id });
          } else if (localStatus === 'pending' && col.status === 'rejected') {
            await saveNotificationHistory('❌ تم رفض تحصيلك', `${actorName} رفض تحصيلاً من (${posName}) بقيمة ${col.amount} ر.ي. السبب: ${normalizeRejectionReason(col.rejection_reason)}`, { project_id: user.project_id });
          } else if (col.status === 'approved' && localStatus !== 'approved') {
            await saveNotificationHistory('✅ تم اعتماد تحصيلك', `${actorName} اعتمد تحصيلاً من (${posName}) بقيمة ${col.amount} ر.ي.`, { project_id: user.project_id });
          } else if (col.status === 'rejected' && localStatus !== 'rejected') {
            await saveNotificationHistory('❌ تم رفض تحصيلك', `${actorName} رفض تحصيلاً من (${posName}) بقيمة ${col.amount} ر.ي. السبب: ${normalizeRejectionReason(col.rejection_reason)}`, { project_id: user.project_id });
          }
        } catch (e) {
          // إذا لم يوجد محلياً، نرسل التنبيه مباشرة
          if (col.status === 'approved') {
            await saveNotificationHistory('✅ تم اعتماد تحصيلك', `${actorName} اعتمد تحصيلاً من (${posName}) بقيمة ${col.amount} ر.ي.`, { project_id: user.project_id });
          } else if (col.status === 'rejected') {
            await saveNotificationHistory('❌ تم رفض تحصيلك', `${actorName} رفض تحصيلاً من (${posName}) بقيمة ${col.amount} ر.ي. السبب: ${normalizeRejectionReason(col.rejection_reason)}`, { project_id: user.project_id });
          }
        }
      }
      try { await pullRemoteChanges(user); notifyListeners(); } catch (e) { }
    })
    .subscribe((status) => {
      console.log('[Realtime] subscription status:', status);
    });

  console.log('[Realtime] subscribed to invoices + collections changes');
}

export const TABLE_FIELDS = {
  pos_customers: 'id,project_id,name,owner_name,phone,city,credit_limit,credit_used,is_blocked,assigned_agent_id,notes,active,created_at',
  card_categories: 'id,project_id,name,price,is_active,active,created_at',
  batches: 'id,project_id,batch_number,category_id,serial_number,total_cards,available_cards,received_date,status,active,created_at',
  users: 'id,project_id,name,username,role,phone,is_active,password_hash,created_at,push_token',
  invoices: 'id,project_id,invoice_number,pos_id,agent_id,type,total_amount,net_amount,paid_amount,approved_amount,status,notes,invoice_date,due_date,approval_notes,active,phase_id,created_at,discount_requested_value,discount_applied_value,discount_status,discount_requested_reason,discount_requested_by,discount_approved_by,discount_approved_at',
  invoice_items: 'id,project_id,invoice_id,category_id,batch_id,wallet_id,quantity,unit_price,total_price,created_at',
  collections: 'id,project_id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,approved_at,approved_by,approval_notes,rejection_reason,collection_date,notes,active,supply_id,phase_id,created_at',
  agent_wallets: 'id,project_id,agent_id,batch_id,category_id,total_cards,sold_cards,issued_by,notes,phase_id,created_at',
  supplies: 'id,project_id,supply_number,user_id,agent_id,amount,notes,type,status,approved_at,approval_notes,phase_id,created_at',
  app_permissions: 'id,project_id,entity_type,entity_id,screen_name,can_view,can_add,can_edit,can_delete,created_at,updated_at',
  project: 'id,name,license_number,owner_name,owner_phone,created_at',
  phases: 'id,project_id,name,description,start_date,end_date,target_new_pos,expected_total_sales,expected_total_collections,status,created_by,created_at,closed_at'
};

const REQUIRED_INITIAL_SYNC_TABLES = [
  'project',
  'phases',
  'app_permissions',
  'users',
  'pos_customers',
  'card_categories',
  'batches',
  'agent_wallets',
  'invoices',
  'invoice_items',
  'collections',
  'supplies',
];

const INITIAL_TABLE_PROGRESS_LABELS_AR = {
  project: 'جاري جلب بيانات المشروع',
  phases: 'جاري جلب المرحلة النشطة',
  app_permissions: 'جاري جلب صلاحيات المستخدمين',
  users: 'جاري جلب المستخدمين',
  pos_customers: 'جاري جلب نقاط البيع',
  card_categories: 'جاري جلب فئات الكروت',
  batches: 'جاري جلب الدفعات',
  agent_wallets: 'جاري جلب المحافظ',
  invoices: 'جاري مزامنة الفواتير',
  invoice_items: 'جاري مزامنة عناصر الفواتير',
  collections: 'جاري مزامنة التحصيلات',
  supplies: 'جاري مزامنة التوريدات',
};

// الأعمدة الموجودة في SQLite فقط وليست في Supabase — يجب حذفها من أي payload قبل الإرسال
const SQLITE_ONLY_FIELDS = {
  invoices:        ['synced', 'notified_overdue', 'notified_overdue_warning', 'is_deleted', 'deleted_at', 'deleted_by', 'delete_reason', 'sync_status', 'pending_sync', 'pending_upload'],
  agent_wallets:   ['synced', 'remaining_cards'], // remaining_cards هو GENERATED ALWAYS في Supabase
  collections:     ['synced'],
  supplies:        ['synced'],
  users:           ['synced'],
  batches:         ['synced', 'is_deleted', 'deleted_at', 'deleted_by', 'delete_reason'],
  pos_customers:   ['synced'],
  card_categories: ['synced'],
  invoice_items:   ['synced'],
  app_permissions: ['synced'],
  project:         ['synced'],
  phases:          ['synced'],
};
const GLOBAL_LOCAL_ONLY_FIELDS = [
  'synced',
  'sync_status',
  'pending_sync',
  'pending_upload',
  'local_id',
  'local_only',
];

function sanitizePayload(tableName, payload) {
  const clean = { ...(payload || {}) };
  for (const f of GLOBAL_LOCAL_ONLY_FIELDS) delete clean[f];

  if (tableName === 'batches' && clean.status === 'deleted') {
    delete clean.status;
  }

  if (tableName === 'invoice_items') {
    delete clean.total_price;
  }

  // Remote schema-safe invoice payload:
  // keep local soft-delete fields in SQLite, but never push non-remote columns.
  if (tableName === 'invoices') {
    delete clean.is_deleted;
    delete clean.deleted_at;
    delete clean.deleted_by;
    delete clean.delete_reason;
  }

  // حذف جميع الأعمدة SQLite-only لهذا الجدول
  const sqliteOnly = SQLITE_ONLY_FIELDS[tableName] || [];
  for (const f of sqliteOnly) {
    delete clean[f];
  }

  const validFields = TABLE_FIELDS[tableName] ? TABLE_FIELDS[tableName].split(',').map(f => f.trim()) : null;
  if (validFields) {
    for (const key in clean) {
      // is_active يتم تحويله لاحقاً إلى active لذلك يجب السماح بمروره
      if (!validFields.includes(key) && key !== 'is_active') {
        delete clean[key];
      }
    }
  }

  // 🔥 إصلاح مشكلة نوع البيانات مع PostgreSQL
  // 1) SQLite يخزن البولين كـ 0 أو 1، بينما Supabase (Postgres) يتطلب true/false
  const boolFields = ['active', 'is_blocked', 'is_active', 'is_deleted'];
  for (const field of boolFields) {
    if (field in clean && typeof clean[field] === 'number') {
      clean[field] = clean[field] === 1;
    }
  }

  // 2) تحويل النصوص الفارغة في حقول المعرفات (UUID) إلى NULL لتجنب أخطاء سوبابيز
  for (const key in clean) {
    if (key.endsWith('_id') && clean[key] === '') {
      clean[key] = null;
    }
  }

  return clean;
}

const INVOICE_DELETE_ONLY_FIELDS = new Set(['active', 'is_deleted', 'deleted_at', 'deleted_by', 'delete_reason', 'project_id', 'phase_id']);

function isInvoiceSoftDeletePayload(payload) {
  if (!payload || Number(payload.is_deleted) !== 1) return false;
  return Object.keys(payload).every(key => INVOICE_DELETE_ONLY_FIELDS.has(key));
}

async function applyLocalRow(tableName, clean) {
  const cols = Object.keys(clean);
  if (!cols.length || !clean.id) return;

  const vals = Object.values(clean).map(v => {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === 'true') return 1;
    if (v === 'false') return 0;
    return v;
  });

  const existing = await execSQL(`SELECT id FROM ${tableName} WHERE id = ? LIMIT 1`, [clean.id]);
  if (existing.rows._array?.[0]?.id) {
    const setClause = cols.map(col => `${col} = ?`).join(', ');
    await execSQL(`UPDATE ${tableName} SET ${setClause}, synced = 1 WHERE id = ?`, [...vals, clean.id]);
    return;
  }

  const ph = cols.map(() => '?').join(',');
  await execSQL(`INSERT INTO ${tableName} (${cols.join(',')},synced) VALUES (${ph},?)`, [...vals, 1]);
}

async function syncQueueTableExists() {
  try {
    const r = await execSQL(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_queue'"
    );
    return (r.rows._array || []).length > 0;
  } catch (e) {
    return false;
  }
}

async function runInvoiceDueChecks() {
  try {
    const { checkAndSendOverdueInvoiceNotifications } = require('./NotificationService');
    await checkAndSendOverdueInvoiceNotifications(_currentUser);
  } catch (e) { }
}

async function hasPendingLocalWalletMutations(walletId) {
  if (!walletId) return false;

  try {
    const walletQueue = await execSQL(
      `SELECT id FROM sync_queue
       WHERE table_name = 'agent_wallets'
         AND record_id = ?
         AND COALESCE(attempts, 0) < 5
       LIMIT 1`,
      [walletId]
    );
    if ((walletQueue.rows._array || []).length > 0) return true;

    const unsyncedItems = await execSQL(
      `SELECT id FROM invoice_items
       WHERE wallet_id = ?
         AND COALESCE(synced, 0) = 0
       LIMIT 1`,
      [walletId]
    );
    if ((unsyncedItems.rows._array || []).length > 0) return true;

    return false;
  } catch (e) {
    return false;
  }
}

async function hasPendingLocalInvoiceDiscountMutations(invoiceId) {
  if (!invoiceId) return false;
  try {
    const q = await execSQL(
      `SELECT payload FROM sync_queue
       WHERE table_name = 'invoices'
         AND record_id = ?
         AND COALESCE(attempts, 0) < 5
       ORDER BY id DESC
       LIMIT 20`,
      [invoiceId]
    );
    const rows = q.rows._array || [];
    for (const item of rows) {
      let payload = {};
      try { payload = JSON.parse(item.payload || '{}'); } catch (e) { payload = {}; }
      const hasDiscountMutation =
        ('discount_status' in payload) ||
        ('discount_requested_value' in payload) ||
        ('discount_applied_value' in payload) ||
        ('discount_approved_by' in payload) ||
        ('discount_approved_at' in payload) ||
        ('net_amount' in payload);
      if (hasDiscountMutation) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function hasPendingSyncForTableRecord(tableName, recordId) {
  if (!tableName || !recordId) return false;
  try {
    const r = await execSQL(
      `SELECT id
       FROM sync_queue
       WHERE table_name = ?
         AND record_id = ?
         AND COALESCE(attempts, 0) < 5
       LIMIT 1`,
      [tableName, recordId]
    );
    return (r.rows._array || []).length > 0;
  } catch (e) {
    return false;
  }
}

export async function getPendingSyncOwnerIds() {
  const ids = new Set();

  try {
    const q = await execSQL(
      `SELECT table_name, record_id, payload
       FROM sync_queue
       WHERE COALESCE(attempts, 0) < 5
       ORDER BY id ASC`
    );

    for (const item of (q.rows._array || [])) {
      const payload = (() => {
        try { return JSON.parse(item.payload || '{}'); } catch (e) { return {}; }
      })();

      if (item.table_name === 'invoices') {
        const owner = payload.agent_id;
        if (owner) ids.add(String(owner));
        if (!owner && item.record_id) {
          const r = await execSQL(`SELECT agent_id FROM invoices WHERE id = ? LIMIT 1`, [item.record_id]);
          const dbOwner = r.rows._array?.[0]?.agent_id;
          if (dbOwner) ids.add(String(dbOwner));
        }
      }

      if (item.table_name === 'collections') {
        const owner = payload.agent_id;
        if (owner) ids.add(String(owner));
        if (!owner && item.record_id) {
          const r = await execSQL(`SELECT agent_id FROM collections WHERE id = ? LIMIT 1`, [item.record_id]);
          const dbOwner = r.rows._array?.[0]?.agent_id;
          if (dbOwner) ids.add(String(dbOwner));
        }
      }

      if (item.table_name === 'invoice_items') {
        let invoiceId = payload.invoice_id;
        if (!invoiceId && item.record_id) {
          const itemR = await execSQL(`SELECT invoice_id FROM invoice_items WHERE id = ? LIMIT 1`, [item.record_id]);
          invoiceId = itemR.rows._array?.[0]?.invoice_id;
        }
        if (invoiceId) {
          const invR = await execSQL(`SELECT agent_id FROM invoices WHERE id = ? LIMIT 1`, [invoiceId]);
          const dbOwner = invR.rows._array?.[0]?.agent_id;
          if (dbOwner) ids.add(String(dbOwner));
        }
      }

      if (item.table_name === 'agent_wallets') {
        if (payload.issued_by) ids.add(String(payload.issued_by));
        if (payload.agent_id) ids.add(String(payload.agent_id));
        if ((!payload.issued_by && !payload.agent_id) && item.record_id) {
          const r = await execSQL(`SELECT issued_by, agent_id FROM agent_wallets WHERE id = ? LIMIT 1`, [item.record_id]);
          const dbIssuedBy = r.rows._array?.[0]?.issued_by;
          const dbAgentId = r.rows._array?.[0]?.agent_id;
          if (dbIssuedBy) ids.add(String(dbIssuedBy));
          if (dbAgentId) ids.add(String(dbAgentId));
        }
      }

      if (item.table_name === 'supplies') {
        const owner = payload.user_id;
        if (owner) ids.add(String(owner));
        if (!owner && item.record_id) {
          const r = await execSQL(`SELECT user_id FROM supplies WHERE id = ? LIMIT 1`, [item.record_id]);
          const dbOwner = r.rows._array?.[0]?.user_id;
          if (dbOwner) ids.add(String(dbOwner));
        }
      }
    }
  } catch (e) { }

  return Array.from(ids);
}

export async function hasBlockingPendingSyncForUser(nextUserId) {
  if (!nextUserId) return { blocked: false, owners: [] };

  try {
    const pendingCount = await getSyncQueueCount();
    if (!pendingCount) return { blocked: false, owners: [] };

    const owners = await getPendingSyncOwnerIds();
    if (owners.length === 0) {
      return { blocked: false, owners: [] };
    }

    const next = String(nextUserId);
    const onlyMine = owners.every(id => String(id) === next);
    return { blocked: !onlyMine, owners };
  } catch (e) {
    return { blocked: false, owners: [] };
  }
}

async function updateOnlineState(online, source = 'unknown') {
  const changed = online !== _isOnline;
  _isOnline = !!online;
  setOnlineStatus(_isOnline);

  console.log(`[Sync] online=${_isOnline} source=${source}`);

  if (changed && _isOnline) {
    if (_INITIAL_SYNC_IN_PROGRESS) return;
    const exists = await syncQueueTableExists();
    if (!exists) return;
    await processSyncQueue();
    await pullRemoteChanges(_currentUser);
    notifyListeners();
  }
}

export async function startNetworkMonitor(onStatusChange) {
  try {
    const initial = await NetInfo.fetch();
    const initialOnline = !!(initial.isConnected && initial.isInternetReachable !== false);
    await updateOnlineState(initialOnline, 'initial-fetch');
    onStatusChange?.(initialOnline);
  } catch (e) { }

  _unsubscribe = NetInfo.addEventListener(async state => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    const prev = _isOnline;
    await updateOnlineState(online, 'listener');
    if (online !== prev) onStatusChange?.(online);
  });

  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(async () => {
    if (_isOnline) {
      if (_INITIAL_SYNC_IN_PROGRESS) return;
      const exists = await syncQueueTableExists();
      if (!exists) return;
      await processSyncQueue();
      await pullRemoteChanges(_currentUser);
      await runInvoiceDueChecks();
      notifyListeners();
    }
  }, 30000); // كل 30 ثانية (Realtime يتكفل بالباقي)

  // تشغيل الاشتراك الفوري
  if (_currentUser) {
    startRealtimeSubscription();
  }
}

export function stopNetworkMonitor() {
  _unsubscribe?.();
  _unsubscribe = null;

  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }

  // إلغاء الاشتراك الفوري
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

export const isOnline = () => _isOnline;

const processQueueItem = async (item) => {
  try {
    await ensureOperationLogForSyncQueueId(item.id);
    await markOperationSyncing(item.id);
    const rawPayload = JSON.parse(item.payload || '{}');
    const payload = sanitizePayload(item.table_name, rawPayload);
    let error = null;
    if (item.table_name !== 'project' && !payload.project_id && item.record_id) {
      try {
        const projectR = await execSQL(`SELECT project_id FROM ${item.table_name} WHERE id = ? LIMIT 1`, [item.record_id]);
        const resolvedProjectId = projectR.rows._array?.[0]?.project_id;
        if (resolvedProjectId) payload.project_id = resolvedProjectId;
      } catch (e) { }
    }
    if (item.table_name !== 'project' && payload.project_id !== _currentUser.project_id) {
      console.log(`[Sync] skip foreign-project queue item id=${item.id} table=${item.table_name} payload_project=${payload.project_id || 'none'} current_project=${_currentUser.project_id}`);
      await markOperationSyncFailed(item.id, 'تم تجاهل عملية تخص مشروعاً آخر على هذا الجهاز.');
      return;
    }

    console.log(`[Sync] processing item id=${item.id} table=${item.table_name} op=${item.operation}`);

    if (item.operation === 'INSERT') {
      console.log(`[Sync] 🚀 Pushing to -> ${item.table_name}`, JSON.stringify(payload));
      let e = null;
      if (item.table_name === 'invoices') {
        try {
          const itemsR = await execSQL(`SELECT * FROM invoice_items WHERE invoice_id = ?`, [item.record_id]);
          const localItems = itemsR.rows._array || [];
          const localItemsPayloads = localItems.map(it => {
            const p = sanitizePayload('invoice_items', it);
            if (!p.project_id) p.project_id = payload.project_id;
            return p;
          });
          console.log(`[Sync] upsert_invoice_atomic: invoice_id=${item.record_id} items_count=${localItemsPayloads.length}`);
          const { error: rpcError } = await supabase.rpc('upsert_invoice_atomic', {
            p_invoice: payload,
            p_invoice_items: localItemsPayloads
          });
          e = rpcError;
          if (!e && localItems.length > 0) {
            const ids = localItems.map(it => it.id);
            const placeholders = ids.map(() => '?').join(',');
            await execSQL(`DELETE FROM sync_queue WHERE table_name = 'invoice_items' AND record_id IN (${placeholders})`, ids);
            await execSQL(`UPDATE invoice_items SET synced = 1 WHERE id IN (${placeholders})`, ids);
            console.log(`[Sync] Atomic invoice sync: cleared ${localItems.length} items from local sync_queue`);
          }
        } catch (err) {
          console.error('[Sync] Atomic invoice sync failed locally:', err);
          e = err;
        }
      } else {
        const { error: upsertError } = await supabase
          .from(item.table_name)
          .upsert(payload, { onConflict: 'id' });
        e = upsertError;
      }

      if (e) {
        console.error(`[Supabase Error Detail] Table: ${item.table_name}`, {
          code: e.code,
          msg: e.message,
          hint: e.hint,
          details: e.details
        });
        if (e.code === '23503' && (item.table_name === 'invoice_items' || item.table_name === 'collections')) {
          await tryRecoverMissingInvoice(payload.invoice_id);
        }
      }
      else console.log(`[Supabase SUCCESS] INSERT ${item.table_name} OK`);
      error = e;
    } else if (item.operation === 'UPDATE') {
      console.log(`[Supabase INFO] PUSHING UPDATE to -> ${item.table_name} [${item.record_id}]`, JSON.stringify(payload));
      if (item.table_name === 'invoices' && Number(payload.is_deleted) === 1 && !isInvoiceSoftDeletePayload(payload)) {
        throw new Error('Unsafe invoice soft-delete payload: contains non-delete fields');
      }
      let updateQuery = supabase
        .from(item.table_name)
        .update(payload)
        .eq('id', item.record_id);
      if (item.table_name !== 'project') updateQuery = updateQuery.eq('project_id', _currentUser.project_id);
      const { error: e } = await updateQuery;
      if (e) {
        console.error(`[Supabase ERROR] UPDATE ${item.table_name} failed:`, e);
        if (e.code === '23503' && (item.table_name === 'invoice_items' || item.table_name === 'collections')) {
          await tryRecoverMissingInvoice(payload.invoice_id);
        }
      }
      else console.log(`[Supabase SUCCESS] UPDATE ${item.table_name} successful!`);
      error = e;
    } else if (item.operation === 'DELETE') {
      console.log(`[Supabase INFO] PUSHING DELETE to -> ${item.table_name} [${item.record_id}]`);
      let deleteQuery = supabase
        .from(item.table_name)
        .delete()
        .eq('id', item.record_id);
      if (item.table_name !== 'project') deleteQuery = deleteQuery.eq('project_id', _currentUser.project_id);
      const { error: e } = await deleteQuery;
      if (e) console.error(`[Supabase ERROR] DELETE ${item.table_name} failed:`, e);
      else console.log(`[Supabase SUCCESS] DELETE ${item.table_name} successful!`);
      error = e;
    } else {
      error = new Error(`Unknown operation: ${item.operation}`);
    }

    if (!error) {
      await execSQL('DELETE FROM sync_queue WHERE id=?', [item.id]);
      try {
        await execSQL(`UPDATE ${item.table_name} SET synced=1 WHERE id=?`, [item.record_id]);
      } catch (e) { }
      await markOperationSynced(item.id, `تمت مزامنة ${item.table_name}/${item.record_id || ''}`);
      notifyDataChanged(item.table_name, payload);
      console.log(`[Sync] success item id=${item.id}`);
    } else {
      await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?', [item.id]);
      await markOperationSyncFailed(item.id, error.message || 'فشل غير معروف');
      console.log(`[Sync] failed item id=${item.id}: ${error.message}`);
    }
  } catch (e) {
    await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?', [item.id]);
    await markOperationSyncFailed(item.id, e.message || 'فشل غير معروف');
    console.log('[Sync] queue item exception:', e.message);
  }
};

export function addSyncListener(fn) {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter(l => l !== fn);
  };
}

function notifyListeners() {
  _listeners.forEach(fn => {
    try { fn(); } catch (e) { }
  });
}

export async function processSyncQueue() {
  if (_isSyncing || !_isOnline) return;
  if (!_currentUser?.project_id) {
    console.log('[Sync] blocked queue processing without project_id');
    return;
  }

  const exists = await syncQueueTableExists();
  if (!exists) return;

  _isSyncing = true;

  try {
    await backfillOperationsFromSyncQueue(500);
    const count = await getSyncQueueCount();
    console.log(`[Sync] queue count before processing: ${count}`);

    const r = await execSQL(
      `SELECT * FROM sync_queue
       WHERE attempts < 5
       ORDER BY
         CASE
           WHEN table_name = 'invoices' AND operation = 'INSERT' THEN 10
           WHEN table_name = 'invoice_items' AND operation = 'INSERT' THEN 20
           WHEN table_name = 'collections' AND operation = 'INSERT' THEN 30
           WHEN table_name = 'agent_wallets' THEN 40
           ELSE 100
         END,
         id ASC
       LIMIT 30`
    );
    const queued = r.rows._array || [];

    for (const item of queued) await processQueueItem(item);

    const after = await getSyncQueueCount();
    console.log(`[Sync] queue count after processing: ${after}`);
    notifyDataChanged('sync_queue');
  } catch (e) {
    console.log('[Sync] processSyncQueue error:', e.message);
  } finally {
    _isSyncing = false;
    notifyListeners();
  }
}

export async function retryFailedSyncQueueRecord(syncQueueId) {
  if (!_isOnline) throw new Error('لا يوجد اتصال بالإنترنت');
  if (_isSyncing) throw new Error('المزامنة جارية حالياً');
  if (!_currentUser?.project_id) throw new Error('لا يمكن المزامنة بدون مشروع نشط');
  if (!syncQueueId) throw new Error('معرّف العملية غير صالح');
  const exists = await syncQueueTableExists();
  if (!exists) throw new Error('جدول المزامنة غير متاح');

  _isSyncing = true;
  try {
    const r = await execSQL(
      `SELECT * FROM sync_queue WHERE id = ? LIMIT 1`,
      [syncQueueId]
    );
    const item = r.rows._array?.[0];
    if (!item) throw new Error('العنصر غير موجود في طابور المزامنة');
    await execSQL(`UPDATE sync_queue SET attempts = 0 WHERE id = ?`, [syncQueueId]);
    await processQueueItem(item);
    notifyDataChanged('sync_queue');
  } finally {
    _isSyncing = false;
    notifyListeners();
  }
}


export async function syncAll(user) {
  if (user) _currentUser = user;
  console.log("  SYNC START");

  try {
    try {
      const { restoreZeroedInvoicesFromItems } = require('./invoiceService');
      const restored = await restoreZeroedInvoicesFromItems();
      if (restored.length) {
        console.log(`[Sync] restored zeroed invoices from items: ${restored.length}`);
      }
    } catch (e) {
      console.log(`[Sync] zeroed-invoice restore skipped: ${e.message}`);
    }

    // 1) دفع التغييرات المحلية
    await processSyncQueue();

    // 2) سحب التغييرات البعيدة
    await pullRemoteChanges(user);

    console.log("  SYNC DONE");

    notifyDataChanged('all');

  } catch (e) {
    console.log("  SYNC ERROR:", e);
  }
}


export const syncNow = syncAll;

// 🛡️ دالة التعافي: رفع الفاتورة الأم المفقودة في السيرفر فوراً لإصلاح خطأ Foreign Key
async function tryRecoverMissingInvoice(invoiceId) {
  if (!invoiceId) {
    console.warn(`[Sync-Recovery] ⚠️  invoiceId is null, cannot recover.`);
    return;
  }
  console.log(`[Sync-Recovery] 🚑 Found a Foreign Key error for invoice: ${invoiceId}. Starting recovery...`);
  try {
    const raw = await execSQL(`SELECT * FROM invoices WHERE id=?`, [invoiceId]);
    const inv = raw.rows._array?.[0];

    if (inv) {
      const safeInvoicePayload = sanitizePayload('invoices', inv);
      console.log(`[Sync-Recovery] 🟢 Local record found! Forcing push to Supabase...`, JSON.stringify(safeInvoicePayload));
      // نقوم برفع الفاتورة فوراً بـ upsert لضمان وجودها
      const { error } = await supabase.from('invoices').upsert(safeInvoicePayload, { onConflict: 'id' });

      if (error) {
        console.error(`[Sync-Recovery] ❌ Force push failed:`, error.message);
      } else {
        console.log(`[Sync-Recovery] ✅ Parent invoice RECOVERED successfully in Supabase!`);
      }
    } else {
      console.error(`[Sync-Recovery] ❌ Critical: Invoice [${invoiceId}] NOT FOUND in local DB! Cannot recover.`);
    }
  } catch (e) {
    console.error(`[Sync-Recovery] Exception during recovery:`, e.message);
  }
}

async function pullRemoteChanges(user, opts = {}) {
  const onTableProgress = typeof opts.onTableProgress === 'function' ? opts.onTableProgress : () => {};
  const includeTables = Array.isArray(opts.includeTables) && opts.includeTables.length
    ? opts.includeTables
    : null;

  if (!user?.project_id) {
    console.log('[Sync] blocked pullRemoteChanges without project_id');
    return;
  }
  const metaR = await execSQL("SELECT value FROM sync_meta WHERE key='last_pull'");
  const lastPull = metaR.rows._array[0]?.value || '2000-01-01T00:00:00Z';
  console.log(`[Sync] pullRemoteChanges start project_id=${user.project_id} last_pull=${lastPull}`);

  const tableNames = includeTables || Object.keys(TABLE_FIELDS);
  const tables = tableNames.map(name => ({
    name,
    fields: TABLE_FIELDS[name]
  }));

  const totalTables = tables.length || 1;
  let completedTables = 0;
  let totalFetchedRows = 0;

  for (const t of tables) {
    let fetchedCount = 0;
    let appliedCount = 0;
    let status = 'ok';

    try {
      let query = supabase
        .from(t.name)
        .select(t.fields)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (t.name === 'project') {
         query = query.eq('id', user.project_id);
      } else {
         query = query.eq('project_id', user.project_id);
      }

      let { data, error } = await query;

      // Fallback for schema drift between app and remote DB (missing selected columns).
      if (error) {
        console.log(`[Sync] pull error ${t.name} (strict fields): ${error.message} -> fallback to select(*)`);
        let fallbackQuery = supabase.from(t.name).select('*').limit(2000);
        if (t.name === 'project') {
           fallbackQuery = fallbackQuery.eq('id', user.project_id);
        } else {
           fallbackQuery = fallbackQuery.eq('project_id', user.project_id);
        }
        const fallback = await fallbackQuery;
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.log(`[Sync] pull error ${t.name} (fallback failed): ${error.message}`);
        status = 'error';
        completedTables += 1;
        onTableProgress({
          table: t.name,
          completedTables,
          totalTables,
          fetchedRows: fetchedCount,
          appliedRows: appliedCount,
          totalFetchedRows,
          status,
        });
        continue;
      }

      if (!data || data.length === 0) {
        completedTables += 1;
        onTableProgress({
          table: t.name,
          completedTables,
          totalTables,
          fetchedRows: fetchedCount,
          appliedRows: appliedCount,
          totalFetchedRows,
          status,
        });
        continue;
      }
      fetchedCount = data.length;
      totalFetchedRows += fetchedCount;
      console.log(`[Sync] pull ${t.name}: fetched=${fetchedCount}`);

      for (const row of data) {
        if (t.name === 'project') {
          if (row.id !== user.project_id) continue;
        } else if (!row.project_id || row.project_id !== user.project_id) {
          console.log(`[Sync] skip pulled ${t.name}/${row.id || 'unknown'} foreign/missing project_id=${row.project_id || 'none'} current=${user.project_id}`);
          continue;
        }
        if (t.name === 'agent_wallets') {
          const skipWalletOverwrite = await hasPendingLocalWalletMutations(row.id);
          if (skipWalletOverwrite) {
            console.log(`[Sync] Skipping pull overwrite for wallet ${row.id} due to pending local wallet mutations`);
            continue;
          }
        }
        if (t.name === 'invoices') {
          const skipInvoiceDiscountOverwrite = await hasPendingLocalInvoiceDiscountMutations(row.id);
          if (skipInvoiceDiscountOverwrite) {
            console.log(`[Sync] Skipping pull overwrite for invoice ${row.id} due to pending local discount mutations`);
            continue;
          }
        }

        const inQueue = await hasPendingSyncForTableRecord(t.name, row.id);
        if (inQueue) {
          console.log(`[Sync] Skipping pull overwrite for ${t.name}/${row.id} as it is pending push`);
          continue;
        }

        // normalize + drop unknown fields to avoid local schema mismatch on fallback pulls
        const clean = sanitizePayload(t.name, row);
        if (t.name === 'invoice_items' && row && Object.prototype.hasOwnProperty.call(row, 'total_price')) {
          clean.total_price = row.total_price;
        }
        if (t.name === 'invoices') {
          // net_amount يأتي مباشرة من Supabase؛ نحسبه فقط إذا غاب
          if (!clean.net_amount) {
            clean.net_amount = Math.max(0, Number(clean.total_amount || 0));
          }
        }

        // =====       is_active   active =====
        if ('is_active' in clean) {
          clean.active = clean.is_active;
          delete clean.is_active;
        }

        if (Object.keys(clean).length === 0) continue;

        // =====               =====
        try {
          // 🚀 إطلاق تنبيهات عند سحب بيانات جديدة
          if (t.name === 'collections') {
            const oldR = await execSQL(`SELECT status FROM collections WHERE id=?`, [row.id]);
            const oldStatus = oldR.rows._array[0]?.status;

            // أ) تنبيه المندوب عند تغيير حالة تحصيله (اعتماد/رفض)
            if (user?.role === 'agent' && row.agent_id === user.id) {
              const actorName = await getUserName(row.approved_by, 'الإدارة');
              const posName = await getPOSName(row.pos_id);
              if (oldStatus === 'pending' && row.status === 'approved') {
                await saveNotificationHistory('✅ تم اعتماد تحصيلك', `${actorName} اعتمد تحصيلاً من (${posName}) بقيمة ${row.amount} ر.ي.`, { project_id: user.project_id });
              } else if (oldStatus === 'pending' && row.status === 'rejected') {
                await saveNotificationHistory('❌ تم رفض تحصيلك', `${actorName} رفض تحصيلاً من (${posName}) بقيمة ${row.amount} ر.ي. السبب: ${normalizeRejectionReason(row.rejection_reason)}`, { project_id: user.project_id });
              } else if (!oldStatus && row.status === 'approved') {
                // حالة نادرة (أول سحبة)
                await saveNotificationHistory('✅ تم استلام تحصيل معتمد', `${actorName} اعتمد تحصيلاً من (${posName}) بقيمة ${row.amount} ر.ي.`, { project_id: user.project_id });
              }
            }

            // ب) تنبيه المحاسب/المدير عند وصول تحصيل جديد ينتظر الاعتماد
            if ((user?.role === 'cashier' || user?.role === 'admin') && row.status === 'pending') {
              if (!oldStatus) { // سجل جديد تماماً
                const actorName = await getUserName(row.agent_id, 'مندوب');
                const posName = await getPOSName(row.pos_id);
                await saveNotificationHistory('📥 تحصيل جديد بانتظار الاعتماد', `${actorName} سجّل تحصيلاً من (${posName}) بقيمة ${row.amount} ر.ي.`, { project_id: user.project_id });
              }
            }
          }

          // ج) تنبيه المدير/المحاسب عند وصول فاتورة جديدة من مندوب
          if (t.name === 'invoices' && (user?.role === 'admin' || user?.role === 'cashier')) {
            const oldInv = await execSQL(`SELECT id FROM invoices WHERE id=?`, [row.id]);
            if (!oldInv.rows._array[0] && row.agent_id !== user.id) {
              const actorName = await getUserName(row.agent_id, 'مندوب');
              const posName = await getPOSName(row.pos_id);
              await saveNotificationHistory('📄 فاتورة جديدة وردت', `${actorName} سجّل عملية بيع لنقطة (${posName}) بقيمة ${Number(row.net_amount || row.total_amount || 0)} ر.ي.`, { project_id: user.project_id });
            }
          }

          // د) تنبيهات شاشة الإيرادات (التوريدات المالية)
          if (t.name === 'supplies') {
            const oldSR = await execSQL(`SELECT status FROM supplies WHERE id=?`, [row.id]);
            const oldStatus = oldSR.rows._array[0]?.status;

            // 1. وصول توريد جديد للمدير (بشرط أن المُنشئ ليس المدير نفسه)
            if (user?.role === 'admin' && row.user_id !== user?.id) {
              if (!oldStatus && row.status === 'pending') {
                const actorName = await getUserName(row.user_id, 'محاسب');
                await saveNotificationHistory('💰 توريد مالي جديد', `${actorName} رفع توريدًا بقيمة ${row.amount} ر.ي بانتظار اعتمادك.`, { project_id: user.project_id });
              }
            }

            // 2. إشعار المحاسب عند اعتماد التوريد الخاص به (يصل لصاحب التوريد فقط)
            if (row.user_id === user?.id) {
              if (oldStatus === 'pending' && row.status === 'approved') {
                await saveNotificationHistory('✅ تم اعتماد توريدك', `قام المدير باعتماد إيرادك المالي بقيمة ${row.amount} ر.ي.`, { project_id: user.project_id });
              } else if (oldStatus === 'pending' && row.status === 'rejected') {
                await saveNotificationHistory('❌ توريد مرفوض', `تم رفض الإيراد الذي رفعته بقيمة ${row.amount} ر.ي.`, { project_id: user.project_id });
              }
            }
          }

          await applyLocalRow(t.name, clean);
          appliedCount += 1;
        } catch (e) {
          console.log(`[Sync] local insert error ${t.name}: ${e.message}`);
        }
      }

      notifyDataChanged(t.name);
    } catch (e) {
      console.log(`[Sync] pull exception ${t.name}: ${e.message}`);
      status = 'error';
    } finally {
      completedTables += 1;
      onTableProgress({
        table: t.name,
        completedTables,
        totalTables,
        fetchedRows: fetchedCount,
        appliedRows: appliedCount,
        totalFetchedRows,
        status,
      });
    }
  }

  await execSQL(
    "INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('last_pull',?)",
    [new Date().toISOString()]
  );

  notifyDataChanged('reports_ready');
  console.log('[Sync] pullRemoteChanges completed');
}

export async function initialSync() {
  if (!_isOnline) return;
  if (!_currentUser?.project_id) {
    console.log('[Sync] blocked initialSync without project_id');
    return;
  }
  try {
    await execSQL(
      "INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('last_pull','2000-01-01T00:00:00Z')"
    );
    await pullRemoteChanges(_currentUser);
    notifyListeners();
  } catch (e) { }
}

export async function runRequiredInitialSync(user, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const timeoutMs = Number(opts.timeoutMs || 90000);

  if (!user?.project_id) {
    throw new Error('لا يمكن بدء المزامنة الأولية بدون مشروع.');
  }
  if (_INITIAL_SYNC_READY) return { ready: true, offlineFallback: false };
  if (_initialSyncPromise) return _initialSyncPromise;

  _initialSyncPromise = (async () => {
    _INITIAL_SYNC_IN_PROGRESS = true;
    const startedAt = Date.now();
    const withTimeout = async (p) => {
      const left = timeoutMs - (Date.now() - startedAt);
      if (left <= 0) throw new Error('انتهت مهلة المزامنة الأولية.');
      return Promise.race([
        p,
        new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة المزامنة الأولية.')), left)),
      ]);
    };

    try {
      onProgress({ message: 'جاري تهيئة قاعدة البيانات 10%', percent: 10 });

      if (!_isOnline) {
        const hasLocal = await hasLocalRequiredData(user.project_id);
        if (hasLocal) {
          _INITIAL_SYNC_READY = true;
          onProgress({ message: 'وضع عدم الاتصال - سيتم استخدام البيانات المحلية 100%', percent: 100 });
          return { ready: true, offlineFallback: true };
        }
        throw new Error('لا يوجد اتصال بالإنترنت ولا توجد بيانات محلية كافية لبدء التطبيق.');
      }

      onProgress({ message: 'جاري تجهيز البيانات المحلية قبل المزامنة 15%', percent: 15 });
      await withTimeout(processSyncQueue());
      await withTimeout(
        pullRemoteChanges(user, {
          includeTables: REQUIRED_INITIAL_SYNC_TABLES,
          onTableProgress: ({ table, completedTables, totalTables }) => {
            const base = 15;
            const syncRange = 75;
            const progressRatio = totalTables > 0 ? (completedTables / totalTables) : 1;
            const percent = Math.min(90, Math.max(base, Math.round(base + (progressRatio * syncRange))));
            const label = INITIAL_TABLE_PROGRESS_LABELS_AR[table] || 'جاري مزامنة البيانات';
            onProgress({ message: `${label} ${percent}%`, percent });
          },
        })
      );

      onProgress({ message: 'جاري تجهيز البيانات محلياً 92%', percent: 92 });
      try { await backfillOperationsFromSyncQueue(300); } catch (e) { }

      _INITIAL_SYNC_READY = true;
      onProgress({ message: 'اكتملت المزامنة 100%', percent: 100 });
      return { ready: true, offlineFallback: false };
    } finally {
      _INITIAL_SYNC_IN_PROGRESS = false;
      _initialSyncPromise = null;
    }
  })();

  return _initialSyncPromise;
}
