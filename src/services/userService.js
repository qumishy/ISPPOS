import { execSQL, addToSyncQueue, notifyDataChanged, uuidv4 } from './dbCore';
import { getCached } from './cacheService';

export const getLocalUsers = async (projectId) => {
  const cacheKey = projectId ? `users:all:${projectId}` : 'users:all:global';
  return getCached(cacheKey, async () => {
    const where = projectId ? `WHERE project_id = '${projectId}'` : '';
    const r = await execSQL(`SELECT * FROM users ${where} ORDER BY name ASC`);
    return r.rows._array || [];
  });
};

export const createLocalUser = async (data) => {
  const id = uuidv4();
  const payload = {
    id,
    name: data.name,
    username: data.username,
    password_hash: data.password_hash,
    role: data.role || 'agent',
    phone: data.phone || '',
    active: 1,
    synced: 0,
    project_id: data.project_id
  };
  await execSQL(
    `INSERT INTO users (id, name, username, password_hash, role, phone, active, synced, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.name, payload.username, payload.password_hash, payload.role, payload.phone, payload.active, payload.synced, payload.project_id]
  );
  await addToSyncQueue('users', 'INSERT', payload, id);
  notifyDataChanged('users');
  return payload;
};

export const updateUser = async (id, data) => {
  await execSQL(`UPDATE users SET name=?, username=?, role=?, phone=?, active=?, password_hash=?, synced=0 WHERE id=?`, [data.name, data.username, data.role, data.phone, data.active ?? 1, data.password_hash, id]);
  await addToSyncQueue('users', 'UPDATE', { name: data.name, username: data.username, role: data.role, phone: data.phone, active: data.active ?? 1, password_hash: data.password_hash }, id);
  notifyDataChanged('users');
  return true;
};

export const softDeleteUser = async (id) => {
  const i = await execSQL(`SELECT id FROM invoices WHERE agent_id=? AND active=1 LIMIT 1`, [id]);
  const c = await execSQL(`SELECT id FROM collections WHERE agent_id=? AND active=1 LIMIT 1`, [id]);
  const w = await execSQL(`SELECT id FROM agent_wallets WHERE agent_id=? LIMIT 1`, [id]);
  const s = await execSQL(`SELECT id FROM supplies WHERE user_id=? LIMIT 1`, [id]);
  if (i.rows._array.length || c.rows._array.length || w.rows._array.length || s.rows._array.length) throw new Error('لا يمكن حذف المستخدم لوجود مبيعات أو تحصيلات أو عهده مرتبطة به.');
  await execSQL(`UPDATE users SET active=0, synced=0 WHERE id=?`, [id]);
  await addToSyncQueue('users', 'UPDATE', { active: 0 }, id);
  notifyDataChanged('users');
  return true;
};
