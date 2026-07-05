import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';

const ACTIVE_RETURN_CLAUSE = `(active = 1 OR active = 'true' OR active IS NULL)`;
const RESERVED_RETURN_CLAUSE = `${ACTIVE_RETURN_CLAUSE} AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'approved')`;
const APPROVED_RETURN_CLAUSE = `${ACTIVE_RETURN_CLAUSE} AND LOWER(COALESCE(status, 'pending')) = 'approved'`;
const ACTIVE_RETURN_CLAUSE_R = `(r.active = 1 OR r.active = 'true' OR r.active IS NULL)`;

export const getInvoiceCardReturnsTotal = async (invoiceId, approvedOnly = false) => {
  if (!invoiceId) return 0;
  const r = await execSQL(
    `SELECT COALESCE(SUM(return_amount), 0) as total
     FROM invoice_card_returns
     WHERE invoice_id = ?
       AND ${approvedOnly ? APPROVED_RETURN_CLAUSE : RESERVED_RETURN_CLAUSE}`,
    [invoiceId]
  );
  return Number(r.rows._array?.[0]?.total || 0);
};

export const getInvoiceCardReturnOptions = async (invoiceId) => {
  if (!invoiceId) return [];
  const r = await execSQL(
    `SELECT
       ii.id as invoice_item_id,
       ii.invoice_id,
       ii.project_id,
       ii.phase_id,
       ii.category_id,
       ii.batch_id,
       ii.wallet_id,
       COALESCE(ii.quantity, 0) as quantity,
       COALESCE(ii.unit_price, 0) as unit_price,
       COALESCE(c.name, 'غير معروف') as category_name,
       COALESCE(NULLIF(c.cards_per_sheet, 0), 1) as cards_per_sheet,
       COALESCE(NULLIF(c.card_value, 0), c.price, ii.unit_price, 0) as card_value,
       COALESCE(prev.returned_cards_count, 0) as previous_returned_cards
     FROM invoice_items ii
     LEFT JOIN card_categories c ON c.id = ii.category_id
     LEFT JOIN (
       SELECT invoice_item_id, COALESCE(SUM(returned_cards_count), 0) as returned_cards_count
       FROM invoice_card_returns
       WHERE invoice_id = ?
         AND invoice_item_id IS NOT NULL
         AND ${RESERVED_RETURN_CLAUSE}
       GROUP BY invoice_item_id
     ) prev ON prev.invoice_item_id = ii.id
     WHERE ii.invoice_id = ?
     ORDER BY ii.created_at ASC`,
    [invoiceId, invoiceId]
  );

  return (r.rows._array || []).map((row) => {
    const cardsPerSheet = Math.max(1, Number(row.cards_per_sheet || 1));
    const totalCardsSold = Math.max(0, Number(row.quantity || 0) * cardsPerSheet);
    const previousReturned = Math.max(0, Number(row.previous_returned_cards || 0));
    return {
      ...row,
      cards_per_sheet: cardsPerSheet,
      card_value: Math.max(0, Number(row.card_value || 0)),
      total_cards_sold: totalCardsSold,
      previous_returned_cards: previousReturned,
      max_returnable_cards: Math.max(0, totalCardsSold - previousReturned),
    };
  });
};

export const createInvoiceCardReturns = async ({
  invoiceId,
  collectionId = null,
  returns = [],
  projectId = null,
  phaseId = null,
  createdBy = null,
  operationGroupId = null,
  reason = '',
}) => {
  const normalizedInput = (Array.isArray(returns) ? returns : [])
    .map((row) => ({
      invoice_item_id: row.invoice_item_id || null,
      returned_cards_count: Math.floor(Number(row.returned_cards_count || 0)),
      reason: row.reason ?? reason ?? '',
    }))
    .filter((row) => row.returned_cards_count > 0);

  if (!normalizedInput.length) return [];
  if (!invoiceId) throw new Error('لا يمكن تسجيل مرتجع كروت بدون فاتورة.');

  const options = await getInvoiceCardReturnOptions(invoiceId);
  const byItemId = new Map(options.map((row) => [row.invoice_item_id, row]));
  const now = new Date().toISOString();
  const payloads = [];

  for (const input of normalizedInput) {
    const option = byItemId.get(input.invoice_item_id);
    if (!option) throw new Error('بند المرتجع غير موجود في الفاتورة.');
    if (input.returned_cards_count < 0) throw new Error('عدد الكروت المرتجعة يجب أن لا يكون سالباً.');
    if (input.returned_cards_count > option.max_returnable_cards) {
      throw new Error(`عدد الكروت المرتجعة للفئة ${option.category_name} أكبر من المتاح للمرتجع.`);
    }
    const cardValue = Math.max(0, Number(option.card_value || 0));
    const returnAmount = Number((input.returned_cards_count * cardValue).toFixed(4));
    if (returnAmount !== Number((input.returned_cards_count * cardValue).toFixed(4))) {
      throw new Error('قيمة المرتجع غير صحيحة.');
    }
    payloads.push({
      id: uuidv4(),
      project_id: projectId || option.project_id || null,
      phase_id: phaseId || option.phase_id || null,
      invoice_id: invoiceId,
      collection_id: collectionId || null,
      invoice_item_id: option.invoice_item_id,
      category_id: option.category_id,
      batch_id: option.batch_id || null,
      wallet_id: option.wallet_id || null,
      returned_cards_count: input.returned_cards_count,
      card_value: cardValue,
      return_amount: returnAmount,
      reason: input.reason || '',
      status: 'pending',
      active: 1,
      created_by: createdBy || null,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      approval_notes: '',
      rejection_notes: '',
      created_at: now,
      updated_at: now,
      synced: 0,
    });
  }

  for (const payload of payloads) {
    const insertColumns = [
      'id',
      'project_id',
      'phase_id',
      'invoice_id',
      'collection_id',
      'invoice_item_id',
      'category_id',
      'batch_id',
      'wallet_id',
      'returned_cards_count',
      'card_value',
      'return_amount',
      'reason',
      'status',
      'active',
      'created_by',
      'approved_by',
      'approved_at',
      'rejected_by',
      'rejected_at',
      'approval_notes',
      'rejection_notes',
      'created_at',
      'updated_at',
      'synced',
    ];
    const insertParams = [
      payload.id,
      payload.project_id,
      payload.phase_id,
      payload.invoice_id,
      payload.collection_id,
      payload.invoice_item_id,
      payload.category_id,
      payload.batch_id,
      payload.wallet_id,
      payload.returned_cards_count,
      payload.card_value,
      payload.return_amount,
      payload.reason,
      payload.status,
      payload.active,
      payload.created_by,
      payload.approved_by,
      payload.approved_at,
      payload.rejected_by,
      payload.rejected_at,
      payload.approval_notes,
      payload.rejection_notes,
      payload.created_at,
      payload.updated_at,
      payload.synced,
    ];
    if (insertColumns.length !== insertParams.length) {
      throw new Error(`invoice_card_returns insert mismatch: columns=${insertColumns.length}, params=${insertParams.length}`);
    }
    const placeholders = insertColumns.map(() => '?').join(', ');
    await execSQL(
      `INSERT INTO invoice_card_returns
        (${insertColumns.join(', ')})
       VALUES (${placeholders})`,
      insertParams
    );
    await addToSyncQueue('invoice_card_returns', 'INSERT', payload, payload.id, operationGroupId);
  }

  notifyDataChanged('invoice_card_returns');
  notifyDataChanged('invoices');
  return payloads;
};

export const getPendingCardReturnRequests = async (projectId, phaseId = null) => {
  if (!projectId) return [];
  const params = [projectId];
  let phaseWhere = '';
  if (phaseId) {
    phaseWhere = ' AND r.phase_id = ?';
    params.push(phaseId);
  }
  const r = await execSQL(
    `SELECT
       COALESCE(r.collection_id, '') || ':' || r.invoice_id as request_id,
       r.collection_id,
       r.invoice_id,
       r.project_id,
       r.phase_id,
       c.collection_number,
       i.invoice_number,
       p.name as pos_name,
       u.name as agent_name,
       ph.name as phase_name,
       creator.name as created_by_name,
       MIN(r.created_at) as created_at,
       COALESCE(SUM(r.returned_cards_count), 0) as total_returned_cards,
       COALESCE(SUM(r.return_amount), 0) as total_return_amount,
       LOWER(COALESCE(r.status, 'pending')) as status
     FROM invoice_card_returns r
     LEFT JOIN collections c ON c.id = r.collection_id
     LEFT JOIN invoices i ON i.id = r.invoice_id
     LEFT JOIN pos_customers p ON p.id = i.pos_id
     LEFT JOIN users u ON u.id = COALESCE(c.agent_id, i.agent_id)
     LEFT JOIN users creator ON creator.id = r.created_by
     LEFT JOIN phases ph ON ph.id = r.phase_id
     WHERE r.project_id = ?
       ${phaseWhere}
       AND ${ACTIVE_RETURN_CLAUSE_R}
       AND LOWER(COALESCE(r.status, 'pending')) = 'pending'
     GROUP BY r.collection_id, r.invoice_id, r.project_id, r.phase_id, c.collection_number, i.invoice_number, p.name, u.name, ph.name, creator.name, LOWER(COALESCE(r.status, 'pending'))
     ORDER BY MIN(r.created_at) ASC`,
    params
  );
  return r.rows._array || [];
};

export const getCardReturnRequestDetails = async ({ collectionId = null, invoiceId, projectId = null }) => {
  if (!invoiceId) return null;
  const params = [invoiceId];
  let where = `r.invoice_id = ?`;
  if (collectionId) {
    where += ` AND r.collection_id = ?`;
    params.push(collectionId);
  }
  if (projectId) {
    where += ` AND r.project_id = ?`;
    params.push(projectId);
  }

  const rowsR = await execSQL(
    `SELECT r.*, cc.name as category_name, b.batch_number, b.serial_number
     FROM invoice_card_returns r
     LEFT JOIN card_categories cc ON cc.id = r.category_id
     LEFT JOIN batches b ON b.id = r.batch_id
     WHERE ${where}
       AND ${ACTIVE_RETURN_CLAUSE_R}
       AND LOWER(COALESCE(r.status, 'pending')) = 'pending'
     ORDER BY r.created_at ASC`,
    params
  );
  const rows = rowsR.rows._array || [];
  if (!rows.length) return null;

  const invoiceR = await execSQL(
    `SELECT i.*, p.name as pos_name, u.name as agent_name
     FROM invoices i
     LEFT JOIN pos_customers p ON p.id = i.pos_id
     LEFT JOIN users u ON u.id = i.agent_id
     WHERE i.id = ? LIMIT 1`,
    [invoiceId]
  );
  const collectionR = collectionId ? await execSQL(
    `SELECT c.*, u.name as agent_name
     FROM collections c
     LEFT JOIN users u ON u.id = c.agent_id
     WHERE c.id = ? LIMIT 1`,
    [collectionId]
  ) : { rows: { _array: [] } };
  const approvedCollectionsR = await execSQL(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM collections
     WHERE invoice_id = ?
       AND (active = 1 OR active = 'true' OR active IS NULL)
       AND status = 'approved'`,
    [invoiceId]
  );
  const approvedReturnsR = await execSQL(
    `SELECT COALESCE(SUM(return_amount), 0) as total
     FROM invoice_card_returns
     WHERE invoice_id = ?
       AND ${APPROVED_RETURN_CLAUSE}`,
    [invoiceId]
  );

  const invoice = invoiceR.rows._array?.[0] || {};
  const originalNet = Number(invoice.net_amount || invoice.total_amount || 0);
  const approvedReturns = Number(approvedReturnsR.rows._array?.[0]?.total || 0);
  const pendingReturnAmount = rows.reduce((sum, row) => sum + Number(row.return_amount || 0), 0);
  const approvedCollections = Number(approvedCollectionsR.rows._array?.[0]?.total || 0);
  const netAfterApproval = Math.max(0, originalNet - approvedReturns - pendingReturnAmount);
  return {
    invoice,
    collection: collectionR.rows._array?.[0] || null,
    rows,
    original_net_amount: originalNet,
    approved_collections_total: approvedCollections,
    approved_returns_total: approvedReturns,
    pending_return_amount: pendingReturnAmount,
    net_after_approval: netAfterApproval,
    remaining_after_approval: Math.max(0, netAfterApproval - approvedCollections),
  };
};

const updateRelatedAfterReturnDecision = async ({ invoiceId, collectionId }) => {
  try {
    const { updateInvoiceStatus } = require('./invoiceService');
    if (invoiceId) await updateInvoiceStatus(invoiceId);
  } catch (e) { }
  try {
    if (invoiceId) {
      const invR = await execSQL(`SELECT pos_id FROM invoices WHERE id = ? LIMIT 1`, [invoiceId]);
      const posId = invR.rows._array?.[0]?.pos_id;
      if (posId) {
        const { recalculatePOSCreditBalance } = require('./posService');
        await recalculatePOSCreditBalance(posId);
      }
    }
  } catch (e) { }
  notifyDataChanged('invoice_card_returns');
  notifyDataChanged('collections');
  notifyDataChanged('invoices');
};

export const approveCardReturnRequest = async ({ collectionId = null, invoiceId, approvedBy, notes = '', projectId = null, operationGroupId = null }) => {
  if (!invoiceId) throw new Error('لا يمكن اعتماد مرتجع بدون فاتورة.');
  const now = new Date().toISOString();
  const whereParams = [invoiceId];
  let where = `invoice_id = ?`;
  if (collectionId) { where += ` AND collection_id = ?`; whereParams.push(collectionId); }
  if (projectId) { where += ` AND project_id = ?`; whereParams.push(projectId); }
  await execSQL(
    `UPDATE invoice_card_returns
     SET status = 'approved', approved_at = ?, approved_by = ?, approval_notes = ?, updated_at = ?, synced = 0
     WHERE ${where}
       AND ${ACTIVE_RETURN_CLAUSE}
       AND LOWER(COALESCE(status, 'pending')) = 'pending'`,
    [now, approvedBy || null, notes || '', now, ...whereParams]
  );
  const rowsR = await execSQL(`SELECT * FROM invoice_card_returns WHERE ${where} AND status = 'approved'`, whereParams);
  for (const row of rowsR.rows._array || []) {
    await addToSyncQueue('invoice_card_returns', 'UPDATE', {
      status: 'approved',
      approved_at: now,
      approved_by: approvedBy || null,
      approval_notes: notes || '',
      updated_at: now,
    }, row.id, operationGroupId);
  }
  if (collectionId) {
    await execSQL(`UPDATE collections SET status='pending', approval_notes=?, synced=0 WHERE id=? AND status='pending_card_return_approval'`, [notes || '', collectionId]);
    await addToSyncQueue('collections', 'UPDATE', { status: 'pending', approval_notes: notes || '' }, collectionId, operationGroupId);
  }
  await updateRelatedAfterReturnDecision({ invoiceId, collectionId });
  return true;
};

export const rejectCardReturnRequest = async ({ collectionId = null, invoiceId, rejectedBy, notes = '', projectId = null, operationGroupId = null }) => {
  if (!invoiceId) throw new Error('لا يمكن رفض مرتجع بدون فاتورة.');
  const now = new Date().toISOString();
  const whereParams = [invoiceId];
  let where = `invoice_id = ?`;
  if (collectionId) { where += ` AND collection_id = ?`; whereParams.push(collectionId); }
  if (projectId) { where += ` AND project_id = ?`; whereParams.push(projectId); }
  await execSQL(
    `UPDATE invoice_card_returns
     SET status = 'rejected', rejected_at = ?, rejected_by = ?, rejection_notes = ?, updated_at = ?, synced = 0
     WHERE ${where}
       AND ${ACTIVE_RETURN_CLAUSE}
       AND LOWER(COALESCE(status, 'pending')) = 'pending'`,
    [now, rejectedBy || null, notes || '', now, ...whereParams]
  );
  const rowsR = await execSQL(`SELECT * FROM invoice_card_returns WHERE ${where} AND status = 'rejected'`, whereParams);
  for (const row of rowsR.rows._array || []) {
    await addToSyncQueue('invoice_card_returns', 'UPDATE', {
      status: 'rejected',
      rejected_at: now,
      rejected_by: rejectedBy || null,
      rejection_notes: notes || '',
      updated_at: now,
    }, row.id, operationGroupId);
  }
  if (collectionId) {
    await execSQL(`UPDATE collections SET status='pending', rejection_reason=?, synced=0 WHERE id=? AND status='pending_card_return_approval'`, [notes || 'مرفوض مرتجع الكروت', collectionId]);
    await addToSyncQueue('collections', 'UPDATE', { status: 'pending', rejection_reason: notes || 'مرفوض مرتجع الكروت' }, collectionId, operationGroupId);
  }
  await updateRelatedAfterReturnDecision({ invoiceId, collectionId });
  return true;
};
