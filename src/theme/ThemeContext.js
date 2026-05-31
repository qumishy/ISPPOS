// ═══════════════════════════════════════════════════════
//  Smart POS Net — ThemeContext (Responsive ERP)
//  يدير التبديل والتجاوب مع جميع أحجام الشاشات
// ═══════════════════════════════════════════════════════
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors } from './colors';

const { width } = Dimensions.get('window');
// Use 390 as the base width (typical medium phone)
const scale = (size) => Math.round((width / 390) * size);

const THEME_KEY = 'isp_theme_mode';

// ── Scalable Shared tokens
export const spacing = {
  xs: scale(4),
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(24),
  xxl: scale(32),
  '2xl': scale(40),
  '3xl': scale(48),
};

export const radius = {
  xs: scale(6),
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(20),
  '2xl': scale(28),
  full: 999,
};

export const fontSize = {
  xs: scale(11),
  sm: scale(13),
  md: scale(15),
  lg: scale(17),
  xl: scale(19),
  xxl: scale(22),
  h: scale(26),
  hh: scale(30),
  display: scale(36),
};

export const fontFamily = {
  regular:   'IBMPlexSansArabic-Regular',
  medium:    'IBMPlexSansArabic-Medium',
  semiBold:  'IBMPlexSansArabic-SemiBold',
  bold:      'IBMPlexSansArabic-Bold',
  extraBold: 'IBMPlexSansArabic-ExtraBold',
  black:     'IBMPlexSansArabic-Black',
};

export const makeShadow = (colors, isDark) => ({
  sm: {
    shadowColor: isDark ? '#000' : '#475569',
    shadowOffset: { width: 0, height: scale(4) },
    shadowOpacity: isDark ? 0.6 : 0.08,
    shadowRadius: scale(12),
    elevation: 3,
  },
  md: {
    shadowColor: isDark ? '#000' : '#475569',
    shadowOffset: { width: 0, height: scale(8) },
    shadowOpacity: isDark ? 0.7 : 0.12,
    shadowRadius: scale(20),
    elevation: 6,
  },
  lg: {
    shadowColor: isDark ? '#000' : '#475569',
    shadowOffset: { width: 0, height: scale(12) },
    shadowOpacity: isDark ? 0.8 : 0.16,
    shadowRadius: scale(32),
    elevation: 10,
  },
  blue: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: scale(6) },
    shadowOpacity: 0.35,
    shadowRadius: scale(16),
    elevation: 8,
  },
  green: {
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: scale(6) },
    shadowOpacity: 0.35,
    shadowRadius: scale(16),
    elevation: 8,
  },
});

// ─────────────────────────────────────────────────────
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('light');  // 'dark' | 'light'

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
  
  const isDark = mode === 'dark';

  const shadow = useMemo(() => makeShadow(colors, isDark), [colors, isDark]);

  const value = useMemo(() => ({
    mode,
    isDark,
    isLight: !isDark,
    colors,
    shadow,
    spacing,
    radius,
    fontSize,
    fontFamily,
    toggleTheme,
    scale
  }), [mode, isDark, colors, shadow]);

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
