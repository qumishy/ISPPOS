import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';

export const getLocalPOS = async () => {
  const r = await execSQL(`SELECT * FROM pos_customers ORDER BY name ASC`);
  return r.rows._array || [];
};

// alias للتوافق مع الشاشات التي تستدعيها بالاسم القديم
export const getLocalPosDB = getLocalPOS;


export const createLocalPOS = async (data) => {
  const id = uuidv4();
  const payload = { id, name: data.name, owner_name: data.owner_name, phone: data.phone, city: data.city, credit_limit: data.credit_limit, credit_used: 0, is_blocked: 0, assigned_agent_id: data.assigned_agent_id, active: 1, synced: 0 };
  await execSQL(`INSERT INTO pos_customers (id, name, owner_name, phone, city, credit_limit, credit_used, is_blocked, assigned_agent_id, active, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.name, payload.owner_name, payload.phone, payload.city, payload.credit_limit, payload.credit_used, payload.is_blocked, payload.assigned_agent_id, payload.active, payload.synced]);
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
  const invRes = await execSQL(`SELECT SUM(net_amount) as total_debt FROM invoices WHERE pos_id = ? AND active = 1`, [posId]);
  const totalDebt = Number(invRes.rows._array[0]?.total_debt || 0);
  const colRes = await execSQL(`SELECT SUM(amount) as total_paid FROM collections WHERE pos_id = ? AND status = 'approved' AND active = 1`, [posId]);
  const totalPaid = Number(colRes.rows._array[0]?.total_paid || 0);
  const finalCreditUsed = Math.max(0, totalDebt - totalPaid);
  await execSQL(`UPDATE pos_customers SET credit_used = ? WHERE id = ?`, [finalCreditUsed, posId]);
  notifyDataChanged('pos_customers');
};
