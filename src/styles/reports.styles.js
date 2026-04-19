// ═══════════════════════════════════════════════════════
//  styles/reports.styles.js
//  أنماط شاشة الاستعلامات والتقارير
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },

    // Section title
    secTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md, marginTop: spacing.sm },
    secAccent: { width: 4, height: 18, backgroundColor: colors.blue, borderRadius: 2 },
    secTitleTxt: { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1, flex: 1 },

    // Card
    card: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm,
    },
    cardTop:   { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.t1 },
    cardSub:   { fontSize: fontSize.xs, color: colors.t3, marginTop: 3 },

    statsRow: { flexDirection: 'row', marginBottom: spacing.md },
    statItem: { flex: 1, alignItems: 'center' },
    statLabel:{ fontSize: fontSize.xs, color: colors.t3, marginBottom: 3 },
    statVal:  { fontSize: fontSize.md, fontWeight: '700' },
    statValLg:{ fontSize: fontSize.xxl, fontWeight: '800' },

    invCountBadge: {
      backgroundColor: colors.orange + '18', borderRadius: radius.full,
      paddingHorizontal: 8, paddingVertical: 3,
    },

    // Agents
    effBadge: { alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, minWidth: 54 },
    effVal:   { fontSize: fontSize.xl, fontWeight: '800' },

    // Inventory
    catIcon:    { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md },
    availBadge: { alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, minWidth: 54 },
    availVal:   { fontSize: fontSize.xl, fontWeight: '800' },

    // Daily
    dailyCard: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm,
    },
    dailyLeft:  { gap: 3 },
    dailyDate:  { fontSize: fontSize.lg, fontWeight: '700', color: colors.t1 },
    dailyCount: { fontSize: fontSize.xs, color: colors.t3 },
    dailyRight: { alignItems: 'flex-end' },
    dailyAmt:   { fontSize: fontSize.xxl, fontWeight: '900', color: colors.green },
    dailyLabel: { fontSize: fontSize.xs, color: colors.t3 },

    // Overdue
    overdueCard: { borderColor: colors.red + '40', borderLeftWidth: 4, borderLeftColor: colors.red },
    overdueAmt:  { fontSize: 24, fontWeight: '900', color: colors.orange, marginTop: spacing.sm },

    successEmpty:    { alignItems: 'center', padding: 40, gap: spacing.md },
    successEmptyTxt: { fontSize: fontSize.xl, fontWeight: '700', color: colors.green },

    empty: { textAlign: 'center', color: colors.t3, fontSize: fontSize.md, paddingVertical: 40 },
  });
