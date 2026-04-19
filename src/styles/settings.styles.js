// ═══════════════════════════════════════════════════════
//  styles/settings.styles.js
//  أنماط شاشة الإعدادات
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },

    userCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl,
      borderTopWidth: 3, borderTopColor: colors.blue,
      ...shadow.md,
    },
    userInfo: { flex: 1 },
    userName: { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1 },
    logoutBtn: {
      backgroundColor: colors.red + '12', borderRadius: radius.md,
      padding: spacing.sm, paddingHorizontal: spacing.md,
      borderWidth: 1, borderColor: colors.red + '30',
    },
    logoutTxt: { color: colors.red, fontWeight: '700', fontSize: fontSize.sm },

    sectionTitle: {
      fontSize: fontSize.xs, fontWeight: '700', color: colors.t3,
      letterSpacing: 1.5, marginBottom: spacing.sm, marginTop: spacing.lg,
      paddingHorizontal: spacing.xs, textTransform: 'uppercase',
    },
    section: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
      ...shadow.sm,
    },
    row: {
      justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    rowLabel: { fontSize: fontSize.md, color: colors.t2, flex: 1 },
    badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },

    optBtn: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border2,
      backgroundColor: colors.bg2,
    },
    optBtnActive: { borderColor: colors.blue, backgroundColor: colors.blue + '15' },
    optTxt: { fontSize: fontSize.sm, color: colors.t2 },

    // ── Theme Toggle Card
    themeCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.lg,
      marginBottom: spacing.sm, gap: spacing.md,
      ...shadow.md,
    },
    themeIconWrap: {
      width: 52, height: 52, borderRadius: radius.lg,
      alignItems: 'center', justifyContent: 'center',
    },
    themeInfo: { flex: 1 },
    themeTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1 },
    themeSub:   { fontSize: fontSize.xs, color: colors.t3, marginTop: 3 },

    themeToggleBtn: {
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
      borderRadius: radius.full, borderWidth: 1.5,
      alignItems: 'center', justifyContent: 'center', gap: 4,
      minWidth: 90,
    },
    themeToggleTxt: { fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 0.3 },
    themeToggleMode:{ fontSize: fontSize.xs, fontWeight: '600' },
  });
