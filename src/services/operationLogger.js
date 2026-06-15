import AsyncStorage from '@react-native-async-storage/async-storage';
import { execSQL, uuidv4, notifyDataChanged } from './dbCore';

const ENTITY_LABELS = {
  invoices: 'فاتورة',
  invoice_items: 'بند فاتورة',
  collections: 'تحصيل',
  supplies: 'توريد/إيداع',
  batches: 'دفعة',
  agent_wallets: 'محفظة',
  pos_customers: 'نقطة بيع',
  phases: 'مرحلة',
  users: 'مستخدم',
  card_categories: 'فئة كروت',
  app_permissions: 'صلاحية',
  invoice_discount_approvals: 'اعتماد خصم',
  project: 'مشروع',
};

const SUPPORTED_TABLES = new Set(Object.keys(ENTITY_LABELS));

const OP_AR = {
  add: 'إضافة',
  edit: 'تعديل',
  delete: 'حذف',
  approve: 'اعتماد',
  reject: 'رفض',
  sync: 'مزامنة',
};

const ROLE_AR = {
  admin: 'مدير عام',
  manager: 'مدير',
  cashier: 'محاسب',
  agent: 'مندوب',
};

function parseJSON(value, fallback = {}) {
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function jsonString(value) {
  try { return JSON.stringify(value ?? null); } catch (e) { return null; }
}

function roleLabel(role) {
  return ROLE_AR[String(role || '').toLowerCase()] || (role || 'غير محدد');
}

function normalizeOperationType(operation, payload = {}) {
  const op = String(operation || '').toUpperCase();
  if (op === 'INSERT') return 'add';
  if (op === 'DELETE') return 'delete';
  if (op !== 'UPDATE') return 'edit';

  if (payload?.status === 'approved' || payload?.discount_status === 'approved') return 'approve';
  if (payload?.status === 'rejected' || payload?.discount_status === 'rejected') return 'reject';
  if (Number(payload?.active) === 0) return 'delete';
  return 'edit';
}

async function getCurrentSession() {
  try {
    const raw = await AsyncStorage.getItem('isp_user');
    const user = raw ? JSON.parse(raw) : null;
    return {
      user_id: user?.id || null,
      user_name: user?.name || null,
      user_role: user?.role || null,
      session_id: user?.id ? `session:${user.id}` : null,
      device_id: null,
      project_id: user?.project_id || null,
    };
  } catch (e) {
    return { user_id: null, user_name: null, user_role: null, session_id: null, device_id: null, project_id: null };
  }
}

async function getUserBasic(userId) {
  if (!userId) return null;
  try {
    const r = await execSQL(`SELECT id, name, role FROM users WHERE id = ? LIMIT 1`, [userId]);
    return r.rows._array?.[0] || null;
  } catch (e) {
    return null;
  }
}

function actorFromPayload(payload = {}) {
  return payload.actor_user_id
    || payload.user_id
    || payload.agent_id
    || payload.issued_by
    || payload.approved_by
    || payload.discount_approved_by
    || payload.created_by
    || payload.updated_by
    || null;
}

async function resolveFieldFromRecord(tableName, recordId, field) {
  if (!SUPPORTED_TABLES.has(tableName) || !recordId || !field) return null;
  try {
    const q = await execSQL(`SELECT ${field} as v FROM ${tableName} WHERE id = ? LIMIT 1`, [recordId]);
    return q.rows._array?.[0]?.v ?? null;
  } catch (e) {
    return null;
  }
}

async function resolveReferenceText(tableName, payload = {}, recordId = null) {
  const immediate =
    payload.invoice_number
    || payload.collection_number
    || payload.supply_number
    || payload.batch_number
    || payload.serial_number
    || payload.name
    || payload.reference_number
    || null;
  if (immediate) return String(immediate);

  if (!recordId) return null;
  if (tableName === 'invoices') return await resolveFieldFromRecord('invoices', recordId, 'invoice_number');
  if (tableName === 'collections') {
    try {
      const r = await execSQL(
        `SELECT c.collection_number, i.invoice_number, p.name as pos_name
         FROM collections c
         LEFT JOIN invoices i ON i.id = c.invoice_id
         LEFT JOIN pos_customers p ON p.id = c.pos_id
         WHERE c.id = ? LIMIT 1`,
        [recordId]
      );
      const row = r.rows._array?.[0];
      if (!row) return null;
      const parts = [row.collection_number, row.invoice_number, row.pos_name].filter(Boolean);
      return parts.join(' • ');
    } catch (e) {
      return await resolveFieldFromRecord('collections', recordId, 'collection_number');
    }
  }
  if (tableName === 'supplies') return await resolveFieldFromRecord('supplies', recordId, 'supply_number');
  if (tableName === 'batches') return await resolveFieldFromRecord('batches', recordId, 'batch_number');
  if (tableName === 'pos_customers') return await resolveFieldFromRecord('pos_customers', recordId, 'name');
  if (tableName === 'phases') return await resolveFieldFromRecord('phases', recordId, 'name');
  if (tableName === 'users') return await resolveFieldFromRecord('users', recordId, 'name');
  return null;
}

async function resolveProjectId(tableName, payload = {}, recordId = null, fallbackProjectId = null) {
  if (payload.project_id) return payload.project_id;
  if (!recordId || !SUPPORTED_TABLES.has(tableName) || tableName === 'project') return fallbackProjectId || null;
  return await resolveFieldFromRecord(tableName, recordId, 'project_id');
}

async function resolvePhaseId(tableName, payload = {}, recordId = null) {
  if (payload.phase_id) return payload.phase_id;
  if (!recordId || !SUPPORTED_TABLES.has(tableName)) return null;
  return await resolveFieldFromRecord(tableName, recordId, 'phase_id');
}

function buildArabicMessage({ operationType, tableName, actorName, referenceText, recordId, payload = {} }) {
  const entity = ENTITY_LABELS[tableName] || tableName || 'سجل';
  const op = OP_AR[operationType] || OP_AR.edit;
  const suffix = referenceText ? ` (${referenceText})` : (recordId ? ` [${recordId}]` : '');

  if (operationType === 'approve') {
    return `${actorName || 'مستخدم'} قام بـ${op} ${entity}${suffix}.`;
  }
  if (operationType === 'reject') {
    const reason = payload.rejection_reason || payload.approval_notes || payload.decision_note;
    return reason
      ? `${actorName || 'مستخدم'} قام بـ${op} ${entity}${suffix}. السبب: ${reason}`
      : `${actorName || 'مستخدم'} قام بـ${op} ${entity}${suffix}.`;
  }
  return `${actorName || 'مستخدم'} قام بـ${op} ${entity}${suffix}.`;
}

export async function logQueuedOperation({
  syncQueueId = null,
  tableName,
  operation,
  payload = {},
  recordId = null,
  projectId = null,
  createdAt = null,
  operationGroupId = null,
}) {
  if (!tableName || !SUPPORTED_TABLES.has(tableName)) return null;

  if (syncQueueId) {
    const existing = await execSQL(`SELECT id FROM operations_log WHERE sync_queue_id = ? LIMIT 1`, [syncQueueId]);
    if ((existing.rows._array || []).length > 0) {
      return existing.rows._array[0].id;
    }
  }

  const session = await getCurrentSession();
  let actorUserId = actorFromPayload(payload) || session.user_id || null;
  const actor = await getUserBasic(actorUserId);
  if (!actorUserId && actor?.id) actorUserId = actor.id;

  const actorName = actor?.name || session.user_name || payload.actor_name || 'مستخدم النظام';
  const actorRole = actor?.role || session.user_role || payload.actor_role || null;
  const operationType = normalizeOperationType(operation, payload);
  const referenceText = await resolveReferenceText(tableName, payload, recordId);
  const resolvedProjectId = await resolveProjectId(tableName, payload, recordId, projectId || session.project_id);
  const phaseId = await resolvePhaseId(tableName, payload, recordId);
  const messageAr = buildArabicMessage({
    operationType,
    tableName,
    actorName,
    referenceText,
    recordId,
    payload,
  });

  const logId = uuidv4();
  const now = new Date().toISOString();
  const createdValue = createdAt || now;
  await execSQL(
    `INSERT INTO operations_log
      (id, operation_group_id, sync_queue_id, actor_user_id, actor_name, actor_role, operation_type, table_name, entity_name, record_id, reference_text, message_ar, old_values, new_values, project_id, phase_id, source, sync_status, sync_error, sync_details, device_id, session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
    [
      logId,
      operationGroupId,
      syncQueueId,
      actorUserId,
      actorName,
      actorRole,
      operationType,
      tableName,
      ENTITY_LABELS[tableName] || tableName,
      recordId,
      referenceText,
      messageAr,
      null,
      jsonString(payload),
      resolvedProjectId,
      phaseId,
      'offline',
      'pending',
      session.device_id,
      session.session_id,
      createdValue,
      now,
    ]
  );
  notifyDataChanged('operations_log');
  return logId;
}

export async function ensureOperationLogForSyncQueueId(syncQueueId) {
  if (!syncQueueId) return null;
  const existing = await execSQL(`SELECT id FROM operations_log WHERE sync_queue_id = ? LIMIT 1`, [syncQueueId]);
  if ((existing.rows._array || []).length > 0) return existing.rows._array[0].id;

  const q = await execSQL(`SELECT * FROM sync_queue WHERE id = ? LIMIT 1`, [syncQueueId]);
  const item = q.rows._array?.[0];
  if (!item) return null;
  const payload = parseJSON(item.payload || '{}', {});
  return await logQueuedOperation({
    syncQueueId: item.id,
    tableName: item.table_name,
    operation: item.operation,
    payload,
    recordId: item.record_id || null,
    projectId: item.project_id || null,
    createdAt: item.created_at || null,
    operationGroupId: item.operation_group_id || null,
  });
}

export async function backfillOperationsFromSyncQueue(limit = 200) {
  const r = await execSQL(
    `SELECT q.*
     FROM sync_queue q
     LEFT JOIN operations_log o ON o.sync_queue_id = q.id
     WHERE o.id IS NULL
     ORDER BY q.id ASC
     LIMIT ?`,
    [Number(limit || 200)]
  );
  const rows = r.rows._array || [];
  for (const item of rows) {
    const payload = parseJSON(item.payload || '{}', {});
    await logQueuedOperation({
      syncQueueId: item.id,
      tableName: item.table_name,
      operation: item.operation,
      payload,
      recordId: item.record_id || null,
      projectId: item.project_id || null,
      createdAt: item.created_at || null,
      operationGroupId: item.operation_group_id || null,
    });
  }
  return rows.length;
}

export async function markOperationSyncing(syncQueueId) {
  if (!syncQueueId) return;
  await ensureOperationLogForSyncQueueId(syncQueueId);
  await execSQL(
    `UPDATE operations_log
     SET sync_status = 'syncing',
         source = 'sqlite',
         sync_error = NULL,
         updated_at = ?
     WHERE sync_queue_id = ?`,
    [new Date().toISOString(), syncQueueId]
  );
  notifyDataChanged('operations_log');
}

export async function markOperationSynced(syncQueueId, details = null) {
  if (!syncQueueId) return;
  await ensureOperationLogForSyncQueueId(syncQueueId);
  const now = new Date().toISOString();
  await execSQL(
    `UPDATE operations_log
     SET sync_status = 'synced',
         source = 'synced',
         sync_error = NULL,
         sync_details = ?,
         synced_at = ?,
         updated_at = ?
     WHERE sync_queue_id = ?`,
    [details ? String(details) : null, now, now, syncQueueId]
  );
  notifyDataChanged('operations_log');
}

export async function markOperationSyncFailed(syncQueueId, errorMessage = null) {
  if (!syncQueueId) return;
  await ensureOperationLogForSyncQueueId(syncQueueId);
  await execSQL(
    `UPDATE operations_log
     SET sync_status = 'failed',
         sync_error = ?,
         updated_at = ?
     WHERE sync_queue_id = ?`,
    [errorMessage ? String(errorMessage) : 'فشل غير معروف', new Date().toISOString(), syncQueueId]
  );
  notifyDataChanged('operations_log');
}

export async function getPendingOfflineOperationsForUser(userId, { projectId = null, limit = 400 } = {}) {
  if (!projectId) {
    console.log('[Operations] blocked pending load without project_id');
    return [];
  }
  console.log(`[Operations] pending load project_id=${projectId} user_id=${userId || 'none'}`);
  let sql = `
    SELECT *
    FROM operations_log
    WHERE actor_user_id = ?
      AND sync_queue_id IS NOT NULL
  `;
  const params = [userId];
  sql += ` AND project_id = ?`;
  params.push(projectId);
  sql += ` ORDER BY datetime(created_at) DESC LIMIT ?`;
  params.push(Number(limit || 400));
  const r = await execSQL(sql, params);
  return r.rows._array || [];
}

export async function getGeneralOperationsLog({ projectId = null, phaseId = null, limit = 500 } = {}) {
  if (!projectId) {
    console.log('[Operations] blocked general load without project_id');
    return [];
  }
  console.log(`[Operations] general load project_id=${projectId} phase_id=${phaseId || 'all'}`);
  let sql = `SELECT * FROM operations_log WHERE 1=1`;
  const params = [];

  sql += ` AND project_id = ?`;
  params.push(projectId);
  if (phaseId) {
    sql += ` AND (phase_id = ? OR phase_id IS NULL OR phase_id = '')`;
    params.push(phaseId);
  }
  sql += ` ORDER BY datetime(created_at) DESC LIMIT ?`;
  params.push(Number(limit || 500));
  const r = await execSQL(sql, params);
  return r.rows._array || [];
}

export async function ensureOperationsLogTable() {
  return true;
}

export function getOperationTypeArabic(type) {
  return OP_AR[type] || type || 'تعديل';
}

export function getRoleArabicLabel(role) {
  return roleLabel(role);
}
