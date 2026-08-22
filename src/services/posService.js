import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';
import { getCached } from './cacheService';

export const getLocalPOS = async (projectId) => {
  const cacheKey = projectId ? `pos_customers:all:${projectId}` : 'pos_customers:all:global';
  return getCached(cacheKey, async () => {
    const where = projectId ? `WHERE project_id = '${projectId}' AND (active = 1 OR active IS NULL)` : 'WHERE (active = 1 OR active IS NULL)';
    const r = await execSQL(`SELECT * FROM pos_customers ${where} ORDER BY name ASC`);
    return r.rows._array || [];
  });
};

// alias للتوافق مع الشاشات التي تستدعيها بالاسم القديم
export const getLocalPosDB = getLocalPOS;


export const createLocalPOS = async (data) => {
  const id = uuidv4();
  const payload = { id, name: data.name, owner_name: data.owner_name, phone: data.phone, city: data.city, credit_limit: data.credit_limit, credit_used: 0, is_blocked: 0, assigned_agent_id: data.assigned_agent_id, active: 1, synced: 0, project_id: data.project_id };
  await execSQL(`INSERT INTO pos_customers (id, name, owner_name, phone, city, credit_limit, credit_used, is_blocked, assigned_agent_id, active, synced, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.name, payload.owner_name, payload.phone, payload.city, payload.credit_limit, payload.credit_used, payload.is_blocked, payload.assigned_agent_id, payload.active, payload.synced, payload.project_id]);
  await addToSyncQueue('pos_customers', 'INSERT', payload, id);
  notifyDataChanged('pos_customers');
};

export const updateLocalPOS = async (id, data) => {
  await execSQL(`UPDATE pos_customers SET name=?, owner_name=?, phone=?, city=?, credit_limit=?, assigned_agent_id=?, synced=0 WHERE id=?`, [data.name, data.owner_name, data.phone, data.city, data.credit_limit, data.assigned_agent_id, id]);
  await addToSyncQueue('pos_customers', 'UPDATE', data, id);
  notifyDataChanged('pos_customers');
};

export const toggleLocalPOSBlock = async (id, blocked) => {
  await execSQL(`UPDATE pos_customers SET is_blocked=?, synced=0 WHERE id=?`, [blocked ? 1 : 0, id]);
  await addToSyncQueue('pos_customers', 'UPDATE', { is_blocked: blocked }, id);
  notifyDataChanged('pos_customers');
};

export const recalculatePOSCreditBalance = async (posId) => {
  if (!posId) return;
  const { outstandingBalance } = await getPOSAvailableCredit(posId);
  await execSQL(`UPDATE pos_customers SET credit_used = ? WHERE id = ?`, [outstandingBalance, posId]);
  notifyDataChanged('pos_customers');
};

export const CREDIT_LIMIT_EXCEEDED_MESSAGE = 'لا يمكن حفظ الفاتورة. قيمة الفاتورة تتجاوز الحد الائتماني المتاح لنقطة البيع.';

/**
 * getPOSAvailableCredit
 * ──────────────────────────────────────────────────────────────────────────
 * Returns the live credit figures for a POS customer, computed from SQLite.
 *
 *   outstanding_balance = SUM over non-cash invoices of
 *                         MAX(0, invoice_net
 *                                - active collections
 *                                - active card returns)
 *   available_credit = credit_limit - outstanding_balance
 *
 * Payment coverage intentionally includes pending collections and card returns,
 * matching getInvoicePaidSum/getLocalInvoices. Cash invoices are filtered out
 * before their linked coverage is evaluated. Rejected, cancelled, deleted,
 * inactive, and soft-deleted financial rows are excluded.
 *
 * @param {string} posId
 * @param {string|null} projectId
 * @param {string|null} phaseId
 * @returns {{ creditLimit: number, outstandingBalance: number, availableCredit: number }}
 */
export const getPOSAvailableCredit = async (posId, projectId = null, phaseId = null) => {
  if (!posId) return { creditLimit: 0, outstandingBalance: 0, availableCredit: 0 };

  // Reuse the exact amount and payment-coverage clauses trusted by invoiceService.
  // The import stays dynamic because invoiceService calls this service at save time.
  const {
    ACTIVE_INVOICE_CLAUSE,
    ACTIVE_FINANCIAL_INVOICE_STATUS_CLAUSE,
    NON_CASH_INVOICE_TYPE_CLAUSE,
    ACTIVE_COLLECTION_CLAUSE,
    ACTIVE_CARD_RETURN_CLAUSE,
    INVOICE_AMOUNT_EXPR,
  } = require('./invoiceService');

  const posParams = [posId];
  let posWhere = 'id = ?';
  if (projectId) {
    posWhere += ' AND project_id = ?';
    posParams.push(projectId);
  }
  const posRes = await execSQL(
    `SELECT credit_limit FROM pos_customers WHERE ${posWhere} LIMIT 1`,
    posParams
  );
  const creditLimit = Number(posRes.rows._array[0]?.credit_limit || 0);

  const invoiceAmountExpr = INVOICE_AMOUNT_EXPR('i');
  const collectionsExpr = `(SELECT COALESCE(SUM(c.amount), 0)
    FROM collections c
    WHERE c.invoice_id = i.id
      AND ${ACTIVE_COLLECTION_CLAUSE('c')})`;
  const cardReturnsExpr = `(SELECT COALESCE(SUM(r.return_amount), 0)
    FROM invoice_card_returns r
    WHERE r.invoice_id = i.id
      AND ${ACTIVE_CARD_RETURN_CLAUSE('r')})`;

  const debtParams = [posId];
  let invoiceScope = `i.pos_id = ?
    AND ${ACTIVE_INVOICE_CLAUSE('i')}
    AND ${ACTIVE_FINANCIAL_INVOICE_STATUS_CLAUSE('i')}
    AND ${NON_CASH_INVOICE_TYPE_CLAUSE('i')}`;
  if (projectId) {
    invoiceScope += ' AND i.project_id = ?';
    debtParams.push(projectId);
  }
  if (phaseId) {
    invoiceScope += ' AND i.phase_id = ?';
    debtParams.push(phaseId);
  }

  const debtRes = await execSQL(
    `SELECT
       COALESCE(SUM(
         MAX(0, ${invoiceAmountExpr} - (${collectionsExpr}) - (${cardReturnsExpr}))
       ), 0) AS total_unpaid
     FROM invoices i
     WHERE ${invoiceScope}`,
    debtParams
  );
  const outstandingBalance = Number(debtRes.rows._array[0]?.total_unpaid || 0);
  const availableCredit = creditLimit - outstandingBalance;

  return { creditLimit, outstandingBalance, availableCredit };
};

// Backward-compatible shape for existing callers.
export const getPOSRemainingCredit = async (posId, projectId = null, phaseId = null) => {
  const result = await getPOSAvailableCredit(posId, projectId, phaseId);
  return {
    ...result,
    usedCredit: result.outstandingBalance,
    remainingCredit: result.availableCredit,
  };
};
