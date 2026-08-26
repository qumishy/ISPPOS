import AsyncStorage from '@react-native-async-storage/async-storage';
import { execSQL, uuidv4 } from './dbCore';
import { supabase } from './supabase';
import { isSystemAdminRole } from './systemAdminService';

export const PROJECT_ACCESS_CACHE_PREFIX = 'project_access_for_user_';
export const LAST_PROJECT_PREFIX = 'last_project_for_user_';

const isTrue = (value) => value === true || value === 1 || value === '1' || value === 'true';
const isMissingRpcError = (error) => /PGRST202|authenticate_user_projects|schema cache|function/i.test(String(error?.message || error || ''));
const isNetworkError = (error) => /network|fetch|internet|offline|timeout/i.test(String(error?.message || error || ''));

const logLoginDiagnostic = (event, details = {}) => {
  const safeDetails = {
    user_found: details.userFound === true,
    membership_count: Number(details.membershipCount || 0),
    project_count: Number(details.projectCount || 0),
    source: details.source || 'unknown',
  };
  if (details.errorCode) safeDetails.error_code = String(details.errorCode);
  if (details.errorMessage) safeDetails.error_message = String(details.errorMessage).slice(0, 180);
  console.log(`[MultiProjectLogin] ${event}`, safeDetails);
};

export const normalizeLoginUsername = (username) => String(username || '').trim();

export const projectAccessStorageKey = (userId) => `${PROJECT_ACCESS_CACHE_PREFIX}${userId}`;
export const lastProjectStorageKey = (userId) => `${LAST_PROJECT_PREFIX}${userId}`;

const normalizeProject = (row) => ({
  membership_id: row.membership_id || row.access_id || null,
  project_id: row.project_id || row.id,
  project_name: row.project_name || row.name || 'مشروع بدون اسم',
  license_number: row.license_number || '',
  role: row.role,
  active: row.project_active === undefined ? ![false, 0, '0', 'false'].includes(row.active) : isTrue(row.project_active),
});

const buildAuthResult = (rows, password) => {
  const first = rows?.[0];
  if (!first) return null;
  const profile = {
    id: first.user_id || first.id,
    legacy_project_id: first.legacy_project_id || first.project_id || null,
    name: first.user_name || first.name,
    username: first.username,
    phone: first.phone || '',
    global_role: first.global_role || null,
    password_hash: password,
  };
  const seen = new Set();
  const projects = rows
    .map(normalizeProject)
    .filter((project) => project.project_id && project.active && project.role)
    .filter((project) => {
      if (seen.has(String(project.project_id))) return false;
      seen.add(String(project.project_id));
      return true;
    });
  return { profile, projects };
};

const saveCredentialAndAccessCache = async ({ profile, projects }) => {
  // SYSTEM_ADMIN credentials stay in memory only: the persisted cache entry
  // carries an empty password and cannot be used for offline admin login.
  const persistPassword = !isSystemAdminRole(profile.global_role);
  const safeProfile = persistPassword ? profile : { ...profile, password_hash: '' };
  const cacheEntry = { ...safeProfile, projects, cached_at: new Date().toISOString() };
  await AsyncStorage.setItem(projectAccessStorageKey(profile.id), JSON.stringify(cacheEntry));

  const existingRaw = await AsyncStorage.getItem('isp_user_cache');
  let existing = [];
  try { existing = existingRaw ? JSON.parse(existingRaw) : []; } catch (error) { existing = []; }
  if (!Array.isArray(existing)) existing = [];
  const index = existing.findIndex((item) => String(item.id) === String(profile.id));
  if (index >= 0) existing[index] = cacheEntry;
  else existing.push(cacheEntry);
  await AsyncStorage.setItem('isp_user_cache', JSON.stringify(existing));
};

const cacheAccessLocally = async ({ profile, projects }) => {
  const now = new Date().toISOString();
  await execSQL(
    `UPDATE user_project_access SET active = 0, updated_at = ?, synced = 1 WHERE user_id = ?`,
    [now, profile.id]
  );
  for (const project of projects) {
    await execSQL(
      `UPDATE project SET name = ?, license_number = ?, active = 1, synced = 1 WHERE id = ?`,
      [project.project_name, project.license_number, project.project_id]
    );
    await execSQL(
      `INSERT OR IGNORE INTO project (id, name, license_number, active, created_at, synced)
       VALUES (?, ?, ?, 1, ?, 1)`,
      [project.project_id, project.project_name, project.license_number, now]
    );
    const existingAccess = await execSQL(
      `SELECT id FROM user_project_access WHERE user_id = ? AND project_id = ? LIMIT 1`,
      [profile.id, project.project_id]
    );
    const existingAccessId = existingAccess.rows._array?.[0]?.id;
    if (existingAccessId) {
      await execSQL(
        `UPDATE user_project_access
         SET role = ?, active = 1, updated_at = ?, synced = 1
         WHERE id = ?`,
        [project.role, now, existingAccessId]
      );
      continue;
    }
    await execSQL(
      `INSERT INTO user_project_access
       (id, user_id, project_id, role, active, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, 1, ?, ?, 1)`,
      [
        project.membership_id || uuidv4(),
        profile.id,
        project.project_id,
        project.role,
        now,
        now,
      ]
    );
  }
};

const authenticateThroughRpc = async (username, password) => {
  const { data, error } = await supabase.rpc('authenticate_user_projects', {
    p_username: username,
    p_password: password,
  });
  if (error) {
    logLoginDiagnostic('rpc_error', {
      source: 'rpc',
      errorCode: error.code,
      errorMessage: error.message,
    });
    throw error;
  }
  const result = buildAuthResult(data || [], password);
  logLoginDiagnostic('rpc_result', {
    source: 'rpc',
    userFound: !!result,
    membershipCount: (data || []).filter((row) => row.membership_id).length,
    projectCount: result?.projects?.length || 0,
  });
  return result;
};

const authenticateThroughLegacyTables = async (username, password) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id,project_id,name,username,role,phone,password_hash,is_active')
    .eq('username', username)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!user || user.password_hash !== password) return null;

  const { data: project, error: projectError } = await supabase
    .from('project')
    .select('id,name,license_number')
    .eq('id', user.project_id)
    .maybeSingle();
  if (projectError) throw projectError;

  const result = buildAuthResult([{
    ...user,
    user_id: user.id,
    user_name: user.name,
    legacy_project_id: user.project_id,
    membership_id: null,
    project_id: project?.id || null,
    project_name: project?.name,
    license_number: project?.license_number,
    project_active: !!project,
  }], password);
  logLoginDiagnostic('legacy_result', {
    source: 'legacy_tables',
    userFound: !!result,
    membershipCount: result?.projects?.length || 0,
    projectCount: result?.projects?.length || 0,
  });
  return result;
};

const diagnoseRejectedCredentials = async (username, password) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id,password_hash,is_active')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  if (!user) return { success: false, code: 'USER_NOT_FOUND', error: 'المستخدم غير موجود.' };
  if (!isTrue(user.is_active)) return { success: false, code: 'INACTIVE_USER', error: 'هذا المستخدم غير مفعل.' };
  if (user.password_hash !== password) {
    return { success: false, code: 'WRONG_PASSWORD', error: 'كلمة المرور غير صحيحة.' };
  }
  return { success: false, code: 'NO_ACTIVE_PROJECTS', error: 'لا توجد مشاريع مفعلة لهذا المستخدم' };
};

const authenticateFromCache = async (username, password) => {
  let cachedUsers = [];
  try {
    const raw = await AsyncStorage.getItem('isp_user_cache');
    cachedUsers = raw ? JSON.parse(raw) : [];
  } catch (error) {
    return null;
  }
  if (!Array.isArray(cachedUsers)) return null;
  const cached = cachedUsers.find((item) => item.username === username && item.password_hash === password);
  if (!cached) return null;

  let access = cached;
  try {
    const perUserRaw = await AsyncStorage.getItem(projectAccessStorageKey(cached.id));
    if (perUserRaw) access = JSON.parse(perUserRaw);
  } catch (error) {}

  const projects = (access.projects || []).map(normalizeProject).filter((project) => project.project_id && project.active && project.role);
  return {
    profile: {
      id: access.id,
      legacy_project_id: access.legacy_project_id || access.project_id || null,
      name: access.name,
      username: access.username,
      phone: access.phone || '',
      global_role: access.global_role || null,
      password_hash: password,
    },
    projects,
    offline: true,
  };
};

export const authenticateAndLoadProjects = async (usernameValue, password) => {
  const username = normalizeLoginUsername(usernameValue);
  try {
    let result;
    try {
      result = await authenticateThroughRpc(username, password);
    } catch (error) {
      if (!isMissingRpcError(error)) throw error;
      result = await authenticateThroughLegacyTables(username, password);
    }

    if (!result) return await diagnoseRejectedCredentials(username, password);
    await saveCredentialAndAccessCache(result);
    await cacheAccessLocally(result);
    return { success: true, ...result, offline: false };
  } catch (error) {
    if (!isNetworkError(error)) {
      return {
        success: false,
        code: 'PROJECTS_LOAD_FAILED',
        error: 'تعذر تحميل مشاريع هذا المستخدم. تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.',
      };
    }
    const cached = await authenticateFromCache(username, password);
    logLoginDiagnostic('cache_result', {
      source: 'offline_cache',
      userFound: !!cached,
      membershipCount: cached?.projects?.length || 0,
      projectCount: cached?.projects?.length || 0,
    });
    if (!cached) return { success: false, code: 'OFFLINE_CACHE_MISS', error: 'لا إنترنت — سجّل دخولك مرة واحدة بالإنترنت أولاً' };
    if (!cached.projects.length) {
      return { success: false, code: 'OFFLINE_PROJECTS_MISSING', error: 'لا يمكن تحميل مشاريع هذا المستخدم حالياً. اتصل بالإنترنت مرة واحدة لتحديث الصلاحيات.' };
    }
    return { success: true, ...cached };
  }
};

/**
 * Offline-safe session access for the signed-in user, read from the
 * per-user login cache (populated on every successful online login).
 * Returns { profile, projects } or null when nothing is cached.
 */
export const getCachedSessionAccessForUser = async (userId) => {
  if (!userId) return null;
  let access = null;
  try {
    const perUserRaw = await AsyncStorage.getItem(projectAccessStorageKey(userId));
    if (perUserRaw) access = JSON.parse(perUserRaw);
  } catch (error) {
    access = null;
  }
  if (!access) {
    try {
      const raw = await AsyncStorage.getItem('isp_user_cache');
      const list = raw ? JSON.parse(raw) : [];
      access = Array.isArray(list)
        ? list.find((item) => String(item.id) === String(userId)) || null
        : null;
    } catch (error) {
      return null;
    }
  }
  if (!access) return null;

  const projects = (access.projects || [])
    .map(normalizeProject)
    .filter((project) => project.project_id && project.active && project.role);

  return {
    profile: {
      id: access.id,
      legacy_project_id: access.legacy_project_id || access.project_id || null,
      name: access.name,
      username: access.username,
      phone: access.phone || '',
      global_role: access.global_role || null,
      password_hash: access.password_hash || '',
    },
    projects,
  };
};

export const getLastProjectForUser = async (userId) => {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(lastProjectStorageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

export const saveLastProjectForUser = async (userId, project, phaseId = null) => {
  if (!userId || !project?.project_id) return;
  await AsyncStorage.setItem(lastProjectStorageKey(userId), JSON.stringify({
    project_id: project.project_id,
    project_name: project.project_name,
    phase_id: phaseId || null,
    timestamp: new Date().toISOString(),
  }));
};

export const cacheSelectedSessionUser = async (profile, project, options = {}) => {
  const persistPassword = options.persistPassword !== false;
  const storedPassword = persistPassword ? profile.password_hash : '';
  const now = new Date().toISOString();
  const existing = await execSQL(`SELECT id FROM users WHERE id = ? LIMIT 1`, [profile.id]);
  if (existing.rows._array?.[0]?.id) {
    await execSQL(
      `UPDATE users
       SET project_id = ?, name = ?, username = ?, role = ?, phone = ?, password_hash = ?, active = 1, synced = 1
       WHERE id = ?`,
      [
        project.project_id,
        profile.name,
        profile.username,
        project.role,
        profile.phone || '',
        storedPassword,
        profile.id,
      ]
    );
    return;
  }
  await execSQL(
    `INSERT INTO users
     (id, project_id, name, username, role, phone, password_hash, active, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`,
    [
      profile.id,
      project.project_id,
      profile.name,
      profile.username,
      project.role,
      profile.phone || '',
      storedPassword,
      now,
    ]
  );
};

const readCachedActivePhases = async (projectId) => {
  const result = await execSQL(
    `SELECT * FROM phases WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC`,
    [projectId]
  );
  return result.rows._array || [];
};

export const loadActivePhasesForProject = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('phases')
      .select('id,project_id,name,description,start_date,end_date,target_new_pos,expected_total_sales,expected_total_collections,status,created_by,created_at,closed_at')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (error) throw error;

    for (const phase of data || []) {
      const columns = Object.keys(phase);
      const placeholders = columns.map(() => '?').join(',');
      await execSQL(
        `INSERT OR REPLACE INTO phases (${columns.join(',')}, synced) VALUES (${placeholders}, 1)`,
        columns.map((column) => phase[column])
      );
    }
    return { phases: data || [], source: 'remote' };
  } catch (error) {
    const phases = await readCachedActivePhases(projectId);
    return { phases, source: 'cache', error };
  }
};
