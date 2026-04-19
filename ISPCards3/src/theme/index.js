// ═══════════════════════════════════════════════════════
//  Smart POS Net — Theme Barrel (للتوافق مع الكود القديم)
//  استيراد الثيم الجديد من ThemeContext
// ═══════════════════════════════════════════════════════

// ── Re-export from new files
export { darkColors as colors, lightColors } from './colors';
export { spacing, radius, fontSize } from './ThemeContext';
export { useTheme, ThemeProvider } from './ThemeContext';

// ── Static dark shadow (للاستخدام الثابت في ملفات غير ديناميكية)
export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  blue: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  green: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
};
