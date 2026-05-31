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
  // Total debt across active invoices: approved discount net, otherwise gross.
  const invRes = await execSQL(
    `SELECT SUM(MAX(0, CASE WHEN COALESCE(discount_status, 'none') IN ('approved', 'auto_approved')
       THEN COALESCE(NULLIF(net_amount, 0), COALESCE(total_amount, 0) - COALESCE(discount_applied_value, 0))
       ELSE COALESCE(total_amount, 0)
     END)) as total_debt
     FROM invoices
     WHERE pos_id = ?
       AND COALESCE(is_deleted, 0) = 0
       AND deleted_at IS NULL
       AND (active = 1 OR active = 'true' OR active IS NULL)`,
    [posId]
  );
  const totalDebt = Number(invRes.rows._array[0]?.total_debt || 0);

  // Count all collections that are NOT rejected/cancelled/deleted (active=0).
  // Pending, approved, synced, and offline collections all reduce credit immediately.
  const colRes = await execSQL(
    `SELECT SUM(amount) as total_paid
     FROM collections
     JOIN invoices i ON i.id = collections.invoice_id
     WHERE collections.pos_id = ?
       AND (COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL AND (i.active = 1 OR i.active = 'true' OR i.active IS NULL))
       AND (collections.active = 1 OR collections.active = 'true' OR collections.active IS NULL)
       AND LOWER(COALESCE(collections.status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted')`,
    [posId]
  );
  const totalPaid = Number(colRes.rows._array[0]?.total_paid || 0);
  const finalCreditUsed = Math.max(0, totalDebt - totalPaid);
  await execSQL(`UPDATE pos_customers SET credit_used = ? WHERE id = ?`, [finalCreditUsed, posId]);
  notifyDataChanged('pos_customers');
};

/**
 * getPOSRemainingCredit
 * ──────────────────────────────────────────────────────────────────────────
 * Returns the live remaining credit for a POS customer, computed from SQLite.
 *
 *   remaining_credit = credit_limit
 *                    − SUM(remaining_unpaid_amount of all active, non-paid invoices)
 *
 * "Non-paid" = status IN ('pending', 'partial') OR status IS NULL.
 * Fully paid (status = 'paid') and inactive (active != 1) invoices are excluded.
 *
 * @param {string} posId
 * @returns {{ creditLimit: number, usedCredit: number, remainingCredit: number }}
 */
export const getPOSRemainingCredit = async (posId) => {
  if (!posId) return { creditLimit: 0, usedCredit: 0, remainingCredit: 0 };

  // Credit limit from POS record
  const posRes = await execSQL(
    `SELECT credit_limit FROM pos_customers WHERE id = ? LIMIT 1`,
    [posId]
  );
  const creditLimit = Number(posRes.rows._array[0]?.credit_limit || 0);

  // ── Business rule ────────────────────────────────────────────────────────
  // credit_used = SUM over active invoices of:
  //   MAX(0, invoice_net - all_collected_amounts)
  //
  // "all_collected_amounts" = any collection that is NOT rejected/cancelled
  // and belongs to an active row (active = 1).  This includes:
  //   • pending   – created by agent, awaiting cashier approval
  //   • approved  – approved by cashier/admin
  //   • synced    – already pushed to Supabase
  //   • offline   – created offline, not yet in sync_queue
  //
  // Rejected, cancelled, and soft-deleted (active = 0) collections are
  // excluded so they do NOT reduce outstanding balance.
  // ─────────────────────────────────────────────────────────────────────────
  const debtRes = await execSQL(
    `SELECT
       COALESCE(SUM(
         MAX(0,
           (CASE WHEN COALESCE(i.discount_status, 'none') IN ('approved', 'auto_approved')
             THEN COALESCE(NULLIF(i.net_amount, 0), COALESCE(i.total_amount, 0) - COALESCE(i.discount_applied_value, 0))
             ELSE COALESCE(i.total_amount, 0)
           END)
           - COALESCE((
               SELECT SUM(c.amount)
               FROM collections c
               JOIN invoices inv ON inv.id = c.invoice_id
               WHERE c.invoice_id = i.id
                 AND (COALESCE(inv.is_deleted, 0) = 0 AND inv.deleted_at IS NULL AND (inv.active = 1 OR inv.active = 'true' OR inv.active IS NULL))
                 AND (c.active = 1 OR c.active = 'true' OR c.active IS NULL)
                 AND LOWER(COALESCE(c.status, 'pending')) NOT IN ('rejected', 'cancelled', 'canceled', 'deleted')
             ), 0)
         )
       ), 0) AS total_unpaid
     FROM invoices i
     WHERE i.pos_id = ?
       AND (COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL AND (i.active = 1 OR i.active = 'true' OR i.active IS NULL))
       AND i.status IN ('pending', 'partial', 'overdue')`,
    [posId]
  );
  const usedCredit = Number(debtRes.rows._array[0]?.total_unpaid || 0);
  const remainingCredit = creditLimit - usedCredit;

  return { creditLimit, usedCredit, remainingCredit };
};
