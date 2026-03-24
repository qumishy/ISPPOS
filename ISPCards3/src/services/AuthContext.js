import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { isOnline } from './SyncService';

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
    canViewInventory:true, canManageInventory:false,
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('isp_user').then(stored => {
      if (stored) {
        try { setUser(JSON.parse(stored)); } catch (e) {}
      }
      setLoading(false);
    });
  }, []);

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
      name: data.name,
      username: data.username,
      role: data.role,
      phone: data.phone
    };

    await AsyncStorage.setItem('isp_user', JSON.stringify(userData));
    setUser(userData);
    return { success: true };
  };

  const loginFromCache = async (username, password) => {
    try {
      const cached = await AsyncStorage.getItem('isp_user_cache');
      if (cached) {
        const users = JSON.parse(cached);
        const u = users.find(x => x.username === username && x.password_hash === password);
        if (u) {
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
        .single();

      if (!error && data) {
        if (data.password_hash !== password) {
          return { success:false, error:'كلمة المرور غير صحيحة' };
        }
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
  };

  const can = (permission) => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role]?.[permission] || false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, online: isOnline() }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
