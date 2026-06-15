import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';
import { updateInvoiceStatus, getInvoicePaidSum, decorateInvoiceStatusFields, resolveInvoiceNetAmount } from './invoiceService';
import { getCached } from './cacheService';

const ACTIVE_INVOICE_CLAUSE = `(COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL AND (i.active = 1 OR i.active IS NULL OR i.active = 'true'))`;

const pad2 = (n) => String(n).padStart(2, '0');

const getMonthlySequentialCode = async ({ table, column, prefix, dateValue }) => {
  const baseDate = new Date(dateValue || new Date().toISOString());
  const d = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const monthPrefix = `${prefix}-${yyyy}-${mm}`;
  const r = await execSQL(`SELECT ${column} as code FROM ${table} WHERE ${column} LIKE ?`, [`${monthPrefix}%`]);
  const rows = r.rows._array || [];
  let maxSeq = 0;
  for (const row of rows) {
    const code = String(row.code || '');
    const m = code.match(new RegExp(`^${prefix}-${yyyy}-${mm}(\\d{2})$`));
    if (m) {
      const seq = Number(m[1] || 0);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return `${monthPrefix}${pad2(maxSeq + 1)}`;
};

const getUserBasic = async (userId) => {
  if (!userId) return null;
  const r = await execSQL(`SELECT id, name, role FROM users WHERE id = ? LIMIT 1`, [userId]);
  return r.rows._array?.[0] || null;
};

const getCollectionContext = async (collectionId) => {
  const r = await execSQL(
    `SELECT c.id, c.project_id, c.collection_number, c.agent_id, c.pos_id, c.amount, c.approved_by, a.name as agent_name, p.name as pos_name
     FROM collections c
     LEFT JOIN users a ON a.id = c.agent_id
     LEFT JOIN pos_customers p ON p.id = c.pos_id
     WHERE c.id = ? LIMIT 1`,
    [collectionId]
  );
  return r.rows._array?.[0] || null;
};

const getPOSName = async (posId) => {
  if (!posId) return 'نقطة بيع غير محددة';
  const r = await execSQL(`SELECT name FROM pos_customers WHERE id = ? LIMIT 1`, [posId]);
  return r.rows._array?.[0]?.name || 'نقطة بيع غير محددة';
};

export const getLocalCollections = async (filters = {}) => {
  if (!filters.project_id) {
    console.log('[Collections] blocked load without project_id');
    return [];
  }
  console.log(`[Collections] load project_id=${filters.project_id} phase_id=${filters.phase_id || 'all'} agent_id=${filters.agent_id || 'all'}`);
  const cacheKey = `collections:filters:${JSON.stringify(filters)}`;
  return getCached(cacheKey, async () => {
    const activeClause = filters.includeInactive
      ? `(c.active = 1 OR c.active = 0 OR c.active = 'true' OR c.active = 'false' OR c.active IS NULL)`
      : `(c.active = 1 OR c.active = 'true') AND LOWER(COALESCE(c.status, 'pending')) NOT IN ('deleted', 'cancelled', 'canceled')`;
    const invoiceJoinClause = filters.includeInactive
      ? `(COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL)`
      : ACTIVE_INVOICE_CLAUSE;
    let sql = `SELECT c.*, u.name as agent_name, p.name as pos_name, p.phone as pos_phone, i.invoice_number, CASE WHEN COALESCE(i.discount_status, 'none') IN ('approved', 'auto_approved') THEN MAX(0, COALESCE(NULLIF(i.net_amount, 0), COALESCE(i.total_amount, 0) - COALESCE(i.discount_applied_value, 0))) ELSE COALESCE(i.total_amount, 0) END as inv_net, i.total_amount as inv_total_amount, i.discount_applied_value as inv_discount_applied_value, i.discount_status as inv_discount_status, i.status as inv_status, i.paid_amount as inv_paid, i.approved_amount as inv_approved, apr.name as approver_name FROM collections c LEFT JOIN users u ON u.id = c.agent_id AND u.project_id = c.project_id LEFT JOIN pos_customers p ON p.id = c.pos_id AND p.project_id = c.project_id LEFT JOIN invoices i ON i.id = c.invoice_id AND i.project_id = c.project_id AND ${invoiceJoinClause} LEFT JOIN users apr ON apr.id = c.approved_by AND apr.project_id = c.project_id WHERE ${activeClause}`;
    const params = [];
    sql += ` AND c.project_id = ?`;
    params.push(filters.project_id);
    if (filters.status) { sql += ` AND c.status = ?`; params.push(filters.status); }
    if (filters.agent_id) { sql += ` AND c.agent_id = ?`; params.push(filters.agent_id); }
    if (filters.approved_by) { sql += ` AND c.approved_by = ?`; params.push(filters.approved_by); }
    if (filters.invoice_id) { sql += ` AND c.invoice_id = ?`; params.push(filters.invoice_id); }
    if (filters.pos_id) { sql += ` AND c.pos_id = ?`; params.push(filters.pos_id); }
    if (filters.phase_id) { sql += ` AND c.phase_id = ?`; params.push(filters.phase_id); }
    
    if (filters.from_date) {
      sql += ` AND date(COALESCE(c.collection_date, c.created_at)) >= date(?)`;
      params.push(filters.from_date);
    }
    if (filters.to_date) {
      sql += ` AND date(COALESCE(c.collection_date, c.created_at)) <= date(?)`;
      params.push(filters.to_date);
    }
    if (filters.amount_min !== undefined && filters.amount_min !== '') {
      sql += ` AND c.amount >= ?`;
      params.push(Number(filters.amount_min));
    }
    if (filters.amount_max !== undefined && filters.amount_max !== '') {
      sql += ` AND c.amount <= ?`;
      params.push(Number(filters.amount_max));
    }

    sql += ` ORDER BY c.created_at DESC`;
    const r = await execSQL(sql, params);
    return (r.rows._array || []).map((row) => {
      if (!row.invoice_number) return row;
      const invoiceFields = decorateInvoiceStatusFields({
        total_amount: row.inv_total_amount,
        net_amount: row.inv_net,
        discount_applied_value: row.inv_discount_applied_value,
        discount_status: row.inv_discount_status,
        paid_amount: row.inv_paid,
        approved_amount: row.inv_approved,
        status: row.inv_status,
      });
      return {
        ...row,
        inv_payment_status: invoiceFields.payment_status,
        inv_approval_status: invoiceFields.approval_status,
        inv_payment_remaining_amount: invoiceFields.payment_remaining_amount,
        inv_approval_remaining_amount: invoiceFields.approval_remaining_amount,
      };
    });
  });
};

export const createLocalCollection = async (data) => {
  const projectId = data.project_id || await (async () => {
    try {
      const { getProjectId } = require('./dbCore');
      return await getProjectId();
    } catch (e) {
      return null;
    }
  })();
  if (!projectId) throw new Error('تعذر تحديد المشروع الحالي. الرجاء تسجيل الدخول بالترخيص أولاً.');
  if (!data.invoice_id) throw new Error('لا يمكن إنشاء تحصيل بدون تحديد رقم الفاتورة');
  const invRes = await execSQL(`SELECT total_amount, discount_applied_value, discount_status, discount_requested_value FROM invoices WHERE id = ? AND project_id = ?`, [data.invoice_id, projectId]);
  const invoice = invRes.rows._array[0];
  if (!invoice) {
    throw new Error('الفاتورة غير موجودة ضمن المشروع الحالي.');
  }
  if (invoice) {
    // Block collection on any unresolved discount — covers both 'pending_discount_approval'
    // (current) and 'pending' (legacy/migration) status values.
    const discountPending =
      Number(invoice.discount_requested_value || 0) > 0 &&
      !['approved', 'auto_approved', 'rejected', 'none', ''].includes(
        String(invoice.discount_status || '').trim()
      );
    if (discountPending) {
      throw new Error('لا يمكن إنشاء تحصيل قبل اعتماد الخصم من المدير.');
    }
    const totalAmount = resolveInvoiceNetAmount(invoice);
    const paidSum = await getInvoicePaidSum(data.invoice_id);
    if (Number(data.amount || 0) > (totalAmount - paidSum + 0.01)) {
      throw new Error(`المبلغ المدخل أكبر من المتبقي للفاتورة`);
    }
  }
  const id = data.id || uuidv4();
  let collection_number = data.collection_number || '';
  const actorId = data.agent_id || data.user_id || data.collector_id || null;
  const payload = { id, collection_number, project_id: projectId, agent_id: actorId, pos_id: data.pos_id, invoice_id: data.invoice_id, amount: Number(data.amount || 0), method: data.method || 'cash', reference_number: data.reference_number || '', status: data.status || 'pending', approved_at: data.approved_at, rejection_reason: data.rejection_reason, collection_date: data.collection_date || new Date().toISOString().slice(0, 10), active: data.active ?? 1, created_at: data.created_at || new Date().toISOString(), phase_id: data.phase_id || null, synced: 0 };

  // Auto-inject phase_id from active phase if not provided
  if (!payload.phase_id) {
    try {
      const { getActivePhase } = require('./phaseService');
      const activePhase = await getActivePhase(payload.project_id);
      if (activePhase) payload.phase_id = activePhase.id;
    } catch (e) { console.log('[Collection] Could not get active phase:', e.message); }
  }
  if (!payload.phase_id) {
    throw new Error('لا توجد مرحلة نشطة للمشروع الحالي. لا يمكن حفظ التحصيل.');
  }
  if (!payload.agent_id) {
    throw new Error('تعذر تحديد المستخدم الحالي. لا يمكن حفظ التحصيل.');
  }

  for (let i = 0; i < 20; i++) {
    try {
      if (!collection_number) {
        collection_number = await getMonthlySequentialCode({
          table: 'collections',
          column: 'collection_number',
          prefix: 'COL',
          dateValue: payload.collection_date,
        });
      }
      payload.collection_number = collection_number;
      await execSQL(`INSERT OR REPLACE INTO collections (id, project_id, collection_number, agent_id, pos_id, invoice_id, amount, method, reference_number, status, approved_at, rejection_reason, collection_date, active, created_at, phase_id, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [payload.id, payload.project_id, payload.collection_number, payload.agent_id, payload.pos_id, payload.invoice_id, payload.amount, payload.method, payload.reference_number, payload.status, payload.approved_at, payload.rejection_reason, payload.collection_date, payload.active, payload.created_at, payload.phase_id, payload.synced]);
      break;
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (msg.includes('collections.collection_number') || msg.includes('UNIQUE constraint failed')) {
        collection_number = '';
        if (i === 19) throw new Error('تعذر توليد رقم سند تحصيل تسلسلي. حاول مرة أخرى.');
      } else {
        throw e;
      }
    }
  }

  if (payload.invoice_id) await updateInvoiceStatus(payload.invoice_id);
  const operationGroupId = data.operation_group_id || null;
  await addToSyncQueue('collections', 'INSERT', payload, id, operationGroupId);
  notifyDataChanged('collections', payload);
  const { saveNotificationHistory } = require('./NotificationService');
  try { await saveNotificationHistory('💰 تحصيل جديد', `تم تسجيل تحصيل بمبلغ ${payload.amount} ر.ي بنجاح`, { project_id: payload.project_id }); } catch (e) { }

  try {
    const actor = await getUserBasic(payload.agent_id);
    if (actor?.role === 'agent') {
      const posName = await getPOSName(payload.pos_id);
      const { sendRoleBasedPush } = require('./NotificationService');
      await sendRoleBasedPush({
        title: '📥 تحصيل جديد من مندوب',
        body: `${actor.name || 'مندوب'} سجّل تحصيلاً من (${posName}) بقيمة ${payload.amount} ر.ي.`,
        targetRoles: ['cashier', 'admin'],
        excludeUserIds: [actor.id],
        data: {
          project_id: payload.project_id,
          route: 'CollectionsMain',
          actor_id: actor.id,
          actor_name: actor.name || 'مندوب',
          actor_role: actor.role,
          action: 'create_collection',
          collection_id: payload.id,
          delivery_channel: 'push',
        },
      });
    }
  } catch (e) { }
  return payload;
};

export const approveLocalCollection = async (id, notes = '', approvedBy = null) => {
  const guardR = await execSQL(
    `SELECT i.discount_status, i.discount_requested_value
     FROM collections c
     LEFT JOIN invoices i ON i.id = c.invoice_id
     WHERE c.id = ? LIMIT 1`,
    [id]
  );
  const inv = guardR.rows._array?.[0];
  const discountPending =
    Number(inv?.discount_requested_value || 0) > 0 &&
    !['approved', 'auto_approved', 'rejected', 'none', ''].includes(
      String(inv?.discount_status || '').trim()
    );
  if (discountPending) {
    throw new Error('لا يمكن اعتماد التحصيل قبل اعتماد الخصم من المدير.');
  }

  const approved_at = new Date().toISOString();
  await execSQL(`UPDATE collections SET status='approved', approved_at=?, approval_notes=?, rejection_reason=NULL, approved_by=?, synced=0 WHERE id=?`, [approved_at, notes, approvedBy, id]);
  await addToSyncQueue('collections', 'UPDATE', { status: 'approved', approved_at, approval_notes: notes, rejection_reason: null, approved_by: approvedBy }, id);
  const colR = await execSQL(`SELECT invoice_id, pos_id FROM collections WHERE id=?`, [id]);
  const row = colR.rows._array[0];
  if (row?.invoice_id) await updateInvoiceStatus(row.invoice_id);
  const { recalculatePOSCreditBalance } = require('./posService');
  if (row?.pos_id) await recalculatePOSCreditBalance(row.pos_id);
  notifyDataChanged('collections');

  try {
    const actor = await getUserBasic(approvedBy);
    if (actor?.role === 'cashier' || actor?.role === 'admin') {
      const ctx = await getCollectionContext(id);
      const { triggerAppNotification } = require('./NotificationService');
      await triggerAppNotification({
        type: 'collection_approval',
        actor: actor.name || 'محاسب',
        amount: Number(ctx?.amount || 0),
        pos_name: ctx?.pos_name || 'نقطة غير محددة',
        reference_id: id,
        projectId: ctx?.project_id || null,
        targetRoles: ['admin'],
        targetUserIds: ctx?.agent_id ? [ctx.agent_id] : [],
        excludeUserIds: [actor.id],
      });
    }
  } catch (e) { }
  return true;
};

export const cancelLocalCollectionApproval = async (id, actorId = null) => {
  await execSQL(`UPDATE collections SET status='pending', approved_at=NULL, approval_notes=NULL, synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('collections', 'UPDATE', { status: 'pending', approved_at: null, approval_notes: null }, id);
  const colR = await execSQL(`SELECT invoice_id, pos_id FROM collections WHERE id=?`, [id]);
  const row = colR.rows._array[0];
  if (row?.invoice_id) await updateInvoiceStatus(row.invoice_id);
  const { recalculatePOSCreditBalance } = require('./posService');
  if (row?.pos_id) await recalculatePOSCreditBalance(row.pos_id);
  notifyDataChanged('collections');

  try {
    const ctx = await getCollectionContext(id);
    const actor = await getUserBasic(actorId || ctx?.approved_by);
    const actorName = actor?.name || 'مستخدم النظام';
    const { sendRoleBasedPush } = require('./NotificationService');
    await sendRoleBasedPush({
      title: '↩️ إلغاء اعتماد تحصيل',
      body: `${actorName} ألغى اعتماد تحصيل من (${ctx?.pos_name || 'نقطة غير محددة'}) بقيمة ${Number(ctx?.amount || 0)} ر.ي.`,
      targetUserIds: ctx?.agent_id ? [ctx.agent_id] : [],
      excludeUserIds: actor?.id ? [actor.id] : [],
      data: {
        route: 'CollectionsMain',
        project_id: ctx?.project_id || null,
        actor_id: actor?.id || null,
        actor_name: actorName,
        actor_role: actor?.role || null,
        action: 'cancel_collection_approval',
        collection_id: id,
        affected_agent_id: ctx?.agent_id || null,
        delivery_channel: 'push',
      },
    });
  } catch (e) { }
  return true;
};

export const rejectLocalCollection = async (id, reason = 'مرفوض') => {
  await execSQL(`UPDATE collections SET status='rejected', rejection_reason=?, synced=0 WHERE id=?`, [reason, id]);
  await addToSyncQueue('collections', 'UPDATE', { status: 'rejected', rejection_reason: reason }, id);
  const colR = await execSQL(`SELECT invoice_id, pos_id FROM collections WHERE id=?`, [id]);
  const row = colR.rows._array[0];
  if (row?.invoice_id) await updateInvoiceStatus(row.invoice_id);
  const { recalculatePOSCreditBalance } = require('./posService');
  if (row?.pos_id) await recalculatePOSCreditBalance(row.pos_id);
  notifyDataChanged('collections');

  try {
    const ctx = await getCollectionContext(id);
    const actor = await getUserBasic(ctx?.approved_by);
    const actorName = actor?.name || 'الإدارة';
    const { sendRoleBasedPush } = require('./NotificationService');
    await sendRoleBasedPush({
      title: '❌ رفض تحصيل',
      body: `${actorName} رفض تحصيلاً من (${ctx?.pos_name || 'نقطة غير محددة'}) بقيمة ${Number(ctx?.amount || 0)} ر.ي.`,
      targetUserIds: ctx?.agent_id ? [ctx.agent_id] : [],
      excludeUserIds: actor?.id ? [actor.id] : [],
      data: {
        route: 'CollectionsMain',
        project_id: ctx?.project_id || null,
        actor_id: actor?.id || null,
        actor_name: actorName,
        actor_role: actor?.role || null,
        action: 'reject_collection',
        collection_id: id,
        affected_agent_id: ctx?.agent_id || null,
        delivery_channel: 'push',
      },
    });
  } catch (e) { }
  return true;
};

export const deleteLocalCollection = async (id, actorId = null) => {
  await execSQL("UPDATE collections SET active=0, status='cancelled', synced=0 WHERE id=?", [id]);
  await addToSyncQueue('collections', 'UPDATE', { active: 0, status: 'cancelled' }, id);
  const colR = await execSQL(`SELECT invoice_id FROM collections WHERE id=?`, [id]);
  if (colR.rows._array[0]?.invoice_id) await updateInvoiceStatus(colR.rows._array[0].invoice_id);
  notifyDataChanged('collections');

  try {
    const ctx = await getCollectionContext(id);
    const actor = await getUserBasic(actorId);
    const actorName = actor?.name || 'مستخدم النظام';
    const { sendRoleBasedPush } = require('./NotificationService');
    await sendRoleBasedPush({
      title: '🚫 إلغاء تحصيل',
      body: `${actorName} ألغى تحصيلاً من (${ctx?.pos_name || 'نقطة غير محددة'}) بقيمة ${Number(ctx?.amount || 0)} ر.ي.`,
      targetUserIds: ctx?.agent_id ? [ctx.agent_id] : [],
      excludeUserIds: actor?.id ? [actor.id] : [],
      data: {
        route: 'CollectionsMain',
        project_id: ctx?.project_id || null,
        actor_id: actor?.id || null,
        actor_name: actorName,
        actor_role: actor?.role || null,
        action: 'cancel_collection',
        collection_id: id,
        affected_agent_id: ctx?.agent_id || null,
        delivery_channel: 'push',
      },
    });
  } catch (e) { }
  return true;
};

export const getCollectionsForSupply = async (agentId, dateFilter = null, cashierId = null, phaseId = null, projectId = null) => {
  if (!projectId) {
    console.log('[CollectionsForSupply] blocked load without project_id');
    return [];
  }
  console.log(`[CollectionsForSupply] load project_id=${projectId} phase_id=${phaseId || 'all'} agent_id=${agentId || 'all'}`);
  const cacheKey = `collections:supply:${agentId}:${dateFilter}:${cashierId}:${phaseId}:${projectId}`;
  return getCached(cacheKey, async () => {
    let sql = `SELECT c.*, p.name as pos_name, i.invoice_number, u.name as agent_name FROM collections c LEFT JOIN pos_customers p ON p.id = c.pos_id AND p.project_id = c.project_id LEFT JOIN invoices i ON i.id = c.invoice_id AND i.project_id = c.project_id AND ${ACTIVE_INVOICE_CLAUSE} LEFT JOIN users u ON u.id = c.agent_id AND u.project_id = c.project_id WHERE c.status = 'approved' AND c.supply_id IS NULL AND (c.active = 1 OR c.active = 'true')`;
    const params = [];
    sql += ` AND c.project_id = ?`;
    params.push(projectId);
    if (agentId && agentId !== 'all') { sql += ` AND c.agent_id = ?`; params.push(agentId); }
    if (dateFilter) { sql += ` AND date(c.collection_date) = date(?)`; params.push(dateFilter); }
    if (cashierId) { sql += ` AND c.approved_by = ?`; params.push(cashierId); }
    if (phaseId) { sql += ` AND c.phase_id = ?`; params.push(phaseId); }
    sql += ` ORDER BY c.collection_date ASC`;
    const r = await execSQL(sql, params);
    return r.rows._array || [];
  });
};
