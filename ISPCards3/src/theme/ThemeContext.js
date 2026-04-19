// ═══════════════════════════════════════════════════════
//  Smart POS Net — ThemeContext
//  يدير التبديل بين Dark / Light مع حفظ الاختيار
// ═══════════════════════════════════════════════════════
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors } from './colors';

const THEME_KEY = 'isp_theme_mode';

// ── Shared design tokens (لا تتغير بين الوضعين)
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  '2xl': 32,
  '3xl': 40,
};

export const radius = {
  xs:   6,
  sm:   10,
  md:   14,
  lg:   18,
  xl:   22,
  '2xl':28,
  full: 999,
};

export const fontSize = {
  xs:  10,
  sm:  11,
  md:  13,
  lg:  14,
  xl:  16,
  xxl: 20,
  h:   24,
  hh:  28,
  display: 34,
};

export const makeShadow = (colors) => ({
  sm: {
    shadowColor: colors.t1 === '#F1F5F9' ? '#000' : '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: colors.t1 === '#F1F5F9' ? 0.15 : 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: colors.t1 === '#F1F5F9' ? '#000' : '#94A3B8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: colors.t1 === '#F1F5F9' ? 0.20 : 0.10,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: colors.t1 === '#F1F5F9' ? '#000' : '#94A3B8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: colors.t1 === '#F1F5F9' ? 0.25 : 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  blue: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 8,
  },
  green: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 8,
  },
});

// ─────────────────────────────────────────────────────
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');  // 'dark' | 'light'

  // تحميل التفضيل المحفوظ عند الإقلاع
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') setMode(saved);
    });
  }, []);

  const toggleTheme = async () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  };

  const colors = useMemo(
    () => (mode === 'light' ? lightColors : darkColors),
    [mode]
  );

  const shadow = useMemo(() => makeShadow(colors), [colors]);

  const value = useMemo(() => ({
    mode,
    isDark: mode === 'dark',
    isLight: mode === 'light',
    colors,
    shadow,
    spacing,
    radius,
    fontSize,
    toggleTheme,
  }), [mode, colors, shadow]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook للاستخدام في المكوّنات
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
