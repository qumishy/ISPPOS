import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';

export const getAgentWalletsDetailed = async () => {
  const sql = `SELECT aw.*, u.name as agent_name, c.name as category_name, c.price as category_price, b.batch_number, b.serial_number as batch_serial, b.received_date as batch_date, b.available_cards as batch_available, b.total_cards as batch_total, (aw.total_cards - aw.sold_cards) as remaining_cards FROM agent_wallets aw JOIN users u ON u.id = aw.agent_id LEFT JOIN card_categories c ON c.id = aw.category_id LEFT JOIN batches b ON b.id = aw.batch_id WHERE (aw.total_cards - aw.sold_cards) > 0 ORDER BY u.name ASC, aw.created_at DESC`;
  const r = await execSQL(sql);
  return r.rows._array || [];
};

export const transferAgentWalletToStorage = async (walletId, qtyToReturn = null) => {
  const wR = await execSQL(`SELECT * FROM agent_wallets WHERE id = ?`, [walletId]);
  const wallet = wR.rows._array[0];
  if (!wallet) throw new Error('المحفظة غير موجودة');
  const remaining = (wallet.total_cards || 0) - (wallet.sold_cards || 0);
  if (remaining <= 0) throw new Error('لا توجد أوراق متبقية للاسترجاع');
  const returnQty = qtyToReturn ? Math.min(qtyToReturn, remaining) : remaining;
  if (wallet.batch_id) {
    await execSQL(`UPDATE batches SET available_cards = available_cards + ?, synced = 0 WHERE id = ?`, [returnQty, wallet.batch_id]);
    const bR = await execSQL(`SELECT available_cards FROM batches WHERE id = ?`, [wallet.batch_id]);
    if (bR.rows._array.length > 0) await addToSyncQueue('batches', 'UPDATE', { available_cards: bR.rows._array[0].available_cards }, wallet.batch_id);
  }
  const newTotal = wallet.total_cards - returnQty;
  await execSQL(`UPDATE agent_wallets SET total_cards = ?, synced = 0 WHERE id = ?`, [newTotal, walletId]);
  await addToSyncQueue('agent_wallets', 'UPDATE', { total_cards: newTotal }, walletId);
  notifyDataChanged('agent_wallets');
  notifyDataChanged('batches');
  return { returnedQty: returnQty, newTotal };
};

export const createAgentWallet = async (data) => {
  const id = data.id || uuidv4();
  const payload = { id, agent_id: data.agent_id, batch_id: data.batch_id, category_id: data.category_id, from_card: data.from_card, to_card: data.to_card, total_cards: Number(data.total_cards || 0), sold_cards: Number(data.sold_cards || 0), issued_by: data.issued_by, notes: data.notes || '', created_at: data.created_at || new Date().toISOString(), synced: 0 };
  await execSQL(`INSERT OR REPLACE INTO agent_wallets (id, agent_id, batch_id, category_id, from_card, to_card, total_cards, sold_cards, issued_by, notes, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [payload.id, payload.agent_id, payload.batch_id, payload.category_id, payload.from_card, payload.to_card, payload.total_cards, payload.sold_cards, payload.issued_by, payload.notes, payload.created_at, payload.synced]);
  await addToSyncQueue('agent_wallets', 'INSERT', payload, id);
  notifyDataChanged('agent_wallets', payload);
  return payload;
};

export const getWalletsSummaryByAgent = async () => {
  const r = await execSQL(`SELECT u.id as agent_id, u.name as agent_name, SUM(aw.total_cards) as total_cards, SUM(aw.sold_cards) as sold_cards, (SUM(aw.total_cards) - SUM(aw.sold_cards)) as remaining_cards, COUNT(aw.id) as wallet_count FROM agent_wallets aw JOIN users u ON u.id = aw.agent_id GROUP BY u.id, u.name`);
  return r.rows._array || [];
};

export const getWalletMovements = async (agentId, filters = {}) => {
  let sql = `SELECT ii.*, i.invoice_number, i.invoice_date, p.name as pos_name, c.name as category_name, b.batch_number as batch_number FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id JOIN pos_customers p ON p.id = i.pos_id JOIN card_categories c ON c.id = ii.category_id LEFT JOIN batches b ON b.id = ii.batch_id WHERE i.agent_id = ? AND i.active = 1`;
  const params = [agentId];
  if (filters.category_id) { sql += ` AND ii.category_id = ?`; params.push(filters.category_id); }
  if (filters.batch_id) { sql += ` AND ii.batch_id = ?`; params.push(filters.batch_id); }
  if (filters.pos_id) { sql += ` AND i.pos_id = ?`; params.push(filters.pos_id); }
  if (filters.date) { sql += ` AND i.invoice_date = ?`; params.push(filters.date); }
  sql += ` ORDER BY i.created_at DESC`;
  const r = await execSQL(sql, params);
  return r.rows._array || [];
};

export const getLocalWallets = async (agentId) => {
  let sql = `SELECT aw.*, u.name as user_name, c.name as category_name, b.batch_number as batch_number, b.serial_number as batch_serial FROM agent_wallets aw LEFT JOIN users u ON u.id = aw.agent_id LEFT JOIN card_categories c ON c.id = aw.category_id LEFT JOIN batches b ON b.id = aw.batch_id WHERE 1=1`;
  const params = [];
  if (agentId) { sql += ` AND aw.agent_id = ?`; params.push(agentId); }
  sql += ` ORDER BY aw.created_at DESC`;
  const r = await execSQL(sql, params);
  return (r.rows._array || []).map(row => ({ ...row, users: { name: row.user_name }, card_categories: { name: row.category_name }, batches: { batch_number: row.batch_number, serial_number: row.batch_serial } }));
};

export const createLocalAgentWallet = async (data) => {
  const id = uuidv4();
  const payload = { id, agent_id: data.agent_id, batch_id: data.batch_id, category_id: data.category_id, total_cards: data.total_cards, sold_cards: 0, issued_by: data.issued_by, notes: data.notes || '', created_at: new Date().toISOString(), synced: 0 };
  await execSQL(`INSERT INTO agent_wallets (id, agent_id, batch_id, category_id, total_cards, sold_cards, issued_by, notes, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [payload.id, payload.agent_id, payload.batch_id, payload.category_id, payload.total_cards, payload.sold_cards, payload.issued_by, payload.notes, payload.created_at, payload.synced]);
  await addToSyncQueue('agent_wallets', 'INSERT', payload, id);
  const batchQuery = await execSQL(`SELECT available_cards FROM batches WHERE id = ?`, [payload.batch_id]);
  if (batchQuery.rows._array.length > 0) {
    const newAvailable = Math.max(0, batchQuery.rows._array[0].available_cards - payload.total_cards);
    await execSQL(`UPDATE batches SET available_cards = ?, synced = 0 WHERE id = ?`, [newAvailable, payload.batch_id]);
    await addToSyncQueue('batches', 'UPDATE', { available_cards: newAvailable }, payload.batch_id);
    notifyDataChanged('batches');
  }
  notifyDataChanged('agent_wallets');
};

export const updateLocalWalletCards = async (walletId, qtySold) => {
  await execSQL(`UPDATE agent_wallets SET sold_cards = sold_cards + ?, synced = 0 WHERE id = ?`, [qtySold, walletId]);
  const r = await execSQL(`SELECT sold_cards FROM agent_wallets WHERE id=?`, [walletId]);
  await addToSyncQueue('agent_wallets', 'UPDATE', { sold_cards: r.rows._array?.[0]?.sold_cards }, walletId);
  notifyDataChanged('agent_wallets');
};

export const getBatchesByAgent = async (agentId) => {
  const r = await execSQL(`SELECT b.id, b.batch_number, b.serial_number, c.name as category_name, (aw.total_cards - aw.sold_cards) as available FROM agent_wallets aw JOIN batches b ON b.id = aw.batch_id LEFT JOIN card_categories c ON c.id = b.category_id WHERE aw.agent_id = ? AND (aw.total_cards - aw.sold_cards) > 0 ORDER BY b.created_at DESC`, [agentId]);
  return r.rows._array || [];
};
