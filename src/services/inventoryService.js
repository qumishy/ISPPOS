import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';

export const getLocalCategories = async () => {
  const r = await execSQL(`SELECT * FROM card_categories ORDER BY price ASC, name ASC`);
  return r.rows._array || [];
};

export const updateCategory = async (id, data) => {
  await execSQL(`UPDATE card_categories SET name=?, price=?, active=?, synced=0 WHERE id=?`, [data.name ?? null, Number(data.price || 0), data.active ?? 1, id]);
  await addToSyncQueue('card_categories', 'UPDATE', { name: data.name ?? null, price: Number(data.price || 0), active: data.active ?? 1 }, id);
  notifyDataChanged('card_categories');
  return true;
};

export const softDeleteCategory = async (id) => {
  const b = await execSQL(`SELECT id FROM batches WHERE category_id=? AND active=1 LIMIT 1`, [id]);
  const w = await execSQL(`SELECT id FROM agent_wallets WHERE category_id=? LIMIT 1`, [id]);
  const i = await execSQL(`SELECT id FROM invoice_items WHERE category_id=? LIMIT 1`, [id]);
  if (b.rows._array.length || w.rows._array.length || i.rows._array.length) throw new Error('لا يمكن حذف الفئة لوجود دفعات أو محافظ أو فواتير مرتبطة.');
  await execSQL(`UPDATE card_categories SET active=0, synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('card_categories', 'UPDATE', { active: 0 }, id);
  notifyDataChanged('card_categories');
  return true;
};

export const getLocalBatches = async () => {
  const r = await execSQL(`SELECT b.*, c.name as category_name FROM batches b LEFT JOIN card_categories c ON c.id = b.category_id ORDER BY b.created_at DESC`);
  return (r.rows._array || []).map(row => ({ ...row, card_categories: { name: row.category_name } }));
};

export const createLocalBatch = async (data) => {
  const id = uuidv4();
  const payload = { id, batch_number: data.batch_number, category_id: data.category_id, serial_number: data.serial_number, total_cards: data.total_cards, available_cards: data.total_cards, received_date: data.received_date || new Date().toISOString(), status: 'active', synced: 0 };
  await execSQL(`INSERT INTO batches (id, batch_number, category_id, serial_number, total_cards, available_cards, received_date, status, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [payload.id, payload.batch_number, payload.category_id, payload.serial_number, payload.total_cards, payload.available_cards, payload.received_date, payload.status, payload.synced]);
  await addToSyncQueue('batches', 'INSERT', payload, id);
  notifyDataChanged('batches');
};

export const updateLocalBatch = async (id, updates) => {
  const w = await execSQL(`SELECT id FROM agent_wallets WHERE batch_id=? LIMIT 1`, [id]);
  if (w.rows._array.length > 0) throw new Error('لا يمكن تعديل الدفعة لأنها موزعة.');
  const sets = Object.keys(updates).map(k => `${k}=?`).join(', ');
  const vals = Object.values(updates);
  await execSQL(`UPDATE batches SET ${sets}, synced=0 WHERE id=?`, [...vals, id]);
  await addToSyncQueue('batches', 'UPDATE', updates, id);
  notifyDataChanged('batches');
  return { isDistributed: false };
};

export const softDeleteBatch = async (id) => {
  const w = await execSQL(`SELECT id FROM agent_wallets WHERE batch_id=? LIMIT 1`, [id]);
  if (w.rows._array.length > 0) throw new Error('لا يمكن حذف الدفعة لأنها موزعة.');
  const inv = await execSQL(`SELECT id FROM invoice_items WHERE batch_id=? LIMIT 1`, [id]);
  if (inv.rows._array.length > 0) throw new Error('لا يمكن حذف الدفعة لأنها مرتبطة بفواتير.');
  await execSQL(`UPDATE batches SET active=0, status='deleted', synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('batches', 'UPDATE', { active: 0, status: 'deleted' }, id);
  notifyDataChanged('batches');
  return true;
};

export const getBatchFinancialSummary = async (batchId) => {
  const r = await execSQL(`SELECT SUM(ii.total_price) as batch_sales, SUM(ii.total_price * (CAST(COALESCE(i.approved_amount, 0) AS REAL) / CASE WHEN COALESCE(i.net_amount, COALESCE(i.total_amount, 0)) = 0 THEN 1 ELSE COALESCE(i.net_amount, COALESCE(i.total_amount, 1)) END)) as batch_collections FROM invoice_items ii LEFT JOIN invoices i ON i.id = ii.invoice_id WHERE ii.batch_id = ? AND i.active = 1`, [batchId]);
  const sales = r.rows._array[0]?.batch_sales || 0;
  const collections = r.rows._array[0]?.batch_collections || 0;
  return { sales: Number(sales), collections: Number(collections), uncollected: Number(sales) - Number(collections) };
};
