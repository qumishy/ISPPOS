import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { execSQL, notifyDataChanged } from './dbCore';

export const SYSTEM_ADMIN_ROLE = 'SYSTEM_ADMIN';
export const SYSTEM_ADMIN_OFFLINE_MESSAGE = 'هذه العملية تتطلب اتصالاً بالإنترنت.';
const SESSION_EXPIRED_MESSAGE = 'انتهت جلسة إدارة النظام. يرجى تسجيل الدخول مرة أخرى.';
const RPC_MISSING_MESSAGE = 'العملية غير متاحة بعد. تأكد من تطبيق تحديثات السيرفر ثم أعد المحاولة.';
const REMOTE_FAILED_MESSAGE = 'فشل تنفيذ العملية على السيرفر. حاول مرة أخرى.';

// Actor credentials are kept in this module variable ONLY (memory of the
// current app session). They are never written to AsyncStorage, SQLite,
// or any cache, and never logged.
let _actorCredentials = null;

export const isSystemAdminRole = (role) =>
  String(role || '').trim().toUpperCase() === SYSTEM_ADMIN_ROLE;

export const isSystemAdminUser = (user) =>
  isSystemAdminRole(user?.global_role) || isSystemAdminRole(user?.role);

export const setSystemAdminActorCredentials = (username, password) => {
  _actorCredentials = {
    username: String(username || ''),
    password: String(password || ''),
  };
};

export const clearSystemAdminActorCredentials = () => {
  _actorCredentials = null;
};

export const hasSystemAdminActorCredentials = () => !!(_actorCredentials && _actorCredentials.password);

const taggedError = (message, code, cause = null) => {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
};

const withTimeout = (promise, timeoutMs = 12000) => Promise.race([
  Promise.resolve(promise),
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
]);

const requireActorParams = () => {
  if (!_actorCredentials || !_actorCredentials.password) {
    throw taggedError(SESSION_EXPIRED_MESSAGE, 'SYSTEM_ADMIN_SESSION_EXPIRED');
  }
  return {
    p_actor_username: _actorCredentials.username,
    p_actor_password: _actorCredentials.password,
  };
};

const mapRpcError = (error) => {
  const raw = String(error?.message || '');
  if (/PGRST202|Could not find the function|schema cache/i.test(raw)) {
    return taggedError(RPC_MISSING_MESSAGE, 'SYSTEM_ADMIN_RPC_MISSING', error);
  }
  if (/network|fetch|Failed to fetch|timeout/i.test(raw)) {
    return taggedError(SYSTEM_ADMIN_OFFLINE_MESSAGE, 'SYSTEM_ADMIN_OFFLINE', error);
  }
  const clean = raw.trim();
  if (!clean) return taggedError(REMOTE_FAILED_MESSAGE, 'SYSTEM_ADMIN_RPC_FAILED', error);
  // Server-side raises already carry friendly Arabic messages.
  return taggedError(clean.slice(0, 300), 'SYSTEM_ADMIN_RPC_FAILED', error);
};

export const ensureOnlineForSystemAdmin = async () => {
  let networkState;
  try {
    networkState = await NetInfo.fetch();
  } catch (error) {
    throw taggedError(SYSTEM_ADMIN_OFFLINE_MESSAGE, 'SYSTEM_ADMIN_OFFLINE', error);
  }
  if (!networkState?.isConnected || networkState.isInternetReachable === false) {
    throw taggedError(SYSTEM_ADMIN_OFFLINE_MESSAGE, 'SYSTEM_ADMIN_OFFLINE');
  }
  try {
    const { error } = await withTimeout(supabase.from('project').select('id').limit(1));
    if (error) throw error;
  } catch (error) {
    throw taggedError(SYSTEM_ADMIN_OFFLINE_MESSAGE, 'SYSTEM_ADMIN_OFFLINE', error);
  }
  return true;
};

const callSystemRpc = async (fnName, params = {}) => {
  await ensureOnlineForSystemAdmin();
  const actorParams = requireActorParams();
  let data;
  try {
    const result = await withTimeout(supabase.rpc(fnName, { ...params, ...actorParams }));
    if (result.error) throw mapRpcError(result.error);
    data = result.data;
  } catch (error) {
    if (error?.code && String(error.code).startsWith('SYSTEM_ADMIN_')) throw error;
    throw mapRpcError(error);
  }
  return data;
};

const toIntActive = (value) => (value === false || value === 0 || value === '0' || value === 'false' ? 0 : 1);

// ── Local mirror refresh (SQLite caches stay consistent; sync_queue and
//    business records are never touched) ─────────────────────────────────

const mirrorProjects = async (rows) => {
  for (const row of rows || []) {
    await execSQL(
      `INSERT OR REPLACE INTO project (id, name, license_number, owner_name, owner_phone, active, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), 1)`,
      [
        row.id,
        row.name || '',
        row.license_number || '',
        row.owner_name || '',
        row.owner_phone || '',
        toIntActive(row.active),
        row.created_at || null,
      ]
    );
  }
  notifyDataChanged('project');
};

const mirrorUsers = async (rows) => {
  for (const row of rows || []) {
    const existing = await execSQL(`SELECT id FROM users WHERE id = ? LIMIT 1`, [row.id]);
    if (existing.rows._array?.length) {
      await execSQL(
        `UPDATE users SET name = ?, username = ?, role = ?, phone = ?, active = ?, synced = 1 WHERE id = ?`,
        [row.name || '', row.username || '', row.role || 'agent', row.phone || '', toIntActive(row.is_active), row.id]
      );
    } else {
      await execSQL(
        `INSERT INTO users (id, project_id, name, username, role, phone, password_hash, active, created_at, synced)
         VALUES (?, NULL, ?, ?, ?, ?, '', ?, ?, 1)`,
        [row.id, row.name || '', row.username || '', row.role || 'agent', row.phone || '', toIntActive(row.is_active), row.created_at || new Date().toISOString()]
      );
    }
  }
  notifyDataChanged('users');
};

const mirrorPhases = async (rows) => {
  for (const row of rows || []) {
    await execSQL(
      `INSERT OR REPLACE INTO phases
        (id, project_id, name, description, start_date, end_date,
         target_new_pos, expected_total_sales, expected_total_collections,
         status, created_by, created_at, closed_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), COALESCE(?, 0), ?, ?, ?, ?, 1)`,
      [
        row.id,
        row.project_id,
        row.name || '',
        row.description || '',
        row.start_date || null,
        row.end_date || null,
        Number(row.target_new_pos ?? 0),
        Number(row.expected_total_sales ?? 0),
        Number(row.expected_total_collections ?? 0),
        row.status || 'active',
        row.created_by || null,
        row.created_at || new Date().toISOString(),
        row.closed_at || null,
      ]
    );
  }
  notifyDataChanged('phases');
};

const mirrorMemberships = async (rows) => {
  for (const row of rows || []) {
    await execSQL(
      `INSERT OR REPLACE INTO user_project_access
        (id, user_id, project_id, role, active, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        row.id,
        row.user_id,
        row.project_id,
        row.role,
        toIntActive(row.active),
        row.created_at || new Date().toISOString(),
        row.updated_at || new Date().toISOString(),
      ]
    );
  }
  notifyDataChanged('users');
};

// ── Reads ────────────────────────────────────────────────────────────────

export const fetchSystemProjects = async () => {
  const rows = await callSystemRpc('list_system_projects');
  await mirrorProjects(rows);
  return rows || [];
};

export const fetchSystemUsers = async () => {
  const rows = await callSystemRpc('list_system_users');
  await mirrorUsers(rows);
  return rows || [];
};

export const fetchSystemPhases = async (projectId) => {
  if (!projectId) return [];
  const rows = await callSystemRpc('list_system_phases', { p_project_id: projectId });
  await mirrorPhases(rows);
  return rows || [];
};

export const fetchSystemMemberships = async (projectId) => {
  if (!projectId) return [];
  const rows = await callSystemRpc('list_system_memberships', { p_project_id: projectId });
  await mirrorMemberships(rows);
  return rows || [];
};

// Projects the current actor may manage memberships for: all active
// projects for SYSTEM_ADMIN, otherwise projects with an active admin
// membership for the signed-in project admin.
export const fetchManagedProjects = async () => {
  const rows = await callSystemRpc('list_managed_projects');
  return rows || [];
};

export const fetchProjectMemberships = async (projectId) => {
  if (!projectId) return [];
  const rows = await callSystemRpc('list_project_memberships', { p_project_id: projectId });
  await mirrorMemberships(rows);
  return rows || [];
};

// ── Mutations (each re-fetches its list so local mirrors converge) ───────

export const createSystemProject = async ({ name, license_number, notes }) => {
  const row = await callSystemRpc('create_system_project', {
    p_name: name,
    p_license_number: license_number || null,
    p_notes: notes || null,
  });
  await fetchSystemProjects();
  return row;
};

export const updateSystemProject = async ({ id, name, license_number, notes, active }) => {
  const row = await callSystemRpc('update_system_project', {
    p_project_id: id,
    p_name: name,
    p_license_number: license_number || null,
    p_notes: notes || null,
    p_active: active !== false,
  });
  await fetchSystemProjects();
  return row;
};

export const createSystemPhase = async ({ project_id, name, start_date, end_date, description, status }) => {
  const row = await callSystemRpc('create_system_phase', {
    p_project_id: project_id,
    p_name: name,
    p_start_date: start_date || null,
    p_end_date: end_date || null,
    p_description: description || '',
    p_status: status || 'active',
  });
  await fetchSystemPhases(project_id);
  return row;
};

export const updateSystemPhase = async ({ id, project_id, name, start_date, end_date, description, status }) => {
  const row = await callSystemRpc('update_system_phase', {
    p_phase_id: id,
    p_name: name,
    p_start_date: start_date || null,
    p_end_date: end_date || null,
    p_description: description || '',
    p_status: status || 'active',
  });
  await fetchSystemPhases(project_id);
  return row;
};

export const createSystemUser = async ({ name, username, password, phone, role }) => {
  const row = await callSystemRpc('create_system_user', {
    p_name: name,
    p_username: username,
    p_password: password,
    p_phone: phone || '',
    p_role: role || 'agent',
  });
  await fetchSystemUsers();
  return row;
};

export const updateSystemUser = async ({ id, name, phone, is_active, new_password }) => {
  const row = await callSystemRpc('update_system_user', {
    p_user_id: id,
    p_name: name,
    p_phone: phone || '',
    p_is_active: is_active !== false,
    p_new_password: new_password || null,
  });
  await fetchSystemUsers();
  return row;
};

export const linkUserToProject = async ({ user_id, username, project_id, role, active = true }) => {
  const normalizedRole = String(role || '').trim();
  if (!['admin', 'cashier', 'agent'].includes(normalizedRole)) {
    throw taggedError('الدور المحدد غير مدعوم.', 'MEMBERSHIP_ROLE_NOT_ALLOWED');
  }
  const row = await callSystemRpc('upsert_user_project_access', {
    p_user_id: user_id || null,
    p_username: username ? String(username).trim() : null,
    p_project_id: project_id,
    p_role: normalizedRole,
    p_active: active !== false,
  });
  await fetchProjectMemberships(project_id);
  return row;
};

export const deactivateUserProjectAccess = async ({ membership_id, project_id }) => {
  const row = await callSystemRpc('deactivate_user_project_access', { p_membership_id: membership_id });
  if (project_id) {
    await fetchProjectMemberships(project_id);
  }
  return row;
};
