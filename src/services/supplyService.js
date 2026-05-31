import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';
import { getCached } from './cacheService';

const getUserBasic = async (userId) => {
  if (!userId) return null;
  const r = await execSQL(`SELECT id, name, role FROM users WHERE id = ? LIMIT 1`, [userId]);
  return r.rows._array?.[0] || null;
};

const getSupplyContext = async (supplyId) => {
  const r = await execSQL(
    `SELECT s.id, s.project_id, s.supply_number, s.agent_id, s.user_id, s.amount, a.name as agent_name
     FROM supplies s
     LEFT JOIN users a ON a.id = s.agent_id
     WHERE s.id = ? LIMIT 1`,
    [supplyId]
  );
  return r.rows._array?.[0] || null;
};

export const createLocalSupply = async (data, collectionIds = []) => {
  if (!data?.user_id) throw new Error('تعذر تحديد المستخدم المنفذ للتوريد.');
  if (!data?.project_id) throw new Error('رقم المشروع مطلوب لإنشاء التوريد.');

  if (collectionIds?.length > 0) {
    for (const cId of collectionIds) {
      const cR = await execSQL(`SELECT id, status, supply_id, approved_by FROM collections WHERE id = ? AND project_id = ? LIMIT 1`, [cId, data.project_id]);
      const col = cR.rows._array?.[0];
      if (!col) throw new Error('أحد سندات التحصيل غير موجود.');
      if (col.status !== 'approved') throw new Error('لا يمكن توريد سند غير معتمد.');
      if (col.supply_id) throw new Error('أحد السندات مرتبط بتوريد آخر بالفعل.');
      if (col.approved_by && String(col.approved_by) !== String(data.user_id)) {
        throw new Error('لا يمكنك توريد هذا السند لأنه معتمد بواسطة مستخدم آخر.');
      }
    }
  }

  const id = uuidv4();
  const payload = { id, supply_number: data.supply_number || `SUP-${Math.floor(Math.random() * 90000) + 10000}`, user_id: data.user_id, agent_id: data.agent_id, amount: Number(data.amount || 0), notes: data.notes || '', type: data.type || 'deposit', status: data.status || 'pending', approved_at: data.approved_at, approval_notes: data.approval_notes, created_at: data.created_at || new Date().toISOString(), phase_id: data.phase_id || null, project_id: data.project_id, synced: 0 };

  // Auto-inject phase_id from active phase if not provided
  if (!payload.phase_id) {
    try {
      const { getActivePhase } = require('./phaseService');
      const activePhase = await getActivePhase(payload.project_id);
      if (activePhase) payload.phase_id = activePhase.id;
    } catch (e) { console.log('[Supply] Could not get active phase:', e.message); }
  }

  await execSQL(`INSERT INTO supplies (id, supply_number, user_id, agent_id, amount, notes, type, status, approved_at, approval_notes, created_at, phase_id, project_id, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.supply_number, payload.user_id, payload.agent_id, payload.amount, payload.notes, payload.type, payload.status, payload.approved_at, payload.approval_notes, payload.created_at, payload.phase_id, payload.project_id, payload.synced]);
  await addToSyncQueue('supplies', 'INSERT', payload, id);
  if (collectionIds?.length > 0) {
    for (const cId of collectionIds) {
      await execSQL(`UPDATE collections SET supply_id=?, synced=0 WHERE id=?`, [id, cId]);
      await addToSyncQueue('collections', 'UPDATE', { supply_id: id }, cId);
    }
    notifyDataChanged('collections');
  }
  notifyDataChanged('supplies', payload);

  try {
    const actor = await getUserBasic(payload.user_id);
    if (actor?.role === 'cashier' || actor?.role === 'admin') {
      const { triggerAppNotification } = require('./NotificationService');
      await triggerAppNotification({
        type: 'supply',
        actor: actor.name || 'محاسب',
        amount: payload.amount,
        reference_id: payload.id,
        projectId: payload.project_id,
        targetRoles: ['admin'],
        targetUserIds: [],
        excludeUserIds: [actor.id],
      });
    }
  } catch (e) { }
  return payload;
};

export const getLocalSupplies = async (filters = {}) => {
  const cacheKey = `supplies:filters:${JSON.stringify(filters)}`;
  return getCached(cacheKey, async () => {
    let sql = `SELECT s.*, u.name as user_name, a.name as agent_name FROM supplies s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN users a ON a.id = s.agent_id WHERE 1=1`;
    const params = [];
    if (filters.user_id) { sql += ` AND s.user_id = ?`; params.push(filters.user_id); }
    if (filters.agent_id) { sql += ` AND s.agent_id = ?`; params.push(filters.agent_id); }
    if (filters.status) { sql += ` AND s.status = ?`; params.push(filters.status); }
    if (filters.phase_id) { sql += ` AND s.phase_id = ?`; params.push(filters.phase_id); }
    if (filters.project_id) { sql += ` AND s.project_id = ?`; params.push(filters.project_id); }
    sql += ` ORDER BY s.created_at DESC`;
    const r = await execSQL(sql, params);
    return r.rows._array || [];
  });
};

export const approveLocalSupply = async (id, notes = '') => {
  const approved_at = new Date().toISOString();
  await execSQL(`UPDATE supplies SET status='approved', approved_at=?, approval_notes=?, synced=0 WHERE id=?`, [approved_at, notes, id]);
  await addToSyncQueue('supplies', 'UPDATE', { status: 'approved', approved_at, approval_notes: notes }, id);
  notifyDataChanged('supplies');
};

export const cancelLocalSupplyApproval = async (id, actorId = null) => {
  await execSQL(`UPDATE supplies SET status='pending', approved_at=NULL, approval_notes=NULL, synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('supplies', 'UPDATE', { status: 'pending', approved_at: null, approval_notes: null }, id);
  notifyDataChanged('supplies');

  try {
    const supply = await getSupplyContext(id);
    const actor = await getUserBasic(actorId || supply?.user_id);
    const actorName = actor?.name || 'مستخدم النظام';
    const { sendRoleBasedPush } = require('./NotificationService');
    await sendRoleBasedPush({
      title: '↩️ إلغاء اعتماد توريد',
      body: `${actorName} ألغى اعتماد التوريد ${supply?.supply_number || ''}.`,
      targetUserIds: supply?.agent_id ? [supply.agent_id] : [],
      excludeUserIds: actor?.id ? [actor.id] : [],
      data: {
        route: 'Supplies',
        project_id: supply?.project_id || null,
        actor_id: actor?.id || null,
        actor_name: actorName,
        actor_role: actor?.role || null,
        action: 'cancel_supply_approval',
        supply_id: id,
        affected_agent_id: supply?.agent_id || null,
        delivery_channel: 'push',
      },
    });
  } catch (e) { }
};

export const rejectLocalSupply = async (id, actorId = null) => {
  await execSQL(`UPDATE supplies SET status='rejected', synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('supplies', 'UPDATE', { status: 'rejected' }, id);
  const r = await execSQL(`SELECT id FROM collections WHERE supply_id=?`, [id]);
  for (const row of r.rows._array) {
    await execSQL(`UPDATE collections SET supply_id=NULL, synced=0 WHERE id=?`, [row.id]);
    await addToSyncQueue('collections', 'UPDATE', { supply_id: null }, row.id);
  }
  notifyDataChanged('supplies');
  notifyDataChanged('collections');

  try {
    const supply = await getSupplyContext(id);
    const actor = await getUserBasic(actorId || supply?.user_id);
    const actorName = actor?.name || 'مستخدم النظام';
    const { sendRoleBasedPush } = require('./NotificationService');
    await sendRoleBasedPush({
      title: '❌ رفض توريد',
      body: `${actorName} رفض التوريد ${supply?.supply_number || ''}.`,
      targetUserIds: supply?.agent_id ? [supply.agent_id] : [],
      excludeUserIds: actor?.id ? [actor.id] : [],
      data: {
        route: 'Supplies',
        project_id: supply?.project_id || null,
        actor_id: actor?.id || null,
        actor_name: actorName,
        actor_role: actor?.role || null,
        action: 'reject_supply',
        supply_id: id,
        affected_agent_id: supply?.agent_id || null,
        delivery_channel: 'push',
      },
    });
  } catch (e) { }
};

export const getSupplyPrintDetails = async (supplyId) => {
  const cacheKey = `supplies:print:${supplyId}`;
  return getCached(cacheKey, async () => {
    const r = await execSQL(
      `SELECT
         c.id as collection_id,
         c.collection_number,
         c.amount as collection_amount,
         c.amount as amount,
         c.method,
         c.collection_date,
         c.status as collection_status,
         c.supply_id,
         i.invoice_number,
         i.net_amount,
         i.approved_amount,
         p.name as pos_name,
         u.name as agent_name,
         TRIM(
           COALESCE(c.collection_number, '')
           || CASE WHEN i.invoice_number IS NOT NULL AND i.invoice_number != '' THEN ' • فاتورة ' || i.invoice_number ELSE '' END
           || CASE WHEN p.name IS NOT NULL AND p.name != '' THEN ' • ' || p.name ELSE '' END
         ) as source_label,
         (SELECT group_concat(cat.name || ' (' || ii.quantity || ')', ' + ')
            FROM invoice_items ii
            LEFT JOIN card_categories cat ON cat.id = ii.category_id
           WHERE ii.invoice_id = c.invoice_id) as items_desc
       FROM collections c
       LEFT JOIN pos_customers p ON p.id = c.pos_id
       LEFT JOIN invoices i ON i.id = c.invoice_id
       LEFT JOIN users u ON u.id = c.agent_id
       WHERE c.supply_id = ?
       ORDER BY c.collection_date ASC, c.created_at ASC`,
      [supplyId]
    );
    return r.rows._array || [];
  });
};
