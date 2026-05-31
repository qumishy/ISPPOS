import { execSQL, notifyDataChanged, uuidv4 } from './dbCore';

export const saveLocalNotificationBox = async (notification) => {
  const idValue = notification.id || uuidv4();
  const { project_id = null, user_id = null, title, body, type = '', reference_id = '', route = '', params = '{}', is_read = 0, created_at = new Date().toISOString() } = notification;
  if (!project_id) {
    console.log('[Notifications] blocked save without project_id');
    return;
  }
  console.log(`[Notifications] save project_id=${project_id} user_id=${user_id || 'all'} type=${type || 'general'}`);
  await execSQL(`
    INSERT OR REPLACE INTO app_notifications (id, project_id, user_id, title, body, type, reference_id, route, params, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [idValue, project_id, user_id, title, body, type, reference_id, route, params, is_read, created_at]);
  notifyDataChanged('notifications');
};

export const getLocalNotificationsBox = async (userId = null, projectId = null) => {
  if (!projectId) {
    console.log('[Notifications] blocked load without project_id');
    return [];
  }
  console.log(`[Notifications] load project_id=${projectId} user_id=${userId || 'all'}`);
  let sql = `SELECT * FROM app_notifications WHERE project_id = ?`;
  const params = [projectId];
  if (userId) {
    sql += ` AND (user_id = ? OR user_id IS NULL)`;
    params.push(userId);
  }
  sql += ` ORDER BY created_at DESC LIMIT 50`;
  const r = await execSQL(sql, params);
  return r.rows._array || [];
};

export const markNotificationRead = async (id, projectId = null) => {
  if (!projectId) return;
  await execSQL(`UPDATE app_notifications SET is_read = 1 WHERE id = ? AND project_id = ?`, [id, projectId]);
  notifyDataChanged('notifications');
};

export const markAllNotificationsRead = async (userId = null, projectId = null) => {
  if (!projectId) return;
  if (userId) {
     await execSQL(`UPDATE app_notifications SET is_read = 1 WHERE project_id = ? AND (user_id = ? OR user_id IS NULL)`, [projectId, userId]);
  } else {
     await execSQL(`UPDATE app_notifications SET is_read = 1 WHERE project_id = ?`, [projectId]);
  }
  notifyDataChanged('notifications');
};
