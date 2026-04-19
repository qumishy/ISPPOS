import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';

export const createLocalSupply = async (data, collectionIds = []) => {
  const id = uuidv4();
  const payload = { id, supply_number: data.supply_number || `SUP-${Math.floor(Math.random() * 90000) + 10000}`, user_id: data.user_id, agent_id: data.agent_id, amount: Number(data.amount || 0), notes: data.notes || '', type: data.type || 'deposit', status: data.status || 'pending', approved_at: data.approved_at, approval_notes: data.approval_notes, created_at: data.created_at || new Date().toISOString(), synced: 0 };
  await execSQL(`INSERT INTO supplies (id, supply_number, user_id, agent_id, amount, notes, type, status, approved_at, approval_notes, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [payload.id, payload.supply_number, payload.user_id, payload.agent_id, payload.amount, payload.notes, payload.type, payload.status, payload.approved_at, payload.approval_notes, payload.created_at, payload.synced]);
  await addToSyncQueue('supplies', 'INSERT', payload, id);
  if (collectionIds?.length > 0) {
    for (const cId of collectionIds) {
      await execSQL(`UPDATE collections SET supply_id=?, synced=0 WHERE id=?`, [id, cId]);
      await addToSyncQueue('collections', 'UPDATE', { supply_id: id }, cId);
    }
    notifyDataChanged('collections');
  }
  notifyDataChanged('supplies', payload);
  return payload;
};

export const getLocalSupplies = async (filters = {}) => {
  let sql = `SELECT s.*, u.name as user_name, a.name as agent_name FROM supplies s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN users a ON a.id = s.agent_id WHERE 1=1`;
  const params = [];
  if (filters.user_id) { sql += ` AND s.user_id = ?`; params.push(filters.user_id); }
  if (filters.agent_id) { sql += ` AND s.agent_id = ?`; params.push(filters.agent_id); }
  if (filters.status) { sql += ` AND s.status = ?`; params.push(filters.status); }
  sql += ` ORDER BY s.created_at DESC`;
  const r = await execSQL(sql, params);
  return r.rows._array || [];
};

export const approveLocalSupply = async (id, notes = '') => {
  const approved_at = new Date().toISOString();
  await execSQL(`UPDATE supplies SET status='approved', approved_at=?, approval_notes=?, synced=0 WHERE id=?`, [approved_at, notes, id]);
  await addToSyncQueue('supplies', 'UPDATE', { status: 'approved', approved_at, approval_notes: notes }, id);
  notifyDataChanged('supplies');
};

export const cancelLocalSupplyApproval = async (id) => {
  await execSQL(`UPDATE supplies SET status='pending', approved_at=NULL, approval_notes=NULL, synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('supplies', 'UPDATE', { status: 'pending', approved_at: null, approval_notes: null }, id);
  notifyDataChanged('supplies');
};

export const rejectLocalSupply = async (id) => {
  await execSQL(`UPDATE supplies SET status='rejected', synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('supplies', 'UPDATE', { status: 'rejected' }, id);
  const r = await execSQL(`SELECT id FROM collections WHERE supply_id=?`, [id]);
  for (const row of r.rows._array) {
      await execSQL(`UPDATE collections SET supply_id=NULL, synced=0 WHERE id=?`, [row.id]);
      await addToSyncQueue('collections', 'UPDATE', { supply_id: null }, row.id);
  }
  notifyDataChanged('supplies');
  notifyDataChanged('collections');
};

export const getSupplyPrintDetails = async (supplyId) => {
  const r = await execSQL(`SELECT c.collection_number, c.amount as collection_amount, c.collection_date, i.invoice_number, i.net_amount, i.approved_amount, p.name as pos_name, u.name as agent_name, (SELECT group_concat(cat.name || ' (' || ii.quantity || ')', ' + ') FROM invoice_items ii LEFT JOIN card_categories cat ON cat.id = ii.category_id WHERE ii.invoice_id = c.invoice_id) as items_desc FROM collections c LEFT JOIN pos_customers p ON p.id = c.pos_id LEFT JOIN invoices i ON i.id = c.invoice_id LEFT JOIN users u ON u.id = c.agent_id WHERE c.supply_id = ? ORDER BY c.collection_date ASC`, [supplyId]);
  return r.rows._array || [];
};
