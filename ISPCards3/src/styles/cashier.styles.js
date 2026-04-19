// ═══════════════════════════════════════════════════════
//  styles/cashier.styles.js
//  أنماط شاشة اعتماد التحصيل
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },

    // Card
    card: {
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg,
      marginBottom: spacing.sm, ...shadow.sm,
    },
    cardTop:  { justifyContent: 'space-between', marginBottom: spacing.sm },
    num:      { fontSize: fontSize.md, fontWeight: '700', color: colors.cyan, flex: 1 },
    date:     { fontSize: fontSize.xs, color: colors.t3, marginRight: spacing.sm },
    amount:   { fontSize: 26, fontWeight: '900', color: colors.green, marginBottom: spacing.md, textAlign: 'right' },

    // Info grid
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
    gi:   { backgroundColor: colors.bg2, borderRadius: radius.sm, padding: spacing.sm, minWidth: '45%', flex: 1 },
    gl:   { fontSize: fontSize.xs, color: colors.t3, marginBottom: 2 },
    gv:   { fontSize: fontSize.md, fontWeight: '600', color: colors.t1 },

    notes:    { fontSize: fontSize.xs, color: colors.t3, marginTop: spacing.xs, fontStyle: 'italic' },
    rejection:{ fontSize: fontSize.xs, color: colors.red, marginTop: spacing.xs, fontWeight: '600' },
  });
