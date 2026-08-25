import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { isOnline, setCurrentUser, hasBlockingPendingSyncForUser, runRequiredInitialSync, setInitialSyncReady, hasLocalRequiredData, syncNow } from './SyncService';
import { registerForPushNotificationsAsync } from './NotificationService';
import { AGENT_SELF_COLLECTION_APPROVAL_PERMISSION, getEffectiveUserPermissions, DEFAULT_ROLE_PERMISSIONS, resolvePermissionForRole, getActivePhase, getAllPhases, subscribeDataChanges, isDbReady, getSetting, saveSetting } from './database';
import { useLoading } from './LoadingContext';
import {
  authenticateAndLoadProjects,
  cacheSelectedSessionUser,
  getLastProjectForUser,
  loadActivePhasesForProject,
  saveLastProjectForUser,
} from './projectAccessService';
import {
  STALE_LOGIN_CACHE_MESSAGE,
  migrateLoginCacheOnce,
  recoverStaleStoredLoginSession,
  repairLoginCacheManually,
  validateStoredLoginSession,
} from './loginCacheRecoveryService';

const AuthContext = createContext(null);

export const ROLE_PERMISSIONS = {
  admin: {
    label:'مدير عام',
    canViewDashboard:true, canViewInvoices:true, canCreateInvoice:true,
    canViewCollections:true, canApproveCollection:true, canCreateCollection:true,
    canViewInventory:true, canManageInventory:true,
    canViewPOS:true, canManagePOS:true,
    canViewReports:true, canViewAdmin:true,
    canManageUsers:true, canManageSettings:true, canManageWallets:true,
    canDeleteInvoice:true,
  },
  cashier: {
    label:'محاسب / مدير صندوق',
    canViewDashboard:true, canViewInvoices:true, canCreateInvoice:false,
    canViewCollections:true, canApproveCollection:true, canCreateCollection:false,
    canViewInventory:false, canManageInventory:false,
    canViewPOS:true, canManagePOS:false,
    canViewReports:true, canViewAdmin:false,
    canManageUsers:false, canManageSettings:false, canManageWallets:true,
    canDeleteInvoice:false,
  },
  agent: {
    label:'مندوب مبيعات',
    canViewDashboard:true, canViewInvoices:true, canCreateInvoice:true,
    canViewCollections:true, canApproveCollection:false, canCreateCollection:true,
    canViewInventory:true, canManageInventory:false,
    canViewPOS:true, canManagePOS:false,
    canViewReports:false, canViewAdmin:false,
    canManageUsers:false, canManageSettings:false, canManageWallets:false,
    canDeleteInvoice:false,
  },
};

export function AuthProvider({ children }) {
  const { setLoadingProgress, hideLoading } = useLoading();
  const startupSyncRef = useRef({ blocking: false, backgroundKey: '' });
  const [user, setUser] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [project, setProject] = useState(null);
  const [pendingLogin, setPendingLogin] = useState(null);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [lastProjectId, setLastProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReadyState] = useState(false);
  const [initialSyncReady, setInitialSyncReadyState] = useState(false);
  const [initialSyncInProgress, setInitialSyncInProgressState] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const [permissions, setPermissions] = useState({});
  const [activePhase, setActivePhase] = useState(null);
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [allPhases, setAllPhases] = useState([]);
  const [cacheRecoverySuggested, setCacheRecoverySuggested] = useState(false);
  const [cacheRecoveryMessage, setCacheRecoveryMessage] = useState('');
  const selectedPhaseStorageKey = (scopeProjectId = projectId) => scopeProjectId ? `isp_selected_phase_id_${scopeProjectId}` : null;

  const reloadPermissions = async (userData) => {
    if (!userData) return;
    try {
      const perms = await getEffectiveUserPermissions(userData.id, userData.role, userData.project_id);
      setPermissions(perms);
    } catch (e) {
      setPermissions({});
    }
  };

  const selectPhase = async (phase) => {
    setSelectedPhase(phase || null);
    const key = selectedPhaseStorageKey(phase?.project_id || projectId);
    if (!key) return;
    try {
      if (phase?.id) await AsyncStorage.setItem(key, phase.id);
      else await AsyncStorage.removeItem(key);
      if (user?.id && project?.project_id) {
        await saveLastProjectForUser(user.id, project, phase?.id || null);
      }
    } catch (e) {}
  };

  const loadActivePhase = async (scopeProjectId = projectId) => {
    try {
      if (!scopeProjectId) {
        setAllPhases([]);
        setActivePhase(null);
        setSelectedPhase(null);
        return;
      }
      const phases = await getAllPhases(scopeProjectId);
      setAllPhases(phases || []);
      const active = (phases || []).find(p => p.status === 'active') || null;
      const storedPhaseId = await AsyncStorage.getItem(selectedPhaseStorageKey(scopeProjectId));
      const storedPhase = storedPhaseId ? (phases || []).find(p => String(p.id) === String(storedPhaseId)) : null;
      setActivePhase(active);
      setSelectedPhase(prev => {
        if (!prev) return storedPhase || active;
        if (prev && phases) {
          const updated = phases.find(p => p.id === prev.id);
          return updated || storedPhase || active;
        }
        return prev;
      });
    } catch (e) {}
  };

  useEffect(() => {
    if (user) {
      reloadPermissions(user);
      const unsubscribe = subscribeDataChanges((event) => {
        if (event.type === 'app_permissions' || event.type === 'all') reloadPermissions(user);
      });
      return unsubscribe;
    } else {
      setPermissions({});
    }
  }, [user?.id, user?.role, user?.project_id]);

  useEffect(() => {
    loadActivePhase(projectId);
    const unsub = subscribeDataChanges(e => {
      if (['phases', 'all'].includes(e.type)) loadActivePhase(projectId);
    });
    return unsub;
  }, [projectId]);

  useEffect(() => {
    const initApp = async () => {
      try {
        setDbReadyState(!!isDbReady());
        const migration = await migrateLoginCacheOnce();
        if (migration.recovered) {
          setCacheRecoverySuggested(true);
          setCacheRecoveryMessage(STALE_LOGIN_CACHE_MESSAGE);
        }

        const validation = await validateStoredLoginSession();
        if (validation.valid) {
          setProjectId(validation.projectId);
          setProject(validation.project);
          setUser(validation.user);
          setCurrentUser(validation.user);
        } else if (validation.stale) {
          await recoverStaleStoredLoginSession();
          setCacheRecoverySuggested(true);
          setCacheRecoveryMessage(STALE_LOGIN_CACHE_MESSAGE);
        }
      } catch (e) {
        console.log('[LoginCacheRecovery] startup_validation_failed', e?.message || e);
      }
      setLoading(false);
    };
    initApp();
  }, []);

  useEffect(() => {
    setDbReadyState(!!isDbReady());
  }, [loading]);

  const ensureStartupSync = async (isRetry = false) => {
    if (!user?.id || !user?.project_id) {
      setInitialSyncReadyState(false);
      setOfflineMode(false);
      setStartupError('');
      setInitialSyncReady(false);
      return;
    }
    if (!isDbReady()) return;
    if (startupSyncRef.current.blocking) return;

    setStartupError('');

    try {
      const projectId = user.project_id;
      const syncFlagKey = `initial_sync_completed_${projectId}`;
      const completedFlag = (await getSetting(syncFlagKey, '0')) === '1';
      const localDataReady = await hasLocalRequiredData(user.project_id);
      console.log(`[StartupConfig] project_id=${projectId} user_id=${user.id} dbReady=${isDbReady()} localDataReady=${localDataReady} initialSyncFlag=${completedFlag} online=${isOnline()}`);

      // Fast path: open immediately from SQLite on normal launches.
      if (localDataReady) {
        setInitialSyncReady(true);
        setInitialSyncReadyState(true);
        setOfflineMode(!isOnline());
        hideLoading();
        setInitialSyncInProgressState(false);
        if (!completedFlag) {
          try { await saveSetting(syncFlagKey, '1'); } catch (e) {}
        }

        if (isOnline()) {
          const bgKey = `${projectId}:${user.id}`;
          if (startupSyncRef.current.backgroundKey !== bgKey) {
            startupSyncRef.current.backgroundKey = bgKey;
            setTimeout(() => {
              syncNow(user).catch(() => {});
            }, 0);
          }
        }
        return;
      }

      // First setup path: block with one short message only.
      startupSyncRef.current.blocking = true;
      setInitialSyncInProgressState(true);
      setLoadingProgress('جاري جلب البيانات...', null);

      if (!isOnline() && !localDataReady) {
        console.log(`[InitialSync] blocked offline project_id=${projectId} reason=no_local_data`);
        throw new Error('لا يوجد اتصال بالإنترنت ولا توجد بيانات محلية كافية. يرجى الاتصال بالإنترنت لإجراء المزامنة الأولية.');
      }

      setOfflineMode(false);
      const result = await runRequiredInitialSync(user, {
        timeoutMs: 180000,
        forceRetry: isRetry,
        onProgress: (p) => setLoadingProgress(p.message || 'جاري جلب البيانات...', p.percent),
      });
      setInitialSyncReady(!!result?.ready);
      setInitialSyncReadyState(!!result?.ready);
      setOfflineMode(!!result?.offlineFallback);
      if (result?.ready) {
        try { await saveSetting(syncFlagKey, '1'); } catch (e) {}
        console.log(`[InitialSync] ready project_id=${projectId}`);
      }
      setTimeout(() => hideLoading(), 250);
    } catch (e) {
      const msg = e?.message || 'فشلت المزامنة الأولية.';
      console.log(`[InitialSync] failed project_id=${user?.project_id || ''} reason=${msg}`);
      setStartupError(msg);
      setInitialSyncReady(false);
      setInitialSyncReadyState(false);
      hideLoading();
    } finally {
      startupSyncRef.current.blocking = false;
      setInitialSyncInProgressState(false);
    }
  };

  useEffect(() => {
    ensureStartupSync();
  }, [user?.id, user?.project_id]);
  const loginWithLicense = async (licenseNumber) => {
    try {
      const { data, error } = await supabase
        .from('project')
        .select('id')
        .eq('license_number', licenseNumber)
        .single();
      
      if (error || !data) {
        return { success: false, error: 'رقم الترخيص غير صحيح أو لا يوجد اتصال بالإنترنت.' };
      }

      await AsyncStorage.setItem('isp_project_id', data.id);
      setProjectId(data.id);
      setUser(null);
      setCurrentUser(null);
      await AsyncStorage.removeItem('isp_user');
      return { success: true };
    } catch (e) {
      return { success: false, error: 'تعذر التحقق من الترخيص.' };
    }
  };

  const activateProjectSession = async (authResult, selectedProject) => {
    if (!authResult?.profile?.id || !selectedProject?.project_id) {
      return { success: false, error: 'تعذر تحديد المشروع المطلوب.' };
    }
    const allowed = (authResult.projects || []).find((item) => (
      String(item.project_id) === String(selectedProject.project_id)
      && item.active !== false
    ));
    if (!allowed) return { success: false, error: 'لم يعد هذا المشروع متاحاً لهذا المستخدم.' };

    const pendingGuard = await hasBlockingPendingSyncForUser(authResult.profile.id);
    if (pendingGuard.blocked) {
      return {
        success: false,
        error: 'توجد بيانات غير متزامنة تخص مستخدماً آخر على هذا الجهاز. قم بالمزامنة أولاً بنفس الحساب قبل تبديل المستخدم.'
      };
    }

    const phaseResult = await loadActivePhasesForProject(allowed.project_id);
    if (!phaseResult.phases?.length) {
      return { success: false, error: 'لا توجد مرحلة مفعلة لهذا المشروع.' };
    }

    await cacheSelectedSessionUser(authResult.profile, allowed);
    const savedLast = await getLastProjectForUser(authResult.profile.id);
    const initialPhase = phaseResult.phases.find((item) => String(item.id) === String(savedLast?.phase_id))
      || phaseResult.phases[0];
    const userData = {
      id: authResult.profile.id,
      legacy_project_id: authResult.profile.legacy_project_id || null,
      project_id: allowed.project_id,
      project_name: allowed.project_name,
      membership_id: allowed.membership_id || null,
      name: authResult.profile.name,
      username: authResult.profile.username,
      role: allowed.role,
      phone: authResult.profile.phone || '',
      active: true,
      selected_project: allowed,
    };

    setInitialSyncReady(false);
    setInitialSyncReadyState(false);
    setStartupError('');
    setOfflineMode(!!authResult.offline);
    await AsyncStorage.setItem('isp_project_id', allowed.project_id);
    await AsyncStorage.setItem('isp_user', JSON.stringify(userData));
    await AsyncStorage.setItem(selectedPhaseStorageKey(allowed.project_id), initialPhase.id);
    await saveLastProjectForUser(authResult.profile.id, allowed, initialPhase.id);
    setProjectId(allowed.project_id);
    setProject(allowed);
    setActivePhase(initialPhase);
    setSelectedPhase(initialPhase);
    setUser(userData);
    setCurrentUser(userData);
    setPendingLogin(null);
    setAvailableProjects([]);
    setLastProjectId(null);

    if (!authResult.offline) {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) await supabase.from('users').update({ push_token: token }).eq('id', userData.id);
      } catch (e) { console.log('Error saving push token', e); }
    }
    return { success: true, user: userData, project: allowed };
  };

  const login = async (username, password) => {
    const preLoginRecovery = await recoverStaleStoredLoginSession();
    if (preLoginRecovery.recovered) {
      setCacheRecoverySuggested(true);
      setCacheRecoveryMessage(STALE_LOGIN_CACHE_MESSAGE);
    }
    const authResult = await authenticateAndLoadProjects(username, password);
    if (!authResult.success) return authResult;
    if (!authResult.projects?.length) {
      return { success: false, error: 'لا توجد مشاريع مفعلة لهذا المستخدم' };
    }

    const last = await getLastProjectForUser(authResult.profile.id);
    const allowedLast = authResult.projects.find((item) => String(item.project_id) === String(last?.project_id));
    const pending = { ...authResult, lastProjectId: allowedLast?.project_id || null };
    setPendingLogin(pending);
    setAvailableProjects(authResult.projects);
    setLastProjectId(allowedLast?.project_id || null);
    setCacheRecoverySuggested(false);
    setCacheRecoveryMessage('');

    if (authResult.projects.length === 1) {
      return activateProjectSession(pending, authResult.projects[0]);
    }
    return {
      success: true,
      requiresProjectSelection: true,
      projects: authResult.projects,
      lastProjectId: allowedLast?.project_id || null,
    };
  };

  const selectProject = async (selectedProjectId) => {
    const selected = availableProjects.find((item) => String(item.project_id) === String(selectedProjectId));
    if (!pendingLogin || !selected) return { success: false, error: 'تعذر تحديد المشروع المطلوب.' };
    return activateProjectSession(pendingLogin, selected);
  };

  const cancelProjectSelection = () => {
    setPendingLogin(null);
    setAvailableProjects([]);
    setLastProjectId(null);
  };

  const repairLoginCache = async () => {
    const result = await repairLoginCacheManually();
    setUser(null);
    setProjectId(null);
    setProject(null);
    setPendingLogin(null);
    setAvailableProjects([]);
    setLastProjectId(null);
    setActivePhase(null);
    setSelectedPhase(null);
    setAllPhases([]);
    setCurrentUser(null);
    setInitialSyncReady(false);
    setInitialSyncReadyState(false);
    setInitialSyncInProgressState(false);
    setStartupError('');
    setOfflineMode(false);
    setCacheRecoverySuggested(false);
    setCacheRecoveryMessage('');
    return result;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('isp_user');
    await AsyncStorage.removeItem('isp_project_id');
    setUser(null);
    setProjectId(null);
    setProject(null);
    setPendingLogin(null);
    setAvailableProjects([]);
    setLastProjectId(null);
    setActivePhase(null);
    setSelectedPhase(null);
    setAllPhases([]);
    setCurrentUser(null);
    setInitialSyncReady(false);
    setInitialSyncReadyState(false);
    setInitialSyncInProgressState(false);
    setStartupError('');
    setOfflineMode(false);
  };

  const can = (permission) => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role]?.[permission] || false;
  };

  // Dynamic permission checker
  const canAccess = (screen, action = 'can_view') => {
    if (!user) return false;
    if (user.role === 'admin') return true;

    // If fully loaded from SQLite, use it:
    if (permissions && Object.keys(permissions).length > 0) {
      const resolved = resolvePermissionForRole(user.role, screen, permissions[screen]);
      return !!resolved?.[action];
    }

    // Instant fallback immediately on login to prevent UI flashing (missing tabs!)
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[user.role] || {};
    if (!defaultPerms[screen]) return false;
    return !!resolvePermissionForRole(user.role, screen, defaultPerms[screen])?.[action];
  };

  const hasEffectivePermission = (actor, permissionCode, action = 'can_view') => {
    if (!user?.id || !actor?.id || String(user.id) !== String(actor.id)) return false;
    if (actor.project_id && user.project_id && String(actor.project_id) !== String(user.project_id)) return false;
    if (
      permissionCode === AGENT_SELF_COLLECTION_APPROVAL_PERMISSION
      && String(actor.role || '').trim().toLowerCase() !== 'agent'
    ) return false;
    return canAccess(permissionCode, action);
  };

  return (
    <AuthContext.Provider value={{ user, projectId, project, loading, login, selectProject, cancelProjectSelection, availableProjects, lastProjectId, loginWithLicense, logout, repairLoginCache, cacheRecoverySuggested, cacheRecoveryMessage, can, canAccess, hasEffectivePermission, permissions, activePhase, selectedPhase, setSelectedPhase: selectPhase, allPhases, online: isOnline(), dbReady, initialSyncReady, initialSyncInProgress, startupError, offlineMode, retryInitialSync: () => ensureStartupSync(true) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
