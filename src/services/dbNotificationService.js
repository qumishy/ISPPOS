import { execSQL, notifyDataChanged, uuidv4, isDbReady, waitForDbReady } from './dbCore';

export const saveLocalNotificationBox = async (notification) => {
  if (!isDbReady()) {
    await waitForDbReady();
    if (!isDbReady()) return;
  }
  const idValue = notification.id || uuidv4();
  const {
    project_id = null,
    user_id = null,
    title,
    body,
    type = '',
    reference_id = '',
    event_key = '',
    route = '',
    params = '{}',
    is_read = 0,
    created_at = new Date().toISOString()
  } = notification;
  if (!project_id) {
    console.log('[Notifications] blocked save without project_id');
    return;
  }

  if (event_key) {
    const existing = await execSQL(
      `SELECT id
       FROM app_notifications
       WHERE project_id = ?
         AND COALESCE(user_id, '') = COALESCE(?, '')
         AND event_key = ?
       LIMIT 1`,
      [project_id, user_id, event_key]
    );
    if ((existing.rows._array || []).length > 0) {
      return existing.rows._array[0];
    }
  }

  await execSQL(`
    INSERT OR REPLACE INTO app_notifications (id, project_id, user_id, title, body, type, reference_id, event_key, route, params, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [idValue, project_id, user_id, title, body, type, reference_id, event_key || null, route, params, is_read, created_at]);
  notifyDataChanged('notifications');
};

export const getLocalNotificationsBox = async (userId = null, projectId = null) => {
  if (!isDbReady()) {
    await waitForDbReady();
    if (!isDbReady()) return [];
  }
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
  if (!isDbReady()) {
    await waitForDbReady();
    if (!isDbReady()) return;
  }
  if (!projectId) return;
  await execSQL(`UPDATE app_notifications SET is_read = 1 WHERE id = ? AND project_id = ?`, [id, projectId]);
  notifyDataChanged('notifications');
};

export const markAllNotificationsRead = async (userId = null, projectId = null) => {
  if (!isDbReady()) {
    await waitForDbReady();
    if (!isDbReady()) return;
  }
  if (!projectId) return;
  if (userId) {
     await execSQL(`UPDATE app_notifications SET is_read = 1 WHERE project_id = ? AND (user_id = ? OR user_id IS NULL)`, [projectId, userId]);
  } else {
     await execSQL(`UPDATE app_notifications SET is_read = 1 WHERE project_id = ?`, [projectId]);
  }
  notifyDataChanged('notifications');
};
