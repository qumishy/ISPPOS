import AsyncStorage from '@react-native-async-storage/async-storage';
import { execSQL } from './dbCore';

export const LOGIN_CACHE_MIGRATION_MARKER = 'multi_project_login_cache_migrated_v1';
export const STALE_LOGIN_CACHE_MESSAGE = 'توجد بيانات دخول قديمة على هذا الجهاز. اضغط إصلاح بيانات الدخول ثم حاول مرة أخرى.';

const SESSION_KEY = 'isp_user';
const PROJECT_KEY = 'isp_project_id';
const USER_CACHE_KEY = 'isp_user_cache';
const PHASE_KEY_PREFIX = 'isp_selected_phase_id_';
const PROJECT_ACCESS_PREFIX = 'project_access_for_user_';
const LAST_PROJECT_PREFIX = 'last_project_for_user_';
const LEGACY_SELECTION_KEYS = [
  'isp_selected_phase_id',
  'isp_selected_project_id',
  'selected_project_id',
  'isp_license',
  'isp_license_number',
];

const isActive = (value) => ![false, 0, '0', 'false'].includes(value);

const parseObject = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
};

const uniqueStrings = (values) => [...new Set(values.filter(Boolean).map(String))];

const readLocalProject = async (projectId) => {
  if (!projectId) return null;
  try {
    const result = await execSQL(`SELECT id, active FROM project WHERE id = ? LIMIT 1`, [projectId]);
    return result.rows._array?.[0] || null;
  } catch (error) {
    return undefined;
  }
};

export const validateStoredLoginSession = async () => {
  const [storedUserRaw, globalProjectId] = await Promise.all([
    AsyncStorage.getItem(SESSION_KEY),
    AsyncStorage.getItem(PROJECT_KEY),
  ]);

  if (!storedUserRaw) {
    return {
      valid: false,
      stale: !!globalProjectId,
      reason: globalProjectId ? 'orphan_project_context' : 'no_session',
      projectIds: uniqueStrings([globalProjectId]),
    };
  }

  const storedUser = parseObject(storedUserRaw);
  if (!storedUser?.id) {
    return {
      valid: false,
      stale: true,
      reason: 'invalid_session_json',
      projectIds: uniqueStrings([globalProjectId]),
    };
  }

  // Top-level system administration runs without a project context; the
  // normal project-membership validation below does not apply to it.
  const storedGlobalRole = String(storedUser.global_role || storedUser.role || '').trim().toUpperCase();
  if (storedGlobalRole === 'SYSTEM_ADMIN' && !storedUser.project_id) {
    return {
      valid: true,
      stale: false,
      user: storedUser,
      project: null,
      projectId: null,
    };
  }

  const sessionProjectId = storedUser.project_id || null;
  const selectedProjectId = globalProjectId || sessionProjectId;
  const embeddedProjectId = storedUser.selected_project?.project_id || null;
  const projectIds = uniqueStrings([globalProjectId, sessionProjectId, embeddedProjectId]);

  if (!globalProjectId || !sessionProjectId || !selectedProjectId) {
    return { valid: false, stale: true, reason: 'missing_project_context', userId: storedUser.id, projectIds };
  }
  if (globalProjectId && sessionProjectId && String(globalProjectId) !== String(sessionProjectId)) {
    return { valid: false, stale: true, reason: 'project_context_mismatch', userId: storedUser.id, projectIds };
  }
  if (embeddedProjectId && String(embeddedProjectId) !== String(selectedProjectId)) {
    return { valid: false, stale: true, reason: 'embedded_project_mismatch', userId: storedUser.id, projectIds };
  }

  const accessKey = `${PROJECT_ACCESS_PREFIX}${storedUser.id}`;
  const accessRaw = await AsyncStorage.getItem(accessKey);
  if (!accessRaw) {
    return {
      valid: false,
      stale: true,
      reason: 'legacy_session_without_membership_cache',
      userId: storedUser.id,
      projectIds,
    };
  }

  const access = parseObject(accessRaw);
  if (!Array.isArray(access?.projects)) {
    return {
      valid: false,
      stale: true,
      reason: 'invalid_membership_cache',
      userId: storedUser.id,
      projectIds,
      corruptAccessKey: accessKey,
    };
  }

  const allowedProject = access.projects.find((item) => (
    String(item.project_id) === String(selectedProjectId)
    && isActive(item.active)
    && item.role
  ));
  if (!allowedProject) {
    return {
      valid: false,
      stale: true,
      reason: 'cached_project_not_allowed',
      userId: storedUser.id,
      projectIds,
    };
  }

  const localProject = await readLocalProject(selectedProjectId);
  if (localProject === null || (localProject && !isActive(localProject.active))) {
    return {
      valid: false,
      stale: true,
      reason: localProject ? 'cached_project_inactive_locally' : 'cached_project_missing_locally',
      userId: storedUser.id,
      projectIds,
    };
  }

  return {
    valid: true,
    stale: false,
    user: {
      ...storedUser,
      project_id: allowedProject.project_id,
      project_name: allowedProject.project_name,
      role: allowedProject.role,
      membership_id: allowedProject.membership_id || null,
      selected_project: allowedProject,
    },
    project: allowedProject,
    projectId: allowedProject.project_id,
  };
};

export const clearLoginRecoveryCache = async ({
  mode = 'automatic',
  corruptAccessKey = null,
} = {}) => {
  const allKeys = await AsyncStorage.getAllKeys();
  const keysToRemove = new Set([SESSION_KEY, PROJECT_KEY, ...LEGACY_SELECTION_KEYS]);

  allKeys.forEach((key) => {
    if (mode === 'manual') {
      if (
        key === USER_CACHE_KEY
        || key.startsWith(PHASE_KEY_PREFIX)
        || key.startsWith(PROJECT_ACCESS_PREFIX)
        || key.startsWith(LAST_PROJECT_PREFIX)
      ) keysToRemove.add(key);
      return;
    }

    if (key.startsWith(PHASE_KEY_PREFIX)) {
      keysToRemove.add(key);
    }
  });

  if (corruptAccessKey) keysToRemove.add(corruptAccessKey);
  const existingKeys = [...keysToRemove].filter((key) => allKeys.includes(key));
  if (existingKeys.length) await AsyncStorage.multiRemove(existingKeys);
  await AsyncStorage.setItem(LOGIN_CACHE_MIGRATION_MARKER, '1');

  console.log('[LoginCacheRecovery] cache_cleared', {
    mode,
    keys: existingKeys,
    sqlite_touched: false,
  });
  return { success: true, clearedKeys: existingKeys };
};

export const migrateLoginCacheOnce = async () => {
  const migrated = await AsyncStorage.getItem(LOGIN_CACHE_MIGRATION_MARKER);
  if (migrated === '1') return { checked: false, recovered: false, reason: 'already_migrated' };

  const validation = await validateStoredLoginSession();
  if (validation.stale) {
    const cleared = await clearLoginRecoveryCache({
      mode: 'automatic',
      corruptAccessKey: validation.corruptAccessKey,
    });
    return { checked: true, recovered: true, reason: validation.reason, ...cleared };
  }

  await AsyncStorage.setItem(LOGIN_CACHE_MIGRATION_MARKER, '1');
  return { checked: true, recovered: false, reason: validation.reason };
};

export const recoverStaleStoredLoginSession = async () => {
  const validation = await validateStoredLoginSession();
  if (!validation.stale) return { recovered: false, validation };
  const cleared = await clearLoginRecoveryCache({
    mode: 'automatic',
    corruptAccessKey: validation.corruptAccessKey,
  });
  return { recovered: true, reason: validation.reason, validation, ...cleared };
};

export const repairLoginCacheManually = async () => clearLoginRecoveryCache({ mode: 'manual' });
