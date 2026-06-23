import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { isOnline, setCurrentUser, hasBlockingPendingSyncForUser, runRequiredInitialSync, setInitialSyncReady, hasLocalRequiredData, syncNow } from './SyncService';
import { registerForPushNotificationsAsync } from './NotificationService';
import { getEffectiveUserPermissions, DEFAULT_ROLE_PERMISSIONS, getActivePhase, getAllPhases, subscribeDataChanges, isDbReady, getSetting, saveSetting } from './database';
import { useLoading } from './LoadingContext';

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

  const reloadPermissions = async (userData) => {
    if (!userData) return;
    try {
      const perms = await getEffectiveUserPermissions(userData.id, userData.role);
      setPermissions(perms);
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
      setActivePhase(active);
      setSelectedPhase(prev => {
        if (!prev && active) return active;
        if (prev && phases) {
          const updated = phases.find(p => p.id === prev.id);
          return updated || active;
        }
        return prev;
      });
    } catch (e) {}
  };

  useEffect(() => {
    if (user) {
      reloadPermissions(user);
    } else {
      setPermissions({});
    }
  }, [user]);

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
        const storedProjectId = await AsyncStorage.getItem('isp_project_id');
        if (storedProjectId) {
          setProjectId(storedProjectId);
        }

        const storedUser = await AsyncStorage.getItem('isp_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          // Only auto-login if they belong to the current project
          if (storedProjectId && parsed.project_id === storedProjectId) {
             setUser(parsed);
             setCurrentUser(parsed);
          }
        }
      } catch (e) {}
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

  const saveUserSession = async (data) => {
    try {
      const cached = await AsyncStorage.getItem('isp_user_cache');
      const users = cached ? JSON.parse(cached) : [];
      const idx = users.findIndex(u => String(u.id) === String(data.id));
      if (idx >= 0) users[idx] = data; else users.push(data);
      await AsyncStorage.setItem('isp_user_cache', JSON.stringify(users));
    } catch (e) {}

    const userData = {
      id: data.id,
      project_id: data.project_id || projectId,
      name: data.name,
      username: data.username,
      role: data.role,
      phone: data.phone
    };

    await AsyncStorage.setItem('isp_user', JSON.stringify(userData));
    setUser(userData);
    setCurrentUser(userData);
    return { success: true };
  };

  const loginFromCache = async (username, password) => {
    try {
      const cached = await AsyncStorage.getItem('isp_user_cache');
      if (cached) {
        const users = JSON.parse(cached);
        const u = users.find(x => x.username === username && x.password_hash === password && x.project_id === projectId);
        if (u) {
          const pendingGuard = await hasBlockingPendingSyncForUser(u.id);
          if (pendingGuard.blocked) {
            return {
              success: false,
              error: 'توجد بيانات غير متزامنة تخص مستخدماً آخر على هذا الجهاز. قم بالمزامنة أولاً بنفس الحساب قبل تبديل المستخدم.'
            };
          }
          return await saveUserSession(u);
        }
      }
    } catch (e) {}
    return { success:false, error:'لا إنترنت — سجّل دخولك مرة واحدة بالإنترنت أولاً' };
  };

  const login = async (username, password) => {
    // 1) جرّب Supabase أولًا دائمًا
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('is_active', true)
        .eq('project_id', projectId)
        .single();

      if (!error && data) {
        if (data.password_hash !== password) {
          return { success:false, error:'كلمة المرور غير صحيحة' };
        }

        const pendingGuard = await hasBlockingPendingSyncForUser(data.id);
        if (pendingGuard.blocked) {
          return {
            success: false,
            error: 'توجد بيانات غير متزامنة تخص مستخدماً آخر على هذا الجهاز. قم بالمزامنة أولاً بنفس الحساب قبل تبديل المستخدم.'
          };
        }
        
        // جلب Expo Push Token وتحديثه في قاعدة البيانات
        try {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            await supabase.from('users').update({ push_token: token }).eq('id', data.id);
          }
        } catch(e) { console.log('Error saving push token', e); }

        return await saveUserSession(data);
      }

      // إذا رجع من Supabase بدون بيانات نكمل للكاش أو نرجع اسم المستخدم غير موجود
      if (error && !/network|fetch|internet|offline/i.test(error.message || '')) {
        return { success:false, error:'اسم المستخدم غير موجود' };
      }
    } catch (e) {
      // نكمل إلى الكاش
    }

    // 2) fallback للكاش المحلي
    return await loginFromCache(username, password);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('isp_user');
    setUser(null);
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
    if (!user || user.role === 'admin') return true; 

    // If fully loaded from SQLite, use it:
    if (permissions && Object.keys(permissions).length > 0) {
      if (!permissions[screen]) return false;
      return permissions[screen][action];
    }

    // Instant fallback immediately on login to prevent UI flashing (missing tabs!)
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[user.role] || {};
    if (!defaultPerms[screen]) return false;
    return defaultPerms[screen][action];
  };

  return (
    <AuthContext.Provider value={{ user, projectId, loading, login, loginWithLicense, logout, can, canAccess, permissions, activePhase, selectedPhase, setSelectedPhase, allPhases, online: isOnline(), dbReady, initialSyncReady, initialSyncInProgress, startupError, offlineMode, retryInitialSync: () => ensureStartupSync(true) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
