// ═══════════════════════════════════════════════════════
//  Smart POS Net — Bespoke ERP Color Identity
// ═══════════════════════════════════════════════════════

// ── Brand accents (Corporate, Reliable, High-end)
const brand = {
  indigo: '#4338CA',      // Primary Action - Deep Indigo
  indigoL: '#6366F1',
  
  emerald: '#059669',     // Success - Calm Emerald
  emeraldL: '#10B981',
  
  amber: '#D97706',       // Warning - Deep Amber
  amberL: '#F59E0B',
  
  rose: '#E11D48',        // Danger - Professional Rose
  roseL: '#F43F5E',
  
  cyan: '#0891b2',
  cyanL: '#06b6d4',

  purple: '#7e22ce',
  purpleL: '#a855f7',
};

// ── Dark Theme (Obsidian & Ink)
export const darkColors = {
  ...brand,

  // Semantic
  primary: brand.indigoL,
  success: brand.emeraldL,
  warning: brand.amberL,
  danger: brand.roseL,

  blue: brand.indigoL,
  green: brand.emeraldL,
  cyan: brand.cyanL,
  purple: brand.purpleL,

  // Backgrounds — Deep Obsidian
  bg: '#0F172A',     // Screen background (darkest)
  bg2: '#1E293B',    // Slight accent
  bg3: '#334155',

  // Card surfaces — Slightly lighter than background
  card: '#1E293B',   // Nav and cards
  card2: '#334155',
  card3: '#475569',
  glass: 'rgba(30, 41, 59, 0.85)',

  // Borders — Subtle High-end lines
  border: '#334155',
  border2: '#475569',
  border3: '#64748B',

  // Text hierarchy (Always light text on dark background)
  t1: '#F8FAFC',
  t2: '#E2E8F0',
  t3: '#CBD5E1',
  t4: '#94A3B8',
};

// ── Light Theme (Clean Snow & Corporate Slate)
export const lightColors = {
  ...brand,

  // Semantic
  primary: brand.indigo,
  success: brand.emerald,
  warning: brand.amber,
  danger: brand.rose,

  blue: brand.indigo,
  green: brand.emerald,
  cyan: brand.cyan,
  purple: brand.purple,

  // Backgrounds — slightly darker than cards
  bg: '#F1F5F9',     // Screen background (slightly gray to contrast with white cards)
  bg2: '#E2E8F0',
  bg3: '#CBD5E1',

  // Card surfaces — Absolute White
  card: '#FFFFFF',   // Components and Navs
  card2: '#F8FAFC',
  card3: '#F1F5F9',
  glass: 'rgba(255, 255, 255, 0.95)',

  // Borders — Crisp and barely there
  border: '#E2E8F0',
  border2: '#CBD5E1',
  border3: '#94A3B8',

  // Text hierarchy (Always dark text on light background)
  t1: '#0F172A',
  t2: '#334155',
  t3: '#475569',
  t4: '#64748B',
};
