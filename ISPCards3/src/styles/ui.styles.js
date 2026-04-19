// ═══════════════════════════════════════════════════════
//  styles/ui.styles.js
//  أنماط مكوّنات UI المشتركة
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    // Card
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...shadow.sm,
    },
    cardHeader: {
      flexDirection: 'row', alignItems: 'center',
      marginBottom: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.t1 },
    cardSub:   { fontSize: fontSize.xs, color: colors.t3, marginTop: 2 },

    // Badge
    badge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingVertical: 4, paddingHorizontal: 10,
      borderRadius: radius.full, borderWidth: 1,
      alignSelf: 'flex-start',
    },
    badgeDot:  { width: 6, height: 6, borderRadius: 3 },
    badgeText: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.3 },

    // Button
    btn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      borderRadius: radius.md, gap: 6, borderWidth: 1,
    },
    btnText:     { fontWeight: '700', letterSpacing: 0.3 },
    btnDisabled: { opacity: 0.45 },

    // Input
    label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.t2, marginBottom: 7, textAlign: 'right' },
    inputWrap: { marginBottom: spacing.md },
    inputContainer: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.bg2,
      borderWidth: 1.5, borderColor: colors.border2,
      borderRadius: radius.md, paddingHorizontal: spacing.md,
      overflow: 'hidden', height: 50,
    },
    input: {
      flex: 1, color: colors.t1, fontSize: fontSize.lg,
      paddingVertical: spacing.md, textAlign: 'right',
    },
    inputError: { color: colors.red, fontSize: fontSize.xs, marginTop: 4, textAlign: 'right' },

    // Loading
    loading:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xxl },
    loadingSpinWrap:{ position: 'relative', alignItems: 'center', justifyContent: 'center' },
    loadingGlow:    { position: 'absolute', width: 60, height: 60, borderRadius: 30, opacity: 0.15, backgroundColor: colors.blue },
    loadingText:    { color: colors.t3, fontSize: fontSize.md, letterSpacing: 0.5 },

    // Empty
    empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 50, gap: spacing.md },
    emptyIcon:  { fontSize: 52, marginBottom: spacing.sm },
    emptyTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.t2, textAlign: 'center' },
    emptySub:   { fontSize: fontSize.sm, color: colors.t3, textAlign: 'center', lineHeight: 20 },

    // Section Header
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center',
      marginBottom: spacing.md, marginTop: spacing.sm,
    },
    sectionTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
    sectionTitle:     { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1 },

    // Progress
    progressTrack: { backgroundColor: colors.border, overflow: 'hidden' },
    progressFill:  {},

    // Divider
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

    // KPI
    kpiCard: {
      flex: 1, backgroundColor: colors.card,
      borderRadius: radius.md, padding: spacing.md,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: colors.border,
      ...shadow.sm,
    },
    kpiValue: { fontSize: fontSize.xxl, fontWeight: '900', letterSpacing: -0.5 },
    kpiLabel: { fontSize: fontSize.xs, color: colors.t3, marginTop: 4, textAlign: 'center', letterSpacing: 0.3 },

    // StatChip
    statChip:      { alignItems: 'center', gap: 2, flex: 1 },
    statChipVal:   { fontSize: fontSize.xxl, fontWeight: '800' },
    statChipLabel: { fontSize: fontSize.xs, color: colors.t3, letterSpacing: 0.3 },

    // Avatar
    avatar:    { alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontWeight: '800' },

    // ScreenHeader
    shWrapper: {
      backgroundColor: colors.bg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    shKpiStrip: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: spacing.sm + 2,
    },
    shKpiItem: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
    shKpiVal:  { fontSize: fontSize.lg, fontWeight: '800', letterSpacing: -0.3 },
    shKpiLabel:{ fontSize: fontSize.xs - 1, color: colors.t3, marginTop: 2, letterSpacing: 0.2 },
    shKpiDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },

    shTabBar: {
      flexDirection: 'row',
      backgroundColor: colors.bg2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    shTab: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, paddingVertical: spacing.md,
      borderBottomWidth: 2.5, borderBottomColor: 'transparent',
    },
    shTabActive: {
      borderBottomColor: colors.blue,
      backgroundColor: colors.blue + '0D',
    },
    shTabTxt:       { fontSize: fontSize.xs, fontWeight: '600', color: colors.t3 },
    shTabTxtActive: { color: colors.blue, fontWeight: '800' },

    shToolbar: {
      flexDirection: 'row', alignItems: 'center',
      gap: spacing.sm, padding: spacing.md,
      backgroundColor: colors.bg2,
    },
    shSearchBox: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border2,
      borderRadius: radius.md, paddingHorizontal: spacing.md,
      height: 40,
    },
    shSearchInput: {
      flex: 1, color: colors.t1, fontSize: fontSize.md,
      paddingVertical: 0, textAlign: 'right',
    },
    shActionBtn: {
      backgroundColor: colors.blue,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      height: 40,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: colors.blueG,
      ...shadow.blue,
    },
    shActionTxt: {
      color: '#fff', fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.2,
    },
  });
