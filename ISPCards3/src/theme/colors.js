// ═══════════════════════════════════════════════════════
//  Smart POS Net — Color Palettes (Dark & Light)
// ═══════════════════════════════════════════════════════

// ── Brand accents (ثابتة في كلا الوضعين)
const brand = {
  blue:    '#2563EB',
  blueL:   '#3B82F6',
  blueG:   '#1D4ED8',
  cyan:    '#0891B2',
  cyanL:   '#06B6D4',
  green:   '#059669',
  greenL:  '#10B981',
  orange:  '#D97706',
  orangeL: '#F59E0B',
  red:     '#DC2626',
  redL:    '#EF4444',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  pink:    '#DB2777',
  pinkL:   '#EC4899',
  teal:    '#0D9488',
  indigo:  '#4F46E5',

  // Gradients
  gradBlue:   ['#1D4ED8', '#2563EB', '#3B82F6'],
  gradGreen:  ['#059669', '#10B981', '#34D399'],
  gradOrange: ['#D97706', '#F59E0B', '#FCD34D'],
  gradPurple: ['#7C3AED', '#8B5CF6', '#A78BFA'],
};

// ── Dark Theme (الوضع الافتراضي — Navy Deep)
export const darkColors = {
  ...brand,

  // Backgrounds
  bg:    '#070d1a',
  bg2:   '#0c1424',
  bg3:   '#0f192d',

  // Card surfaces
  card:  '#111d35',
  card2: '#162244',
  card3: '#1a2a52',
  glass: 'rgba(17, 29, 53, 0.85)',

  // Borders
  border:  '#1c2e50',
  border2: '#243760',
  border3: '#2d4680',

  // Text hierarchy
  t1: '#F1F5F9',   // Primary
  t2: '#94A3B8',   // Secondary
  t3: '#475569',   // Muted
  t4: '#2D3F60',   // Ghost
};

export const lightColors = {
  ...brand,

  // Backgrounds — Pearl / Soft Slate (Darker than pure white)
  bg:    '#E2E8F0', // Slate 200
  bg2:   '#F1F5F9', // Slate 100
  bg3:   '#CBD5E1', // Slate 300

  // Card surfaces — Very light gray/pearl
  card:  '#F8FAFC',
  card2: '#EDF2F7',
  card3: '#E2E8F0',
  glass: 'rgba(255,255,255,0.85)',

  // Borders — Soft slate
  border:  '#CBD5E1',
  border2: '#94A3B8',
  border3: '#64748B',

  // Text hierarchy
  t1: '#1E293B',   // Primary   — slate 800
  t2: '#334155',   // Secondary — slate 700
  t3: '#475569',   // Muted     — slate 600
  t4: '#94A3B8',   // Ghost     — slate 400
};
