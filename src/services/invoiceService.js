import { execSQL, addToSyncQueue, notifyDataChanged, getSetting, uuidv4 } from './dbCore';

export const getLocalInvoices = async (filters = {}) => {
  let sql = `
SELECT 
  i.*,
  COALESCE(i.paid_amount, 0) as paid_sum,
  COALESCE(i.approved_amount, 0) as approved_sum,
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
WHERE (i.active = 1 OR i.active = 'true' OR i.active IS NULL)
`;
  const params = [];
  if (filters.status) {
    if (filters.status === 'overdue') {
      const days = await getSetting('overdue_days', '20');
      sql += ` AND status != 'paid' AND (julianday('now') - julianday(invoice_date)) > ${days}`;
    } else {
      sql += ` AND status = ?`;
      params.push(filters.status);
    }
  }
  if (filters.id) { sql += ` AND i.id = ?`; params.push(filters.id); }
  if (filters.agent_id) { sql += ` AND i.agent_id = ?`; params.push(filters.agent_id); }
  if (filters.pos_id) { sql += ` AND pos_id = ?`; params.push(filters.pos_id); }
  if (filters.onlyWithBalance) { sql += ` AND (i.net_amount - COALESCE(i.paid_amount, 0)) > 0.1`; }
  sql += ` ORDER BY created_at DESC`;
  const r = await execSQL(sql, params);
  return r.rows._array || [];
};

export const getInvoicePaidSum = async (id) => {
  const r = await execSQL(`SELECT SUM(amount) as s FROM collections WHERE invoice_id = ? AND (active = 1 OR active = 'true')`, [id]);
  return r.rows._array[0]?.s || 0;
};

export const updateInvoiceStatus = async (invoiceId) => {
  if (!invoiceId) return;
  const invR = await execSQL(`SELECT net_amount, total_amount, paid_amount, approved_amount, status FROM invoices WHERE id = ?`, [invoiceId]);
  const inv = invR.rows._array[0];
  if (!inv) return;
  const net = inv.net_amount || inv.total_amount || 0;
  const sumAllR = await execSQL(`SELECT SUM(amount) as s FROM collections WHERE invoice_id = ? AND (active = 1 OR active = 'true')`, [invoiceId]);
  const totalPaid = sumAllR.rows._array[0]?.s || 0;
  const sumApprovedR = await execSQL(`SELECT SUM(amount) as s FROM collections WHERE invoice_id = ? AND (active = 1 OR active = 'true') AND status = 'approved'`, [invoiceId]);
  const approvedPaid = sumApprovedR.rows._array[0]?.s || 0;
  let newStatus = 'pending';
  if (totalPaid >= (net - 0.1) && net > 0) newStatus = 'paid';
  else if (totalPaid > 0) newStatus = 'partial';
  if (inv.status !== newStatus || inv.paid_amount !== totalPaid || inv.approved_amount !== approvedPaid) {
    await execSQL(`UPDATE invoices SET paid_amount = ?, approved_amount = ?, status = ? WHERE id = ?`, [totalPaid, approvedPaid, newStatus, invoiceId]);
    await addToSyncQueue('invoices', 'UPDATE', { paid_amount: totalPaid, approved_amount: approvedPaid, status: newStatus }, invoiceId);
    notifyDataChanged('invoices');
  }
};

export const repairInvoicesStatus = async () => {
  const invoices = await execSQL(`SELECT id, net_amount, total_amount, status, paid_amount FROM invoices WHERE (active = 1 OR active = 'true' OR active IS NULL)`);
  let count = 0;
  for (const inv of invoices.rows._array) {
    const net = inv.net_amount || inv.total_amount || 0;
    const sumR = await execSQL(`SELECT SUM(amount) as s FROM collections WHERE invoice_id = ? AND (active = 1 OR active = 'true')`, [inv.id]);
    const paid = sumR.rows._array[0]?.s || 0;
    let status = 'pending';
    if (paid >= (net - 0.1) && net > 0) status = 'paid';
    else if (paid > 0) status = 'partial';
    if (inv.status !== status || paid !== (inv.paid_amount || 0)) {
      await execSQL(`UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?`, [paid, status, inv.id]);
      await addToSyncQueue('invoices', 'UPDATE', { paid_amount: paid, status: status }, inv.id);
      count++;
    }
  }
  notifyDataChanged('invoices');
  return count;
};

export const createLocalInvoice = async (data) => {
  const id = data.id || uuidv4();
  const invoice_number = data.invoice_number || `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000) + 10000}`;
  const created_at = data.created_at || new Date().toISOString();
  if (data.pos_id) {
    const posRes = await execSQL(`SELECT credit_limit, name, credit_used FROM pos_customers WHERE id = ?`, [data.pos_id]);
    const pos = posRes.rows._array[0];
    if (pos) {
      const newAmount = Number(data.net_amount || data.total_amount || 0);
      if (Number(pos.credit_used || 0) + newAmount > (Number(pos.credit_limit || 0) + 1.0)) {
        throw new Error(`🚫 تجاوزت نقطة "${pos.name}" الحد الائتماني!`);
      }
    }
  }
  const payload = { id, invoice_number, pos_id: data.pos_id, agent_id: data.agent_id, type: data.type || 'credit', total_amount: Number(data.total_amount || 0), net_amount: Number(data.net_amount ?? data.total_amount ?? 0), paid_amount: Number(data.paid_amount || 0), status: data.status || 'pending', notes: data.notes || '', invoice_date: data.invoice_date || created_at, active: data.active ?? 1, created_at, synced: 0 };
  await execSQL(`INSERT OR REPLACE INTO invoices (id, invoice_number, pos_id, agent_id, type, total_amount, net_amount, paid_amount, status, notes, invoice_date, active, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [payload.id, payload.invoice_number, payload.pos_id, payload.agent_id, payload.type, payload.total_amount, payload.net_amount, payload.paid_amount, payload.status, payload.notes, payload.invoice_date, payload.active, payload.created_at, payload.synced]);
  await addToSyncQueue('invoices', 'INSERT', payload, id);
  // Import dynamically to avoid circular dep
  const { recalculatePOSCreditBalance } = require('./posService');
  if (payload.pos_id) await recalculatePOSCreditBalance(payload.pos_id);
  return payload;
};

export const addInvoiceItem = async (data) => {
  const id = data.id || uuidv4();
  const payload = { id, invoice_id: data.invoice_id, category_id: data.category_id, batch_id: data.batch_id, wallet_id: data.wallet_id, from_card: data.from_card, to_card: data.to_card, quantity: Number(data.quantity || 0), unit_price: Number(data.unit_price || 0), total_price: Number(data.total_price || 0), created_at: data.created_at || new Date().toISOString(), synced: 0 };
  await execSQL(`INSERT OR REPLACE INTO invoice_items (id, invoice_id, category_id, batch_id, wallet_id, from_card, to_card, quantity, unit_price, total_price, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.invoice_id, payload.category_id, payload.batch_id, payload.wallet_id, payload.from_card, payload.to_card, payload.quantity, payload.unit_price, payload.total_price, payload.created_at, payload.synced]);
  await addToSyncQueue('invoice_items', 'INSERT', payload, id);
  notifyDataChanged('invoice_items', payload);
  return payload;
};

export const softDeleteInvoice = async (id) => {
  const colCheck = await execSQL(`SELECT id FROM collections WHERE invoice_id=? AND (active=1 OR status='approved') LIMIT 1`, [id]);
  if (colCheck.rows._array.length > 0) throw new Error('لا يمكنك حذف الفاتورة لأن لديها تحصيلات مرتبطة.');
  const qItems = await execSQL(`SELECT wallet_id, quantity FROM invoice_items WHERE invoice_id=?`, [id]);
  for (const item of qItems.rows._array) {
    if (item.wallet_id) {
      await execSQL(`UPDATE agent_wallets SET sold_cards = MAX(0, sold_cards - ?), synced = 0 WHERE id = ?`, [item.quantity, item.wallet_id]);
      const rw = await execSQL(`SELECT sold_cards FROM agent_wallets WHERE id=?`, [item.wallet_id]);
      if (rw.rows._array.length > 0) await addToSyncQueue('agent_wallets', 'UPDATE', { sold_cards: rw.rows._array[0].sold_cards }, item.wallet_id);
    }
  }
  await execSQL(`UPDATE invoices SET active=0, synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('invoices', 'UPDATE', { active: 0 }, id);
  const invR = await execSQL(`SELECT pos_id FROM invoices WHERE id=?`, [id]);
  const pos_id = invR.rows._array[0]?.pos_id;
  const { recalculatePOSCreditBalance } = require('./posService');
  if (pos_id) await recalculatePOSCreditBalance(pos_id);
  notifyDataChanged('agent_wallets');
  notifyDataChanged('invoices');
  return true;
};

export const getLocalInvoiceItems = async (invoiceId) => {
  const r = await execSQL(`SELECT ii.*, c.name as category_name, b.batch_number FROM invoice_items ii LEFT JOIN card_categories c ON c.id = ii.category_id LEFT JOIN batches b ON b.id = ii.batch_id WHERE ii.invoice_id = ? ORDER BY ii.created_at ASC`, [invoiceId]);
  return r.rows._array || [];
};

export const checkOverdueInvoices = async (user) => {
  try {
    const overdueDays = await getSetting('overdue_period', 20);
    let sql = `SELECT i.*, p.name as pos_name FROM invoices i JOIN pos_customers p ON p.id = i.pos_id WHERE i.status != 'paid' AND (i.active = 1 OR i.active = 'true' OR i.active IS NULL) AND i.notified_overdue = 0 AND date(i.created_at, '+' || ? || ' days') <= date('now')`;
    const params = [overdueDays];
    if (user?.role === 'agent') { sql += ` AND i.agent_id = ?`; params.push(user.id); }
    const r = await execSQL(sql, params);
    const { sendLocalNotification } = require('./NotificationService');
    for (const inv of r.rows._array) {
      await sendLocalNotification('⚠️ فاتورة متأخرة', `الفاتورة #${inv.invoice_number} لعميل (${inv.pos_name}) تجاوزت فترة السداد.`, { invoiceId: inv.id });
      await execSQL(`UPDATE invoices SET notified_overdue = 1 WHERE id = ?`, [inv.id]);
    }
  } catch (e) { }
};
