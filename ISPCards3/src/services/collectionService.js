import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';
import { updateInvoiceStatus, getInvoicePaidSum } from './invoiceService';

export const getLocalCollections = async (filters = {}) => {
  let sql = `SELECT c.*, u.name as agent_name, p.name as pos_name, p.phone as pos_phone, i.invoice_number, i.net_amount as inv_net, i.paid_amount as inv_paid, apr.name as approver_name FROM collections c LEFT JOIN users u ON u.id = c.agent_id LEFT JOIN pos_customers p ON p.id = c.pos_id LEFT JOIN invoices i ON i.id = c.invoice_id LEFT JOIN users apr ON apr.id = c.approved_by WHERE (c.active = 1 OR c.active = 'true')`;
  const params = [];
  if (filters.status) { sql += ` AND c.status = ?`; params.push(filters.status); }
  if (filters.agent_id) { sql += ` AND c.agent_id = ?`; params.push(filters.agent_id); }
  if (filters.invoice_id) { sql += ` AND c.invoice_id = ?`; params.push(filters.invoice_id); }
  if (filters.pos_id) { sql += ` AND c.pos_id = ?`; params.push(filters.pos_id); }
  sql += ` ORDER BY c.created_at DESC`;
  const r = await execSQL(sql, params);
  return r.rows._array || [];
};

export const createLocalCollection = async (data) => {
  if (!data.invoice_id) throw new Error('لا يمكن إنشاء تحصيل بدون تحديد رقم الفاتورة');
  const invRes = await execSQL(`SELECT net_amount, total_amount FROM invoices WHERE id = ?`, [data.invoice_id]);
  const invoice = invRes.rows._array[0];
  if (invoice) {
    const totalAmount = Number(invoice.net_amount || invoice.total_amount || 0);
    const paidSum = await getInvoicePaidSum(data.invoice_id);
    if (Number(data.amount || 0) > (totalAmount - paidSum + 0.01)) {
      throw new Error(`المبلغ المدخل أكبر من المتبقي للفاتورة`);
    }
  }
  const id = data.id || uuidv4();
  const payload = { id, collection_number: data.collection_number || `COL-${Math.floor(Math.random() * 90000) + 10000}`, agent_id: data.agent_id, pos_id: data.pos_id, invoice_id: data.invoice_id, amount: Number(data.amount || 0), method: data.method || 'cash', reference_number: data.reference_number || '', status: data.status || 'pending', approved_at: data.approved_at, rejection_reason: data.rejection_reason, collection_date: data.collection_date || new Date().toISOString().slice(0, 10), active: data.active ?? 1, created_at: data.created_at || new Date().toISOString(), synced: 0 };
  await execSQL(`INSERT OR REPLACE INTO collections (id, collection_number, agent_id, pos_id, invoice_id, amount, method, reference_number, status, approved_at, rejection_reason, collection_date, active, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [payload.id, payload.collection_number, payload.agent_id, payload.pos_id, payload.invoice_id, payload.amount, payload.method, payload.reference_number, payload.status, payload.approved_at, payload.rejection_reason, payload.collection_date, payload.active, payload.created_at, payload.synced]);
  if (payload.invoice_id) await updateInvoiceStatus(payload.invoice_id);
  await addToSyncQueue('collections', 'INSERT', payload, id);
  notifyDataChanged('collections', payload);
  const { sendLocalNotification } = require('./NotificationService');
  try { await sendLocalNotification('💰 تحصيل جديد', `تم تسجيل تحصيل بمبلغ ${payload.amount} ر.ي بنجاح`); } catch (e) {}
  return payload;
};

export const approveLocalCollection = async (id, notes = '', approvedBy = null) => {
  const approved_at = new Date().toISOString();
  await execSQL(`UPDATE collections SET status='approved', approved_at=?, approval_notes=?, rejection_reason=NULL, approved_by=?, synced=0 WHERE id=?`, [approved_at, notes, approvedBy, id]);
  await addToSyncQueue('collections', 'UPDATE', { status: 'approved', approved_at, approval_notes: notes, rejection_reason: null, approved_by: approvedBy }, id);
  const colR = await execSQL(`SELECT invoice_id, pos_id FROM collections WHERE id=?`, [id]);
  const row = colR.rows._array[0];
  if (row?.invoice_id) await updateInvoiceStatus(row.invoice_id);
  const { recalculatePOSCreditBalance } = require('./posService');
  if (row?.pos_id) await recalculatePOSCreditBalance(row.pos_id);
  notifyDataChanged('collections');
  return true;
};

export const cancelLocalCollectionApproval = async (id) => {
  await execSQL(`UPDATE collections SET status='pending', approved_at=NULL, approval_notes=NULL, synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('collections', 'UPDATE', { status: 'pending', approved_at: null, approval_notes: null }, id);
  const colR = await execSQL(`SELECT invoice_id, pos_id FROM collections WHERE id=?`, [id]);
  const row = colR.rows._array[0];
  if (row?.invoice_id) await updateInvoiceStatus(row.invoice_id);
  const { recalculatePOSCreditBalance } = require('./posService');
  if (row?.pos_id) await recalculatePOSCreditBalance(row.pos_id);
  notifyDataChanged('collections');
  return true;
};

export const rejectLocalCollection = async (id, reason = 'مرفوض') => {
  await execSQL(`UPDATE collections SET status='rejected', rejection_reason=?, synced=0 WHERE id=?`, [reason, id]);
  await addToSyncQueue('collections', 'UPDATE', { status: 'rejected', rejection_reason: reason }, id);
  notifyDataChanged('collections');
  return true;
};

export const deleteLocalCollection = async (id) => {
  await execSQL('UPDATE collections SET active=0, synced=0 WHERE id=?', [id]);
  await addToSyncQueue('collections', 'UPDATE', { active: 0 }, id);
  const colR = await execSQL(`SELECT invoice_id FROM collections WHERE id=?`, [id]);
  if (colR.rows._array[0]?.invoice_id) await updateInvoiceStatus(colR.rows._array[0].invoice_id);
  notifyDataChanged('collections');
  return true;
};

export const getCollectionsForSupply = async (agentId, dateFilter = null, cashierId = null) => {
  let sql = `SELECT c.*, p.name as pos_name, i.invoice_number, u.name as agent_name FROM collections c LEFT JOIN pos_customers p ON p.id = c.pos_id LEFT JOIN invoices i ON i.id = c.invoice_id LEFT JOIN users u ON u.id = c.agent_id WHERE c.status = 'approved' AND c.supply_id IS NULL AND (c.active = 1 OR c.active = 'true')`;
  const params = [];
  if (agentId && agentId !== 'all') { sql += ` AND c.agent_id = ?`; params.push(agentId); }
  if (dateFilter) { sql += ` AND date(c.collection_date) = date(?)`; params.push(dateFilter); }
  if (cashierId) { sql += ` AND c.approved_by = ?`; params.push(cashierId); }
  sql += ` ORDER BY c.collection_date ASC`;
  const r = await execSQL(sql, params);
  return r.rows._array || [];
};
