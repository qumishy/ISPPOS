import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4, ensureSingleRowAffected } from './dbCore';
import { updateInvoiceStatus, decorateInvoiceStatusFields, resolveInvoiceNetAmount, isCashInvoiceType } from './invoiceService';
import { createInvoiceCardReturns, cancelInvoiceCardReturns } from './invoiceCardReturnService';
import { getCached } from './cacheService';
import { getScopedMonthlySequentialCode } from './documentNumberService';
import {
  AGENT_SELF_COLLECTION_APPROVAL_PERMISSION,
  getCollectionApprovalDecision,
  hasUnresolvedCollectionDiscount,
} from './permissionPolicy';
import { hasEffectivePermission } from './permissionsService';

const ACTIVE_INVOICE_CLAUSE = `(COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL AND (i.active = 1 OR i.active IS NULL OR i.active = 'true'))`;

const MONEY_EPSILON = 0.01;
const AGENT_VISIBILITY_EPSILON = 0.1;
const cashInvoiceCollectionLocks = new Map();

const toNumber = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const shouldHideCollectionFromAgentList = (collectionLike = {}, userRole) => {
  const normalizedRole = String(userRole || '').trim().toLowerCase();
  if (!['agent', 'مندوب'].includes(normalizedRole)) return false;

  const collectionStatus = String(collectionLike.status || '').trim().toLowerCase();
  if (!['approved', 'معتمدة'].includes(collectionStatus)) return false;

  const invoicePaymentStatus = String(collectionLike.inv_payment_status || '').trim().toLowerCase();
  const invoiceApprovalStatus = String(collectionLike.inv_approval_status || '').trim().toLowerCase();
  const paidAndApproved = ['paid', 'مسددة'].includes(invoicePaymentStatus)
    && ['approved', 'معتمدة'].includes(invoiceApprovalStatus);

  const invoiceNet = toNumber(
    collectionLike.inv_net
      ?? collectionLike.inv_net_amount
      ?? collectionLike.invoice_net_amount
      ?? 0
  );
  const approvedCoverage = toNumber(
    collectionLike.inv_effective_approved_amount
      ?? collectionLike.inv_approved_amount
      ?? collectionLike.inv_approved
      ?? 0
  );
  const hasFullApprovedCoverage = invoiceNet > AGENT_VISIBILITY_EPSILON
    && approvedCoverage >= (invoiceNet - AGENT_VISIBILITY_EPSILON);

  return paidAndApproved || hasFullApprovedCoverage;
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
      : `(c.active = 1 OR c.active = 'true' OR c.active IS NULL) AND LOWER(COALESCE(c.status, 'pending')) NOT IN ('deleted', 'cancelled', 'canceled', 'rejected')`;
    const invoiceJoinClause = filters.includeInactive
      ? `(COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL)`
      : ACTIVE_INVOICE_CLAUSE;
    let sql = `SELECT
      c.*,
      u.name as agent_name,
      p.name as pos_name,
      p.phone as pos_phone,
      i.invoice_number,
      CASE WHEN COALESCE(i.discount_status, 'none') IN ('approved', 'auto_approved')
        THEN MAX(0, COALESCE(NULLIF(i.net_amount, 0), COALESCE(i.total_amount, 0) - COALESCE(i.discount_applied_value, 0)))
        ELSE COALESCE(i.total_amount, 0)
      END as inv_net,
      (SELECT COALESCE(SUM(cr.return_amount), 0)
       FROM invoice_card_returns cr
       WHERE cr.invoice_id = i.id
         AND (cr.active = 1 OR cr.active IS NULL OR cr.active = 'true')
         AND LOWER(COALESCE(cr.status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted')) as inv_total_card_returns,
      (SELECT COALESCE(SUM(cr.return_amount), 0)
       FROM invoice_card_returns cr
       WHERE cr.invoice_id = i.id
         AND (cr.active = 1 OR cr.active IS NULL OR cr.active = 'true')
         AND LOWER(COALESCE(cr.status, 'pending')) = 'approved'
         AND EXISTS (
           SELECT 1
           FROM collections pc
           WHERE pc.id = cr.collection_id
             AND pc.invoice_id = i.id
             AND (pc.active = 1 OR pc.active IS NULL OR pc.active = 'true')
             AND LOWER(COALESCE(pc.status, 'pending')) = 'approved'
         )) as inv_approved_card_returns_total,
      (SELECT COALESCE(SUM(cr.return_amount), 0)
       FROM invoice_card_returns cr
       WHERE cr.collection_id = c.id
         AND (cr.active = 1 OR cr.active IS NULL OR cr.active = 'true')) as inv_collection_linked_returns_total,
      (SELECT COALESCE(SUM(cr.return_amount), 0)
       FROM invoice_card_returns cr
       WHERE cr.collection_id = c.id
         AND (cr.active = 1 OR cr.active IS NULL OR cr.active = 'true')
         AND LOWER(COALESCE(cr.status, 'pending')) = 'approved') as inv_collection_linked_approved_returns_total,
      (SELECT COALESCE(SUM(cr.return_amount), 0)
       FROM invoice_card_returns cr
       WHERE cr.invoice_id = i.id
         AND (cr.active = 1 OR cr.active IS NULL OR cr.active = 'true')
         AND LOWER(COALESCE(cr.status, 'pending')) = 'pending') as inv_pending_card_returns,
      (SELECT COUNT(1)
       FROM collections pc
       WHERE pc.invoice_id = i.id
         AND (pc.active = 1 OR pc.active IS NULL OR pc.active = 'true')
         AND LOWER(COALESCE(pc.status, 'pending')) IN ('pending', 'pending_card_return_approval')) as inv_pending_collections_count,
      (SELECT COUNT(1)
       FROM collections rc
       WHERE rc.invoice_id = i.id
         AND (rc.active = 1 OR rc.active IS NULL OR rc.active = 'true')
         AND LOWER(COALESCE(rc.status, 'pending')) = 'rejected') as inv_rejected_approval_count,
      i.total_amount as inv_total_amount,
      i.discount_applied_value as inv_discount_applied_value,
      i.discount_status as inv_discount_status,
      i.discount_requested_value as inv_discount_requested_value,
      i.status as inv_status,
      (SELECT COUNT(1)
       FROM invoice_card_returns cr
       WHERE cr.collection_id = c.id
         AND cr.project_id = c.project_id
         AND (cr.active = 1 OR cr.active IS NULL OR cr.active = 'true')
         AND LOWER(TRIM(COALESCE(cr.status, 'pending'))) NOT IN ('approved', 'rejected', 'cancelled', 'canceled', 'deleted')) as inv_collection_pending_card_returns_count,
      (SELECT COALESCE(SUM(pc.amount), 0)
       FROM collections pc
       WHERE pc.invoice_id = i.id
         AND (pc.active = 1 OR pc.active IS NULL OR pc.active = 'true')
         AND LOWER(COALESCE(pc.status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted'))
       +
      (SELECT COALESCE(SUM(cr.return_amount), 0)
       FROM invoice_card_returns cr
       WHERE cr.invoice_id = i.id
         AND (cr.active = 1 OR cr.active IS NULL OR cr.active = 'true')
         AND LOWER(COALESCE(cr.status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted')) as inv_paid,
      (SELECT COALESCE(SUM(ac.amount), 0)
       FROM collections ac
       WHERE ac.invoice_id = i.id
         AND (ac.active = 1 OR ac.active IS NULL OR ac.active = 'true')
         AND LOWER(COALESCE(ac.status, 'pending')) = 'approved')
       +
      (SELECT COALESCE(SUM(cr.return_amount), 0)
       FROM invoice_card_returns cr
       WHERE cr.invoice_id = i.id
         AND (cr.active = 1 OR cr.active IS NULL OR cr.active = 'true')
         AND LOWER(COALESCE(cr.status, 'pending')) = 'approved'
         AND EXISTS (
           SELECT 1
           FROM collections c2
           WHERE c2.id = cr.collection_id
             AND c2.invoice_id = i.id
             AND (c2.active = 1 OR c2.active IS NULL OR c2.active = 'true')
             AND LOWER(COALESCE(c2.status, 'pending')) = 'approved'
         )) as inv_approved,
      apr.name as approver_name
      FROM collections c
      LEFT JOIN users u ON u.id = c.agent_id AND u.project_id = c.project_id
      LEFT JOIN pos_customers p ON p.id = c.pos_id AND p.project_id = c.project_id
      LEFT JOIN invoices i ON i.id = c.invoice_id AND i.project_id = c.project_id AND ${invoiceJoinClause}
      LEFT JOIN users apr ON apr.id = c.approved_by AND apr.project_id = c.project_id
      WHERE ${activeClause}`;
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
      const collectionAmount = Number(row.amount || 0);
      const linkedReturnsTotal = Number(row.inv_collection_linked_returns_total || 0);
      const linkedApprovedReturnsTotal = Number(row.inv_collection_linked_approved_returns_total || 0);
      const collectionCoverageAmount = collectionAmount + linkedReturnsTotal;
      const remainingAfterThisRequest = Math.max(0, Number(row.inv_net || 0) - Number(row.inv_paid || 0));
      const invoiceFields = decorateInvoiceStatusFields({
        total_amount: row.inv_total_amount,
        net_amount: row.inv_net,
        total_card_returns: row.inv_total_card_returns,
        approved_card_returns_total: row.inv_approved_card_returns_total,
        discount_applied_value: row.inv_discount_applied_value,
        discount_status: row.inv_discount_status,
        paid_amount: row.inv_paid,
        approved_amount: row.inv_approved,
        pending_card_returns_total: row.inv_pending_card_returns,
        pending_collections_count: row.inv_pending_collections_count,
        rejected_approval_count: row.inv_rejected_approval_count,
        status: row.inv_status,
      });
      let invApprovalStatus = invoiceFields.approval_status;
      const collectionStatus = String(row.status || 'pending').toLowerCase();
      if (collectionStatus === 'pending_card_return_approval') invApprovalStatus = 'pending_card_return_approval';
      else if (collectionStatus === 'pending' || collectionStatus === 'pending_collection_approval') invApprovalStatus = 'pending_collection_approval';
      else if (collectionStatus === 'rejected') invApprovalStatus = 'rejected';
      return {
        ...row,
        inv_payment_status: invoiceFields.payment_status,
        inv_approval_status: invApprovalStatus,
        inv_payment_remaining_amount: invoiceFields.payment_remaining_amount,
        inv_approval_remaining_amount: invoiceFields.approval_remaining_amount,
        inv_approved_card_returns_total: invoiceFields.approved_card_returns_total,
        inv_pending_card_returns_total: invoiceFields.pending_card_returns_total,
        inv_effective_paid_amount: invoiceFields.effective_paid_amount,
        inv_effective_approved_amount: invoiceFields.approval_coverage_amount,
        inv_approved_amount: invoiceFields.approved_amount,
        inv_net_after_returns: invoiceFields.net_after_returns,
        inv_collection_amount: collectionAmount,
        inv_collection_linked_returns_total: linkedReturnsTotal,
        inv_collection_linked_approved_returns_total: linkedApprovedReturnsTotal,
        inv_collection_coverage_amount: collectionCoverageAmount,
        inv_collection_remaining_after_request: remainingAfterThisRequest,
        inv_collection_coverage_complete: remainingAfterThisRequest <= 0.1 ? 1 : 0,
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
  const invRes = await execSQL(`SELECT total_amount, net_amount, discount_applied_value, discount_status, discount_requested_value FROM invoices WHERE id = ? AND project_id = ?`, [data.invoice_id, projectId]);
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
    const incomingReturnAmount = (Array.isArray(data.card_returns) ? data.card_returns : [])
      .reduce((sum, row) => sum + Math.max(0, toNumber(row.returned_cards_count)) * Math.max(0, toNumber(row.card_value)), 0);
    const paymentCollectionsR = await execSQL(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM collections
       WHERE invoice_id = ?
         AND (active = 1 OR active = 'true' OR active IS NULL)
         AND LOWER(COALESCE(status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted')`,
      [data.invoice_id]
    );
    const paymentReturnsR = await execSQL(
      `SELECT COALESCE(SUM(return_amount), 0) as total
       FROM invoice_card_returns
       WHERE invoice_id = ?
         AND (active = 1 OR active = 'true' OR active IS NULL)
         AND LOWER(COALESCE(status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted')`,
      [data.invoice_id]
    );
    const remainingBeforeRequest = Math.max(
      0,
      resolveInvoiceNetAmount(invoice) -
        Number(paymentCollectionsR.rows._array?.[0]?.total || 0) -
        Number(paymentReturnsR.rows._array?.[0]?.total || 0)
    );
    const requestedCoverage = Math.max(0, toNumber(data.amount)) + incomingReturnAmount;
    if (requestedCoverage > remainingBeforeRequest + MONEY_EPSILON) {
      throw new Error(`المبلغ مع المرتجع أكبر من المتبقي للفاتورة`);
    }
  }
  const requestedReturns = (Array.isArray(data.card_returns) ? data.card_returns : [])
    .filter(row => Math.max(0, Number(row.returned_cards_count || 0)) > 0);
  const hasCardReturns = requestedReturns.length > 0;
  const id = data.id || uuidv4();
  let collection_number = data.collection_number || '';
  const actorId = data.agent_id || data.user_id || data.collector_id || null;
  const payload = { id, collection_number, project_id: projectId, agent_id: actorId, pos_id: data.pos_id, invoice_id: data.invoice_id, amount: toNumber(data.amount), method: data.method || 'cash', reference_number: data.reference_number || '', status: hasCardReturns ? 'pending_card_return_approval' : (data.status || 'pending'), approved_at: data.approved_at, rejection_reason: data.rejection_reason, collection_date: data.collection_date || new Date().toISOString().slice(0, 10), active: data.active ?? 1, created_at: data.created_at || new Date().toISOString(), phase_id: data.phase_id || null, synced: 0 };

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
        collection_number = await getScopedMonthlySequentialCode({
          table: 'collections',
          column: 'collection_number',
          prefix: 'COL',
          dateValue: payload.collection_date,
          projectId: payload.project_id,
          phaseId: payload.phase_id,
          agentId: payload.agent_id,
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

  const operationGroupId = data.operation_group_id || null;
  await addToSyncQueue('collections', 'INSERT', payload, id, operationGroupId);
  if (hasCardReturns) {
    await createInvoiceCardReturns({
      invoiceId: payload.invoice_id,
      collectionId: payload.id,
      returns: requestedReturns,
      projectId: payload.project_id,
      phaseId: payload.phase_id,
      createdBy: payload.agent_id,
      operationGroupId,
      reason: data.return_reason || data.notes || '',
    });
  }
  if (payload.invoice_id) await updateInvoiceStatus(payload.invoice_id);
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

export const createCollectionForCashInvoiceIfNeeded = async (invoice = {}, context = {}) => {
  if (!isCashInvoiceType(invoice.type)) return null;
  if (!invoice.id || !invoice.project_id) {
    throw new Error('تعذر تحديد الفاتورة النقدية أو المشروع لإنشاء التحصيل التلقائي.');
  }

  const lockKey = `${invoice.project_id}:${invoice.id}`;
  if (cashInvoiceCollectionLocks.has(lockKey)) return cashInvoiceCollectionLocks.get(lockKey);

  const creationPromise = (async () => {
    const existingR = await execSQL(
      `SELECT * FROM collections
       WHERE invoice_id = ? AND project_id = ?
         AND (active = 1 OR active = 'true' OR active IS NULL)
       ORDER BY created_at ASC
       LIMIT 1`,
      [invoice.id, invoice.project_id]
    );
    const existing = existingR.rows._array?.[0];
    if (existing) {
      await updateInvoiceStatus(invoice.id);
      return existing;
    }

    const amount = resolveInvoiceNetAmount(invoice);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('تعذر تحديد صافي مبلغ الفاتورة النقدية.');
    }

    return createLocalCollection({
      invoice_id: invoice.id,
      pos_id: invoice.pos_id,
      agent_id: invoice.agent_id,
      project_id: invoice.project_id,
      phase_id: invoice.phase_id || null,
      amount,
      method: 'cash',
      collection_date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
      status: 'pending',
      active: 1,
      operation_group_id: context.operation_group_id || context.operationGroupId || null,
    });
  })();

  cashInvoiceCollectionLocks.set(lockKey, creationPromise);
  try {
    return await creationPromise;
  } finally {
    cashInvoiceCollectionLocks.delete(lockKey);
  }
};

export const approveLocalCollection = async (id, notes = '', approvedBy = null) => {
  if (!approvedBy) throw new Error('تعذر التحقق من المستخدم المخول بالاعتماد.');
  const actorR = await execSQL(
    `SELECT id, role, active, project_id
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [approvedBy]
  );
  const actor = actorR.rows._array?.[0] || null;
  const collectionR = await execSQL(
    `SELECT c.id, c.project_id, c.phase_id, c.invoice_id, c.pos_id, c.agent_id, c.status, c.active,
            i.discount_status, i.discount_requested_value
     FROM collections c
     LEFT JOIN invoices i ON i.id = c.invoice_id AND i.project_id = c.project_id
     WHERE c.id = ? LIMIT 1`,
    [id]
  );
  const collection = collectionR.rows._array?.[0] || null;
  const actorRole = String(actor?.role || '').trim().toLowerCase();
  const hasAgentSelfApprovalPermission = actorRole === 'agent'
    ? await hasEffectivePermission(actor, AGENT_SELF_COLLECTION_APPROVAL_PERMISSION)
    : false;

  const pendingReturnsR = await execSQL(
    `SELECT id FROM invoice_card_returns
     WHERE collection_id = ?
       AND project_id = ?
       AND (active = 1 OR active = 'true' OR active IS NULL)
       AND LOWER(TRIM(COALESCE(status, 'pending'))) NOT IN ('approved', 'rejected', 'cancelled', 'canceled', 'deleted')
     LIMIT 1`,
    [id, collection?.project_id || '']
  );
  const decision = getCollectionApprovalDecision({
    actor,
    collection,
    hasAgentSelfApprovalPermission,
    hasPendingCardReturn: String(collection?.status || '').trim().toLowerCase() === 'pending_card_return_approval'
      || (pendingReturnsR.rows._array || []).length > 0,
    hasBlockingDiscount: hasUnresolvedCollectionDiscount(collection || {}),
  });
  if (!decision.allowed) throw new Error(decision.message);

  const approved_at = new Date().toISOString();
  const updateResult = await execSQL(
    `UPDATE collections
     SET status = 'approved', approved_at = ?, approval_notes = ?, rejection_reason = NULL, approved_by = ?, synced = 0
     WHERE id = ?
       AND project_id = ?
       AND (active = 1 OR active = 'true' OR active IS NULL)
       AND LOWER(TRIM(COALESCE(status, 'pending'))) IN ('pending', 'pending_collection_approval')
       AND (? <> 'agent' OR agent_id = ?)
       AND (
         ? <> 'agent'
         OR COALESCE((
           SELECT assigned_permission.can_view
           FROM app_permissions assigned_permission
           WHERE assigned_permission.project_id = collections.project_id
             AND UPPER(TRIM(assigned_permission.entity_type)) = 'USER'
             AND assigned_permission.entity_id = ?
             AND assigned_permission.screen_name = ?
           ORDER BY COALESCE(assigned_permission.updated_at, assigned_permission.created_at, '') DESC,
                    assigned_permission.id DESC
           LIMIT 1
         ), 0) IN (1, '1', 'true')
       )
       AND EXISTS (
         SELECT 1
         FROM users current_actor
         WHERE current_actor.id = ?
           AND current_actor.project_id = collections.project_id
           AND (current_actor.active = 1 OR current_actor.active = 'true')
           AND LOWER(TRIM(current_actor.role)) = ?
       )
       AND NOT EXISTS (
         SELECT 1
         FROM invoice_card_returns pending_return
         WHERE pending_return.collection_id = collections.id
           AND pending_return.project_id = collections.project_id
           AND (pending_return.active = 1 OR pending_return.active = 'true' OR pending_return.active IS NULL)
           AND LOWER(TRIM(COALESCE(pending_return.status, 'pending'))) NOT IN ('approved', 'rejected', 'cancelled', 'canceled', 'deleted')
       )
       AND NOT EXISTS (
         SELECT 1
         FROM invoices blocked_invoice
         WHERE blocked_invoice.id = collections.invoice_id
           AND blocked_invoice.project_id = collections.project_id
           AND COALESCE(blocked_invoice.discount_requested_value, 0) > 0
           AND LOWER(TRIM(COALESCE(blocked_invoice.discount_status, ''))) NOT IN ('approved', 'auto_approved', 'rejected', 'none', '')
       )`,
    [
      approved_at,
      notes,
      approvedBy,
      id,
      collection.project_id,
      String(actor.role || '').trim().toLowerCase(),
      actor.id,
      actorRole,
      actor.id,
      AGENT_SELF_COLLECTION_APPROVAL_PERMISSION,
      actor.id,
      String(actor.role || '').trim().toLowerCase(),
    ]
  );
  try {
    ensureSingleRowAffected(updateResult, `approve collection ${id}`);
  } catch (error) {
    throw new Error('تعذر اعتماد التحصيل لأن حالته تغيرت. حدّث القائمة وحاول مرة أخرى.');
  }
  await addToSyncQueue('collections', 'UPDATE', {
    status: 'approved',
    approved_at,
    approval_notes: notes,
    rejection_reason: null,
    approved_by: approvedBy,
    project_id: collection.project_id,
    phase_id: collection.phase_id || null,
  }, id);
  if (collection.invoice_id) await updateInvoiceStatus(collection.invoice_id);
  const { recalculatePOSCreditBalance } = require('./posService');
  if (collection.pos_id) await recalculatePOSCreditBalance(collection.pos_id);
  notifyDataChanged('collections');
  notifyDataChanged('invoices');

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
  const colR = await execSQL(`SELECT * FROM collections WHERE id=? LIMIT 1`, [id]);
  const collection = colR.rows._array?.[0];
  if (!collection) throw new Error('التحصيل غير موجود');

  const operationGroupId = uuidv4();
  await execSQL(
    `UPDATE collections
     SET active = 0,
         status = 'cancelled',
         synced = 0
     WHERE id = ?
       AND (active = 1 OR active = 'true' OR active IS NULL OR LOWER(COALESCE(status, 'pending')) NOT IN ('cancelled', 'canceled'))`,
    [id]
  );
  await addToSyncQueue('collections', 'UPDATE', {
    active: 0,
    status: 'cancelled',
    project_id: collection.project_id || null,
    phase_id: collection.phase_id || null,
  }, id, operationGroupId);

  await cancelInvoiceCardReturns({
    collectionId: id,
    invoiceId: collection.invoice_id || null,
    reason: 'إلغاء التحصيل',
    operationGroupId,
  });

  if (collection.invoice_id) await updateInvoiceStatus(collection.invoice_id);
  try {
    const { recalculatePOSCreditBalance } = require('./posService');
    if (collection.pos_id) await recalculatePOSCreditBalance(collection.pos_id);
  } catch (e) { }
  notifyDataChanged('invoice_card_returns');
  notifyDataChanged('invoices');
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

export const getCollectionsForSupply = async (agentId, dateFilter = null, approverId = null, phaseId = null, projectId = null) => {
  if (!projectId || !phaseId || !approverId) {
    console.log('[CollectionsForSupply] blocked load without project_id, phase_id, or approver_id');
    return [];
  }
  console.log(`[CollectionsForSupply] load project_id=${projectId} phase_id=${phaseId || 'all'} agent_id=${agentId || 'all'}`);
  const cacheKey = `collections:supply:${agentId}:${dateFilter}:${approverId}:${phaseId}:${projectId}`;
  return getCached(cacheKey, async () => {
    let sql = `SELECT c.*, p.name as pos_name, i.invoice_number, u.name as agent_name FROM collections c LEFT JOIN pos_customers p ON p.id = c.pos_id AND p.project_id = c.project_id LEFT JOIN invoices i ON i.id = c.invoice_id AND i.project_id = c.project_id AND ${ACTIVE_INVOICE_CLAUSE} LEFT JOIN users u ON u.id = c.agent_id AND u.project_id = c.project_id WHERE LOWER(TRIM(COALESCE(c.status, 'pending'))) = 'approved' AND c.supply_id IS NULL AND (c.active = 1 OR c.active = 'true')`;
    const params = [];
    sql += ` AND c.project_id = ?`;
    params.push(projectId);
    sql += ` AND c.phase_id = ? AND c.approved_by = ?`; params.push(phaseId, approverId);
    if (agentId && agentId !== 'all') { sql += ` AND c.agent_id = ?`; params.push(agentId); }
    if (dateFilter) { sql += ` AND date(c.collection_date) = date(?)`; params.push(dateFilter); }
    sql += ` ORDER BY c.collection_date ASC`;
    const r = await execSQL(sql, params);
    return r.rows._array || [];
  });
};
