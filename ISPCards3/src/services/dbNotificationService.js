import { execSQL, notifyDataChanged, uuidv4 } from './dbCore';

export const saveLocalNotificationBox = async (notification) => {
  const idValue = notification.id || uuidv4();
  const { user_id = null, title, body, route = '', params = '{}', is_read = 0, created_at = new Date().toISOString() } = notification;
  await execSQL(`
    INSERT OR REPLACE INTO app_notifications (id, user_id, title, body, route, params, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [idValue, user_id, title, body, route, params, is_read, created_at]);
  notifyDataChanged('notifications');
};

export const getLocalNotificationsBox = async (userId = null) => {
  let sql = `SELECT * FROM app_notifications`;
  const params = [];
  if (userId) {
    sql += ` WHERE user_id = ? OR user_id IS NULL`;
    params.push(userId);
  }
  sql += ` ORDER BY created_at DESC LIMIT 50`;
  const r = await execSQL(sql, params);
  return r.rows._array || [];
};

export const markNotificationRead = async (id) => {
  await execSQL(`UPDATE app_notifications SET is_read = 1 WHERE id = ?`, [id]);
  notifyDataChanged('notifications');
};

export const markAllNotificationsRead = async (userId = null) => {
  if (userId) {
     await execSQL(`UPDATE app_notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL`, [userId]);
  } else {
     await execSQL(`UPDATE app_notifications SET is_read = 1`);
  }
  notifyDataChanged('notifications');
};
