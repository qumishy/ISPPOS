import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';


//const SUPABASE_URL = 'https://vddwtksrxokdazhassjp.supabase.co';
const SUPABASE_URL = 'https://ybpzjvswutvdbjevgawt.supabase.co';
//const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkZHd0a3NyeG9rZGF6aGFzc2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTAxNjksImV4cCI6MjA4OTQ2NjE2OX0.00a9SDJKOiHV8g_BFY8c-y-1CWo3ulTHUAT_PatHMK0';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicHpqdnN3dXR2ZGJqZXZnYXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjI4NTksImV4cCI6MjA5MzgzODg1OX0.ExE44RkfPj3_xUv9zjxGZVzwKV7NDRmsdPx1AiVOqzw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const ADMIN_WALLET_OFFLINE_MESSAGE = 'هذه الإضافة تتطلب اتصالاً بالإنترنت. يرجى تشغيل الإنترنت ثم المحاولة مرة أخرى.';
export const ADMIN_WALLET_REMOTE_ERROR_MESSAGE = 'فشل تنفيذ العملية على السيرفر. تأكد من الإنترنت ثم حاول مرة أخرى.';
export const ADMIN_WALLET_ONLINE_NOTE = 'تنبيه: هذه العملية إدارية وتتم عبر الإنترنت فقط. يجب توفر اتصال بالإنترنت قبل الحفظ.';

export const isAdminManagerRole = (role) => ['admin', 'manager'].includes(String(role || '').trim().toLowerCase());

const taggedAdminWalletError = (message, code, cause = null) => {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
};

const withConnectionTimeout = (promise, timeoutMs = 8000) => Promise.race([
  Promise.resolve(promise),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase connection timeout')), timeoutMs)),
]);

export const ensureOnlineForAdminWalletMutation = async (projectId = null) => {
  let networkState;
  try {
    networkState = await NetInfo.fetch();
  } catch (error) {
    throw taggedAdminWalletError(ADMIN_WALLET_OFFLINE_MESSAGE, 'ADMIN_WALLET_OFFLINE', error);
  }

  if (!networkState?.isConnected || networkState.isInternetReachable === false) {
    throw taggedAdminWalletError(ADMIN_WALLET_OFFLINE_MESSAGE, 'ADMIN_WALLET_OFFLINE');
  }

  try {
    let query = supabase.from('project').select('id').limit(1);
    if (projectId) query = query.eq('id', projectId);
    const { error } = await withConnectionTimeout(query);
    if (error) throw error;
  } catch (error) {
    throw taggedAdminWalletError(ADMIN_WALLET_OFFLINE_MESSAGE, 'ADMIN_WALLET_OFFLINE', error);
  }

  return true;
};

export const createAdminWalletRemoteError = (cause = null) =>
  taggedAdminWalletError(ADMIN_WALLET_REMOTE_ERROR_MESSAGE, 'ADMIN_WALLET_REMOTE_FAILED', cause);
