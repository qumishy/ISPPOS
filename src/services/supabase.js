import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';


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
