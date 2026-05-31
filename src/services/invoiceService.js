import { execSQL, withTransaction, addToSyncQueue, notifyDataChanged, getSetting, uuidv4, ensureSingleRowAffected } from './dbCore';
import { getCached } from './cacheService';
import { backfillOperationsFromSyncQueue } from './operationLogger';

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

const isApprovedDiscount = (invoiceLike) =>
  ['approved', 'auto_approved'].includes(String(invoiceLike?.discount_status || '').trim());

const deriveNetAmount = (invoiceLike) => {
  const gross = Number(invoiceLike?.total_amount || 0);
  const applied = isApprovedDiscount(invoiceLike)
    ? Math.max(0, Number(invoiceLike?.discount_applied_value || 0))
    : 0;
  return Math.max(0, gross - applied);
};

const STATUS_EPSILON = 0.1;
const isPendingDiscountApproval = (invoiceLike) =>
  String(invoiceLike?.discount_status || '').trim() === 'pending_discount_approval';

export const resolveInvoiceNetAmount = (invoiceLike) => {
  if (!isApprovedDiscount(invoiceLike)) return Math.max(0, Number(invoiceLike?.total_amount || 0));
  const explicitNet = Number(invoiceLike?.net_amount);
  if (Number.isFinite(explicitNet)) return Math.max(0, explicitNet);
  return deriveNetAmount(invoiceLike);
};

const resolveInvoicePaidAmount = (invoiceLike) => {
  const raw = invoiceLike?.paid_amount ?? invoiceLike?.paid_sum ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

const resolveInvoiceApprovedAmount = (invoiceLike) => {
  const raw = invoiceLike?.approved_amount ?? invoiceLike?.approved_sum ?? invoiceLike?.partially_paid_amount ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

export const deriveInvoicePaymentStatus = (invoiceLike) => {
  if (invoiceLike?.status === 'cancelled') return 'cancelled';
  const net = resolveInvoiceNetAmount(invoiceLike);
  const paid = resolveInvoicePaidAmount(invoiceLike);
  if (paid <= STATUS_EPSILON) return 'pending';
  if (paid >= (net - STATUS_EPSILON)) return 'paid';
  return 'partial';
};

export const deriveInvoiceApprovalStatus = (invoiceLike) => {
  if (invoiceLike?.status === 'cancelled') return 'cancelled';
  const net = resolveInvoiceNetAmount(invoiceLike);
  const approved = resolveInvoiceApprovedAmount(invoiceLike);
  if (approved <= STATUS_EPSILON) return 'unapproved';
  if (approved >= (net - STATUS_EPSILON)) return 'approved';
  return 'approval_partial';
};

export const decorateInvoiceStatusFields = (invoiceLike = {}) => {
  const net = resolveInvoiceNetAmount(invoiceLike);
  const paid = resolveInvoicePaidAmount(invoiceLike);
  const approved = resolveInvoiceApprovedAmount(invoiceLike);
  const paymentStatus = deriveInvoicePaymentStatus({ ...invoiceLike, net_amount: net, paid_amount: paid });
  const approvalStatus = deriveInvoiceApprovalStatus({ ...invoiceLike, net_amount: net, approved_amount: approved });
  const paymentRemaining = Math.max(0, net - paid);
  const approvalRemaining = Math.max(0, net - approved);
  const delayDaysNum = Number(invoiceLike?.delay_days);
  const hasDelayDays = Number.isFinite(delayDaysNum);
  const countdownDays = hasDelayDays ? (-delayDaysNum) : null;
  const countdownActive = paymentRemaining > STATUS_EPSILON && countdownDays !== null && paymentStatus !== 'cancelled';
  const countdownTone = !countdownActive
    ? 'muted'
    : countdownDays < 0
      ? 'danger'
      : countdownDays <= 2
        ? 'warning'
        : 'success';
  const countdownLabel = paymentStatus === 'cancelled'
    ? 'ملغاة'
    : !countdownActive
      ? 'مسددة'
      : countdownDays < 0
        ? `${countdownDays}`
        : `+${countdownDays}`;

  return {
    ...invoiceLike,
    net_amount: net,
    status: paymentStatus,
    payment_status: paymentStatus,
    approval_status: approvalStatus,
    paid_amount: paid,
    approved_amount: approved,
    paid_sum: paid,
    approved_sum: approved,
    partially_paid_amount: approved,
    remaining_amount: paymentRemaining,
    payment_remaining_amount: paymentRemaining,
    remaining_unpaid_amount: approvalRemaining,
    approval_remaining_amount: approvalRemaining,
    overdue_countdown_days: countdownActive ? countdownDays : null,
    overdue_countdown_label: countdownLabel,
    overdue_countdown_tone: countdownTone,
    overdue_countdown_active: countdownActive ? 1 : 0,
  };
};

export const ACTIVE_INVOICE_WHERE_CLAUSE = `(COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL AND (i.active = 1 OR i.active = 'true' OR i.active IS NULL))`;
const ACTIVE_INVOICE_WHERE_CLAUSE_NO_ALIAS = `(COALESCE(is_deleted, 0) = 0 AND deleted_at IS NULL AND (active = 1 OR active = 'true' OR active IS NULL))`;
const ACTIVE_COLLECTION_CLAUSE = (alias = 'c') =>
  `(${alias}.active = 1 OR ${alias}.active = 'true' OR ${alias}.active IS NULL) AND LOWER(COALESCE(${alias}.status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted')`;
const APPROVED_COLLECTION_CLAUSE = (alias = 'c') =>
  `(${alias}.active = 1 OR ${alias}.active = 'true' OR ${alias}.active IS NULL) AND ${alias}.status = 'approved'`;
const INVOICE_AMOUNT_EXPR = (alias = 'i') =>
  `MAX(0, CASE WHEN COALESCE(${alias}.discount_status, 'none') IN ('approved', 'auto_approved')
    THEN COALESCE(NULLIF(${alias}.net_amount, 0), COALESCE(${alias}.total_amount, 0) - COALESCE(${alias}.discount_applied_value, 0))
    ELSE COALESCE(${alias}.total_amount, 0)
  END)`;

export const getInvoiceCountdownMeta = (invoiceLike = {}) => {
  const decorated = decorateInvoiceStatusFields(invoiceLike);
  return {
    label: decorated.overdue_countdown_label,
    days: decorated.overdue_countdown_days,
    tone: decorated.overdue_countdown_tone,
    active: Boolean(decorated.overdue_countdown_active),
  };
};

const addDiscountDecisionAudit = async ({
  invoiceId,
  requestedBy,
  requestedValue,
  requestedReason,
  appliedValue,
  approvedBy,
  approvedAt,
  status,
  decisionNote = ''
}) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  const payload = {
    id,
    invoice_id: invoiceId,
    requested_by: requestedBy || null,
    requested_value: Number(requestedValue || 0),
    requested_reason: requestedReason || '',
    applied_value: Number(appliedValue || 0),
    approved_by: approvedBy || null,
    approved_at: approvedAt || null,
    status,
    decision_note: decisionNote,
    created_at: now,
    updated_at: now,
    synced: 0,
    project_id: data.project_id
  };
  await execSQL(
    `INSERT INTO invoice_discount_approvals
      (id, invoice_id, requested_by, requested_value, requested_reason, applied_value, approved_by, approved_at, status, decision_note, created_at, updated_at, synced, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.invoice_id, payload.requested_by, payload.requested_value, payload.requested_reason, payload.applied_value, payload.approved_by, payload.approved_at, payload.status, payload.decision_note, payload.created_at, payload.updated_at, payload.synced, payload.project_id]
  );
  await addToSyncQueue('invoice_discount_approvals', 'INSERT', payload, id);
};

export const getLocalInvoices = async (filters = {}) => {
  if (!filters.project_id) {
    console.log('[Invoices] blocked load without project_id');
    return [];
  }
  const cacheKey = `invoices:filters:${JSON.stringify(filters)}`;
  return getCached(cacheKey, async () => {
    const overdueDays = Number(await getSetting('overdue_days', '20')) || 20;
    const overdueDaysInt = Math.max(0, Math.floor(overdueDays));
    const dueDateExpr = `date(COALESCE(i.due_date, date(COALESCE(i.invoice_date, i.created_at), '+${overdueDaysInt} days')))`;
    const delayDaysExpr = `CAST(julianday(date('now','localtime')) - julianday(${dueDateExpr}) AS INTEGER)`;
    const invoiceAmountExpr = INVOICE_AMOUNT_EXPR('i');
    const payableCollectionsExpr = `(SELECT COALESCE(SUM(c.amount), 0)
      FROM collections c
      WHERE c.invoice_id = i.id
        AND ${ACTIVE_COLLECTION_CLAUSE('c')})`;
    const approvedCollectionsExpr = `(SELECT COALESCE(SUM(c.amount), 0)
      FROM collections c
      WHERE c.invoice_id = i.id
        AND ${APPROVED_COLLECTION_CLAUSE('c')})`;

    let whereClause = ACTIVE_INVOICE_WHERE_CLAUSE;
    if (filters.includeInactive) {
      whereClause = `(COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL)`;
    }
    let where = `WHERE ${whereClause}`;
    const params = [];

    if (filters.phase_id) {
      where += " AND i.phase_id = ?";
      params.push(filters.phase_id);
    }
    if (filters.project_id) {
      where += " AND i.project_id = ?";
      params.push(filters.project_id);
    }
    if (filters.agent_id) {
      where += " AND i.agent_id = ?";
      params.push(filters.agent_id);
    }
    if (filters.pos_id) {
      where += " AND i.pos_id = ?";
      params.push(filters.pos_id);
    }

    let sql = `
SELECT 
  i.*,
  ${payableCollectionsExpr} as paid_sum,
  ${approvedCollectionsExpr} as approved_sum,
  ${approvedCollectionsExpr} as partially_paid_amount,
  ${dueDateExpr} as effective_due_date,
  ${invoiceAmountExpr} as effective_invoice_amount,
  MAX(0, ${invoiceAmountExpr} - (${approvedCollectionsExpr})) as remaining_unpaid_amount,
  MAX(0, ${invoiceAmountExpr} - (${payableCollectionsExpr})) as remaining_amount,
  ${delayDaysExpr} as delay_days,
  u.name as agent_name,
  p.name as pos_name,
  p.phone as pos_phone,
  (SELECT GROUP_CONCAT(COALESCE(cat.name, 'صنف غير معروف') || ' (' || COALESCE(it.quantity, 0) || ' ورقة)', ' | ') 
   FROM invoice_items it 
   LEFT JOIN card_categories cat ON cat.id = it.category_id 
   WHERE it.invoice_id = i.id) as miniature_items
FROM invoices i
LEFT JOIN users u ON u.id = i.agent_id
LEFT JOIN pos_customers p ON p.id = i.pos_id
${where}
`;
    if (filters.status) {
    if (filters.status === 'overdue') {
      sql += ` AND MAX(0, ${invoiceAmountExpr} - (${payableCollectionsExpr})) > 0.1 AND ${delayDaysExpr} > 0`;
    } else if (filters.status === 'due_soon') {
      sql += ` AND MAX(0, ${invoiceAmountExpr} - (${payableCollectionsExpr})) > 0.1 AND (-(${delayDaysExpr})) <= 2 AND (-(${delayDaysExpr})) >= 0`;
    } else {
      sql += ` AND i.status = ?`;
      params.push(filters.status);
    }
  }
  if (filters.phase_id) { sql += ` AND i.phase_id = ?`; params.push(filters.phase_id); }
  if (filters.id) { sql += ` AND i.id = ?`; params.push(filters.id); }
  if (filters.agent_id) { sql += ` AND i.agent_id = ?`; params.push(filters.agent_id); }
  if (filters.pos_id) { sql += ` AND i.pos_id = ?`; params.push(filters.pos_id); }
  if (filters.onlyWithBalance) { sql += ` AND (${invoiceAmountExpr} - (${payableCollectionsExpr})) > 0.1`; }
  // Exclude invoices that are blocked pending manager discount approval.
  // Used by the collection screen so agents cannot select a locked invoice.
  // Matches the same logic as getPendingDiscountInvoices and the collection guards.
  if (filters.excludePendingDiscount) {
    sql += ` AND NOT (COALESCE(i.discount_requested_value, 0) > 0 AND COALESCE(i.discount_status, 'none') NOT IN ('approved', 'auto_approved', 'rejected', 'none'))`;
  }
    sql += ` ORDER BY created_at DESC`;
    const r = await execSQL(sql, params);
    const rows = (r.rows._array || []).map(decorateInvoiceStatusFields);
    console.log(`[Invoices:getLocalInvoices] filters=${JSON.stringify(filters)} count=${rows.length}`);
    return rows;
  });
};

export const getInvoicePaidSum = async (id) => {
  // Exclude rejected and cancelled collections so they don't reduce the
  // remaining-balance ceiling used when validating a new collection amount.
  const r = await execSQL(
    `SELECT SUM(amount) as s
     FROM collections
     JOIN invoices i ON i.id = collections.invoice_id
     WHERE collections.invoice_id = ?
       AND (COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL AND (i.active = 1 OR i.active = 'true' OR i.active IS NULL))
       AND ${ACTIVE_COLLECTION_CLAUSE('collections')}`,
    [id]
  );
  return r.rows._array[0]?.s || 0;
};

/**
 * getPendingDiscountInvoices
 * ─────────────────────────────────────────────────────────────────────────
 * Returns all active invoices whose discount_status = 'pending_discount_approval',
 * scoped to the given phase.  Intentionally NOT wrapped in getCached() so the
 * Discount Approvals screen always reflects the latest SQLite state without
 * waiting for a 60-second TTL.
 *
 * @param {string|null} phaseId
 * @returns {Promise<object[]>}
 */
export const getPendingDiscountInvoices = async (phaseId = null) => {
  let sql = `
    SELECT
      i.*,
      COALESCE(i.paid_amount, 0)                                              AS paid_sum,
      COALESCE(i.approved_amount, 0)                                          AS approved_sum,
      MAX(0, (COALESCE(i.total_amount, 0) - COALESCE(i.discount_applied_value, 0))
             - COALESCE(i.paid_amount, 0))                                    AS remaining_amount,
      u.name  AS agent_name,
      p.name  AS pos_name,
      p.owner_name AS owner_name,
      p.phone AS pos_phone
    FROM invoices i
    LEFT JOIN users u         ON u.id = i.agent_id
    LEFT JOIN pos_customers p ON p.id = i.pos_id
    WHERE ${ACTIVE_INVOICE_WHERE_CLAUSE}
      AND COALESCE(i.discount_requested_value, 0) > 0
      AND COALESCE(i.discount_status, 'none') NOT IN ('approved', 'auto_approved', 'rejected', 'none')
  `;
  const params = [];
  if (phaseId) { sql += ` AND i.phase_id = ?`; params.push(phaseId); }
  sql += ` ORDER BY i.created_at DESC`;
  const r = await execSQL(sql, params);
  console.log(`[Invoices:getPendingDiscountInvoices] phase=${phaseId} count=${r.rows._array?.length}`);
  return (r.rows._array || []).map(decorateInvoiceStatusFields);
};

export const updateInvoiceStatus = async (invoiceId) => {
  if (!invoiceId) return;
  const invR = await execSQL(`SELECT total_amount, net_amount, discount_applied_value, paid_amount, approved_amount, status, discount_status, is_deleted, deleted_at FROM invoices WHERE id = ?`, [invoiceId]);
  const inv = invR.rows._array[0];
  if (!inv) return;
  if (Number(inv.is_deleted || 0) === 1 || inv.deleted_at || inv.status === 'cancelled') return;
  const net = resolveInvoiceNetAmount(inv);
  const sumAllR = await execSQL(
    `SELECT SUM(amount) as s
     FROM collections
     WHERE invoice_id = ?
       AND ${ACTIVE_COLLECTION_CLAUSE('collections')}`,
    [invoiceId]
  );
  const totalPaid = sumAllR.rows._array[0]?.s || 0;
  const sumApprovedR = await execSQL(`SELECT SUM(amount) as s FROM collections WHERE invoice_id = ? AND ${APPROVED_COLLECTION_CLAUSE('collections')}`, [invoiceId]);
  const approvedPaid = sumApprovedR.rows._array[0]?.s || 0;
  const newStatus = deriveInvoicePaymentStatus({ net_amount: net, paid_amount: totalPaid });
  if (inv.status !== newStatus || Number(inv.paid_amount || 0) !== Number(totalPaid || 0) || Number(inv.approved_amount || 0) !== Number(approvedPaid || 0) || Number(inv.net_amount || 0) !== Number(net || 0)) {
    await execSQL(`UPDATE invoices SET paid_amount = ?, approved_amount = ?, net_amount = ?, status = ? WHERE id = ?`, [totalPaid, approvedPaid, net, newStatus, invoiceId]);
    await addToSyncQueue('invoices', 'UPDATE', { paid_amount: totalPaid, approved_amount: approvedPaid, net_amount: net, status: newStatus }, invoiceId);
    notifyDataChanged('invoices');
  }
};

export const repairInvoicesStatus = async () => {
  const invoices = await execSQL(`SELECT id, total_amount, net_amount, discount_applied_value, discount_status, status, paid_amount, approved_amount FROM invoices WHERE ${ACTIVE_INVOICE_WHERE_CLAUSE_NO_ALIAS}`);
  let count = 0;
  for (const inv of invoices.rows._array) {
    const net = resolveInvoiceNetAmount(inv);
    const sumR = await execSQL(
      `SELECT SUM(amount) as s
       FROM collections
       WHERE invoice_id = ?
         AND ${ACTIVE_COLLECTION_CLAUSE('collections')}`,
      [inv.id]
    );
    const paid = sumR.rows._array[0]?.s || 0;
    const sumApprovedR = await execSQL(`SELECT SUM(amount) as s FROM collections WHERE invoice_id = ? AND ${APPROVED_COLLECTION_CLAUSE('collections')}`, [inv.id]);
    const approvedPaid = sumApprovedR.rows._array[0]?.s || 0;
    const status = deriveInvoicePaymentStatus({ net_amount: net, paid_amount: paid });
    if (inv.status !== status || paid !== (inv.paid_amount || 0) || approvedPaid !== (inv.approved_amount || 0) || Number(inv.net_amount || 0) !== Number(net || 0)) {
      await execSQL(`UPDATE invoices SET paid_amount = ?, approved_amount = ?, net_amount = ?, status = ? WHERE id = ?`, [paid, approvedPaid, net, status, inv.id]);
      await addToSyncQueue('invoices', 'UPDATE', { paid_amount: paid, approved_amount: approvedPaid, net_amount: net, status: status }, inv.id);
      count++;
    }
  }
  notifyDataChanged('invoices');
  return count;
};

export const createLocalInvoice = async (data) => {
  const id = data.id || uuidv4();
  const created_at = data.created_at || new Date().toISOString();
  let invoice_number = data.invoice_number || '';
  let posName = 'نقطة بيع غير محددة';
  if (data.pos_id) {
    const posRes = await execSQL(`SELECT credit_limit, name FROM pos_customers WHERE id = ?`, [data.pos_id]);
    const pos = posRes.rows._array[0];
    if (pos) {
      posName = pos.name || posName;
      if (Number(pos.credit_limit || 0) > 0) {
        // Live SQLite check: remaining credit = credit_limit - sum of unpaid balances on existing invoices
        const { getPOSRemainingCredit } = require('./posService');
        const { remainingCredit } = await getPOSRemainingCredit(data.pos_id);
        const draftNet = Number(data.total_amount || 0);
        if (draftNet > remainingCredit + 0.01) {
          throw new Error('تجاوزت الفاتورة الحد الائتماني المتبقي لنقطة البيع');
        }
      }
    }
  }
  const totalAmt = Number(data.total_amount || 0);
  const requestedDiscount = Math.max(0, Number(data.discount_requested_value ?? data.discount ?? 0));
  const requestedReason = String(data.discount_requested_reason || data.discount_reason || '').trim();
  const requestedBy = data.discount_requested_by || data.agent_id || null;
  const incomingStatus = String(data.discount_status || '').trim();
  const discountStatus = incomingStatus || (requestedDiscount > 0 ? 'pending_discount_approval' : 'none');
  const appliedDiscount = (discountStatus === 'auto_approved' || discountStatus === 'approved')
    ? Math.max(0, Number(data.discount_applied_value ?? requestedDiscount))
    : Math.max(0, Number(data.discount_applied_value || 0));
  const netAmt = Math.max(0, totalAmt - appliedDiscount);
  const payload = {
    id,
    invoice_number,
    pos_id: data.pos_id,
    agent_id: data.agent_id,
    type: data.type || 'credit',
    total_amount: totalAmt,
    net_amount: netAmt,
    paid_amount: Number(data.paid_amount || 0),
    status: data.status || 'pending',
    notes: data.notes || '',
    invoice_date: data.invoice_date || created_at,
    active: data.active ?? 1,
    created_at,
    is_deleted: Number(data.is_deleted || 0),
    deleted_at: data.deleted_at || null,
    deleted_by: data.deleted_by || null,
    delete_reason: data.delete_reason || null,
    discount_requested_value: requestedDiscount,
    discount_applied_value: appliedDiscount,
    discount_status: discountStatus,
    discount_requested_reason: requestedReason,
    discount_requested_by: requestedBy,
    discount_approved_by: data.discount_approved_by || null,
    discount_approved_at: data.discount_approved_at || null,
    phase_id: data.phase_id || null,
    project_id: data.project_id || null,
    synced: 0
  };

  // Auto-inject project_id if not provided
  if (!payload.project_id) {
    try {
      const { getProjectId } = require('./dbCore');
      payload.project_id = await getProjectId();
    } catch(e) {}
  }
  if (!payload.project_id) {
    throw new Error('تعذر تحديد المشروع الحالي. الرجاء تسجيل الدخول بالترخيص أولاً.');
  }

  // Auto-inject phase_id from active phase if not provided
  if (!payload.phase_id) {
    try {
      const { getActivePhase } = require('./phaseService');
      const activePhase = await getActivePhase(payload.project_id);
      if (activePhase) payload.phase_id = activePhase.id;
    } catch (e) { console.log('[Invoice] Could not get active phase:', e.message); }
  }
  if (!payload.phase_id) {
    throw new Error('لا توجد مرحلة نشطة للمشروع الحالي. لا يمكن حفظ الفاتورة.');
  }
  if (!payload.agent_id) {
    throw new Error('تعذر تحديد المستخدم الحالي. لا يمكن حفظ الفاتورة.');
  }

  for (let i = 0; i < 20; i++) {
    try {
      if (!invoice_number) {
        invoice_number = await getMonthlySequentialCode({
          table: 'invoices',
          column: 'invoice_number',
          prefix: 'INV',
          dateValue: payload.invoice_date,
        });
      }
      payload.invoice_number = invoice_number;
      await execSQL(`INSERT OR REPLACE INTO invoices (id, project_id, invoice_number, pos_id, agent_id, type, total_amount, net_amount, paid_amount, status, notes, invoice_date, active, created_at, is_deleted, deleted_at, deleted_by, delete_reason, discount_requested_value, discount_applied_value, discount_status, discount_requested_reason, discount_requested_by, discount_approved_by, discount_approved_at, phase_id, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [payload.id, payload.project_id, payload.invoice_number, payload.pos_id, payload.agent_id, payload.type, payload.total_amount, payload.net_amount, payload.paid_amount, payload.status, payload.notes, payload.invoice_date, payload.active, payload.created_at, payload.is_deleted, payload.deleted_at, payload.deleted_by, payload.delete_reason, payload.discount_requested_value, payload.discount_applied_value, payload.discount_status, payload.discount_requested_reason, payload.discount_requested_by, payload.discount_approved_by, payload.discount_approved_at, payload.phase_id, payload.synced]);
      break;
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (msg.includes('invoices.invoice_number') || msg.includes('UNIQUE constraint failed')) {
        invoice_number = '';
        if (i === 19) throw new Error('تعذر توليد رقم فاتورة تسلسلي. حاول مرة أخرى.');
      } else {
        throw e;
      }
    }
  }

  await addToSyncQueue('invoices', 'INSERT', payload, id);
  notifyDataChanged('invoices');
  try {
    const actor = await getUserBasic(payload.agent_id);
    if (actor?.role === 'agent') {
      const { sendRoleBasedPush } = require('./NotificationService');
      await sendRoleBasedPush({
        title: '📄 فاتورة جديدة من مندوب',
        body: `${actor.name || 'مندوب'} سجّل عملية بيع لنقطة (${posName}) بقيمة ${Number(payload.net_amount || payload.total_amount || 0)} ر.ي.`,
        targetRoles: ['cashier', 'admin'],
        excludeUserIds: [actor.id],
        data: {
          route: 'InvoicesMain',
          project_id: payload.project_id,
          actor_id: actor.id,
          actor_name: actor.name || 'مندوب',
          actor_role: actor.role,
          action: 'create_invoice',
          invoice_id: payload.id,
          delivery_channel: 'push',
        },
      });
    }
  } catch (e) {}
  // Import dynamically to avoid circular dep
  const { recalculatePOSCreditBalance } = require('./posService');
  if (payload.pos_id) await recalculatePOSCreditBalance(payload.pos_id);
  return payload;
};

export const addInvoiceItem = async (data) => {
  const id = data.id || uuidv4();
  const qty = Number(data.quantity || 0);
  const walletId = data.wallet_id;
  const batchId = String(data.batch_id || '').trim();
  const created_at = data.created_at || new Date().toISOString();

  // ── All DB operations inside ONE atomic transaction ──
  const payload = await withTransaction(function* () {
    if (!batchId) {
      throw new Error('يرجى اختيار الدفعة');
    }

    const bR = yield {
      sql: `SELECT id FROM batches WHERE id = ? LIMIT 1`,
      params: [batchId]
    };
    if (!bR.rows._array?.[0]?.id) {
      throw new Error('يرجى اختيار الدفعة');
    }

    if (walletId) {
      // 1) Read wallet total and derive sold strictly from invoice_items (active invoices)
      const wR = yield {
        sql: `SELECT total_cards FROM agent_wallets WHERE id = ?`,
        params: [walletId]
      };
      const wallet = wR.rows._array?.[0];
      if (!wallet) {
        throw new Error('المحفظة غير موجودة');
      }

      const soldR = yield {
        sql: `SELECT COALESCE(SUM(ii.quantity), 0) as sold_qty
              FROM invoice_items ii
              JOIN invoices i ON i.id = ii.invoice_id
              WHERE ii.wallet_id = ? AND ${ACTIVE_INVOICE_WHERE_CLAUSE}`,
        params: [walletId]
      };
      const soldDerived = Number(soldR.rows._array?.[0]?.sold_qty || 0);

      // 2) Validate sufficient stock
      const remaining = (wallet.total_cards || 0) - soldDerived;
      if (qty > remaining) {
        throw new Error(`الكمية المطلوبة (${qty}) أكبر من المتاح في المحفظة (${remaining})`);
      }

      // 3) Set absolute sold_cards snapshot (DO NOT do incremental sync deltas)
      const nextSoldAbsolute = soldDerived + qty;
      yield {
        sql: `UPDATE agent_wallets SET sold_cards = ?, synced = 0 WHERE id = ?`,
        params: [nextSoldAbsolute, walletId]
      };
    }

    // 8) Build invoice_item payload
    const itemPayload = {
      id, invoice_id: data.invoice_id, category_id: data.category_id,
      batch_id: batchId, wallet_id: walletId,
      quantity: qty,
      unit_price: Number(data.unit_price || 0),
      total_price: Number(data.total_price || 0),
      created_at, synced: 0
    };

    // 9) Insert invoice_item (inside same tx)
    yield {
      sql: `INSERT OR REPLACE INTO invoice_items (id, invoice_id, category_id, batch_id, wallet_id, quantity, unit_price, total_price, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [itemPayload.id, itemPayload.invoice_id, itemPayload.category_id, itemPayload.batch_id, itemPayload.wallet_id, itemPayload.quantity, itemPayload.unit_price, itemPayload.total_price, itemPayload.created_at, itemPayload.synced]
    };

    // 10) Sync queue entry for invoice_item (inside same tx)
    yield {
      sql: `INSERT INTO sync_queue (table_name, operation, payload, record_id, attempts, created_at)
       VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      params: ['invoice_items', 'INSERT', JSON.stringify(itemPayload), id]
    };

    return itemPayload;
  });

  // ── Notifications fire ONLY after successful transaction commit ──
  if (walletId) {
    notifyDataChanged('agent_wallets');
  }
  notifyDataChanged('invoice_items', payload);
  notifyDataChanged('sync_queue');
  // لا تحجب حفظ الفاتورة بانتظار backfill؛ شغّلها بالخلفية لتجنب التعليق
  backfillOperationsFromSyncQueue(50).catch((e) => {
    console.log('[InvoiceItem] backfill operations skipped:', e?.message || e);
  });

  return payload;
};

export const approveInvoiceDiscount = async (invoiceId, managerId, appliedValue, note = '') => {
  if (!invoiceId) throw new Error('رقم الفاتورة غير صالح');
  const invR = await execSQL(`SELECT * FROM invoices WHERE id = ? LIMIT 1`, [invoiceId]);
  const inv = invR.rows._array?.[0];
  if (!inv) throw new Error('الفاتورة غير موجودة');

  const currentStatus = String(inv.discount_status || 'none');
  if (currentStatus === 'approved' || currentStatus === 'auto_approved') {
    await addDiscountDecisionAudit({
      invoiceId,
      requestedBy: inv.discount_requested_by,
      requestedValue: inv.discount_requested_value,
      requestedReason: inv.discount_requested_reason,
      appliedValue: inv.discount_applied_value,
      approvedBy: managerId,
      approvedAt: new Date().toISOString(),
      status: currentStatus,
      decisionNote: 'noop_already_approved'
    });
    return { changed: false, status: currentStatus };
  }
  if (currentStatus === 'rejected') {
    throw new Error('لا يمكن اعتماد الخصم بعد الرفض إلا بعد إعادة فتح الطلب من المدير.');
  }

  const reqValue = Math.max(0, Number(inv.discount_requested_value || 0));
  const normalizedApplied = Math.max(0, Number(appliedValue ?? reqValue));
  const effectiveNet = Math.max(0, Number(inv.total_amount || 0) - normalizedApplied);
  const approvedPaidR = await execSQL(
    `SELECT COALESCE(SUM(amount), 0) AS s
     FROM collections
     WHERE invoice_id = ? AND (active = 1 OR active = 'true') AND status = 'approved'`,
    [invoiceId]
  );
  const approvedCollectionsTotal = Number(approvedPaidR.rows._array?.[0]?.s || 0);
  if (effectiveNet + 0.01 < approvedCollectionsTotal) {
    throw new Error('لا يمكن اعتماد الخصم: صافي الفاتورة بعد الخصم أقل من إجمالي التحصيلات المعتمدة.');
  }

  const approvedAt = new Date().toISOString();
  await execSQL(
    `UPDATE invoices
     SET discount_applied_value = ?,
         discount_status = 'approved',
         discount_approved_by = ?,
         discount_approved_at = ?,
         net_amount = ?,
         synced = 0
     WHERE id = ?`,
    [normalizedApplied, managerId, approvedAt, effectiveNet, invoiceId]
  );
  await addToSyncQueue('invoices', 'UPDATE', {
    discount_status: 'approved',
    discount_requested_value: reqValue,
    discount_applied_value: normalizedApplied,
    discount_approved_by: managerId,
    discount_approved_at: approvedAt,
    net_amount: effectiveNet
  }, invoiceId);
  await addDiscountDecisionAudit({
    invoiceId,
    requestedBy: inv.discount_requested_by,
    requestedValue: reqValue,
    requestedReason: inv.discount_requested_reason,
    appliedValue: normalizedApplied,
    approvedBy: managerId,
    approvedAt,
    status: 'approved',
    decisionNote: note || ''
  });
  await updateInvoiceStatus(invoiceId);
  notifyDataChanged('invoices');
  return { changed: true, status: 'approved' };
};

export const rejectInvoiceDiscount = async (invoiceId, managerId, reason = '') => {
  if (!invoiceId) throw new Error('رقم الفاتورة غير صالح');
  const invR = await execSQL(`SELECT * FROM invoices WHERE id = ? LIMIT 1`, [invoiceId]);
  const inv = invR.rows._array?.[0];
  if (!inv) throw new Error('الفاتورة غير موجودة');

  const currentStatus = String(inv.discount_status || 'none');
  if (currentStatus === 'rejected') {
    await addDiscountDecisionAudit({
      invoiceId,
      requestedBy: inv.discount_requested_by,
      requestedValue: inv.discount_requested_value,
      requestedReason: inv.discount_requested_reason,
      appliedValue: 0,
      approvedBy: managerId,
      approvedAt: new Date().toISOString(),
      status: 'rejected',
      decisionNote: 'noop_already_rejected'
    });
    return { changed: false, status: 'rejected' };
  }
  if (currentStatus === 'approved' || currentStatus === 'auto_approved') {
    throw new Error('لا يمكن رفض خصم معتمد إلا بعد إعادة فتح الطلب من المدير.');
  }

  const rejectedAt = new Date().toISOString();
  const effectiveNet = Math.max(0, Number(inv.total_amount || 0));
  await execSQL(
    `UPDATE invoices
     SET discount_applied_value = 0,
         discount_status = 'rejected',
         discount_approved_by = ?,
         discount_approved_at = ?,
         net_amount = ?,
         synced = 0
     WHERE id = ?`,
    [managerId, rejectedAt, effectiveNet, invoiceId]
  );
  await addToSyncQueue('invoices', 'UPDATE', {
    discount_status: 'rejected',
    discount_requested_value: Number(inv.discount_requested_value || 0),
    discount_applied_value: 0,
    discount_approved_by: managerId,
    discount_approved_at: rejectedAt,
    net_amount: effectiveNet
  }, invoiceId);
  await addDiscountDecisionAudit({
    invoiceId,
    requestedBy: inv.discount_requested_by,
    requestedValue: inv.discount_requested_value,
    requestedReason: inv.discount_requested_reason,
    appliedValue: 0,
    approvedBy: managerId,
    approvedAt: rejectedAt,
    status: 'rejected',
    decisionNote: reason || ''
  });
  await updateInvoiceStatus(invoiceId);
  notifyDataChanged('invoices');
  return { changed: true, status: 'rejected' };
};

export const softDeleteInvoice = async (id, { deletedBy = null, deleteReason = null } = {}) => {
  const qItems = await execSQL(`SELECT DISTINCT wallet_id FROM invoice_items WHERE invoice_id=? AND wallet_id IS NOT NULL`, [id]);
  const collections = await execSQL(`SELECT id FROM collections WHERE invoice_id=?`, [id]);
  
  await withTransaction(function* () {
    const result = yield {
      sql: `UPDATE invoices
            SET active = 0,
                status = 'cancelled',
                is_deleted = 0,
                deleted_at = NULL,
                deleted_by = ?,
                delete_reason = ?,
                synced = 0
            WHERE id = ?`,
      params: [deletedBy, deleteReason, id]
    };
    ensureSingleRowAffected(result, `cancel invoice ${id}`);

    yield {
      sql: `UPDATE collections
            SET active = 0,
                status = 'cancelled',
                synced = 0
            WHERE invoice_id = ?`,
      params: [id]
    };
  });

  await addToSyncQueue('invoices', 'UPDATE', {
    active: 0,
    status: 'cancelled',
    is_deleted: 0,
    deleted_at: null,
    deleted_by: deletedBy,
    delete_reason: deleteReason
  }, id);

  for (const col of collections.rows._array) {
    await addToSyncQueue('collections', 'UPDATE', {
      active: 0,
      status: 'cancelled'
    }, col.id);
  }

  for (const item of qItems.rows._array) {
    const walletId = item.wallet_id;
    if (!walletId) continue;
    const soldR = await execSQL(
      `SELECT COALESCE(SUM(ii.quantity), 0) as sold_qty
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.wallet_id = ? AND ${ACTIVE_INVOICE_WHERE_CLAUSE}`,
      [walletId]
    );
    const soldAbsolute = Number(soldR.rows._array?.[0]?.sold_qty || 0);
    await execSQL(`UPDATE agent_wallets SET sold_cards = ?, synced = 0 WHERE id = ?`, [soldAbsolute, walletId]);
    await addToSyncQueue('agent_wallets', 'UPDATE', { sold_cards: soldAbsolute }, walletId);
  }

  const invR = await execSQL(`SELECT pos_id FROM invoices WHERE id=?`, [id]);
  const pos_id = invR.rows._array[0]?.pos_id;
  const { recalculatePOSCreditBalance } = require('./posService');
  if (pos_id) await recalculatePOSCreditBalance(pos_id);

  notifyDataChanged('collections');
  notifyDataChanged('agent_wallets');
  notifyDataChanged('invoices');
  return true;
};

export const restoreZeroedInvoicesFromItems = async () => {
  const restored = [];
  const rows = await execSQL(
    `SELECT i.id,
            COALESCE(i.discount_applied_value, 0) AS discount_applied_value,
            COALESCE(i.discount_status, 'none') AS discount_status,
            COALESCE(SUM(COALESCE(ii.total_price, ii.quantity * ii.unit_price, 0)), 0) AS items_total
     FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE COALESCE(i.is_deleted, 0) = 0
       AND i.deleted_at IS NULL
       AND (COALESCE(i.total_amount, 0) = 0 OR COALESCE(i.net_amount, 0) = 0)
     GROUP BY i.id, i.discount_applied_value, i.discount_status`
  );

  for (const row of rows.rows._array || []) {
    const totalAmount = Number(row.items_total || 0);
    if (totalAmount <= 0) continue;
    const netAmount = resolveInvoiceNetAmount({ ...row, total_amount: totalAmount });
    await withTransaction(function* () {
      const result = yield {
        sql: `UPDATE invoices
              SET total_amount = ?,
                  net_amount = ?,
                  synced = 0
              WHERE id = ?`,
        params: [totalAmount, netAmount, row.id]
      };
      ensureSingleRowAffected(result, `restore invoice ${row.id}`);
    });
    await addToSyncQueue('invoices', 'UPDATE', { total_amount: totalAmount, net_amount: netAmount }, row.id);
    restored.push({ id: row.id, total_amount: totalAmount, net_amount: netAmount });
  }

  if (restored.length) notifyDataChanged('invoices');
  return restored;
};

export const getLocalInvoiceItems = async (invoiceId) => {
  const cacheKey = `invoice_items:invoice:${invoiceId}`;
  return getCached(cacheKey, async () => {
    const r = await execSQL(`SELECT ii.*, c.name as category_name, b.batch_number FROM invoice_items ii LEFT JOIN card_categories c ON c.id = ii.category_id LEFT JOIN batches b ON b.id = ii.batch_id WHERE ii.invoice_id = ? ORDER BY ii.created_at ASC`, [invoiceId]);
    return r.rows._array || [];
  });
};

export const checkOverdueInvoices = async (user) => {
  const { checkAndSendOverdueInvoiceNotifications } = require('./NotificationService');
  return checkAndSendOverdueInvoiceNotifications(user);
};
