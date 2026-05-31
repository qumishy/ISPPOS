// ═══════════════════════════════════════════════════════
//  styles/ui.styles.js
//  أنماط مكوّنات UI المشتركة — High-End ERP Edition
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    // Card
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      padding: spacing.xl,
      marginBottom: spacing.lg,
      ...shadow.md,
    },
    cardHeader: {
      flexDirection: 'row', alignItems: 'center',
      marginBottom: spacing.lg,
      paddingBottom: spacing.lg,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    cardTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1, letterSpacing: -0.3 },
    cardSub: { fontSize: fontSize.sm, color: colors.t3, marginTop: 4 },

    // Badge
    badge: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
      borderRadius: radius.full, borderWidth: 1,
      alignSelf: 'flex-start',
    },
    badgeDot: { width: 6, height: 6, borderRadius: 3 },
    badgeText: { fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.3 },

    // Button
    btn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      borderRadius: radius.md, gap: spacing.sm, borderWidth: 1,
      height: 48,
    },
    btnText: { fontWeight: '800', letterSpacing: 0.3 },
    btnDisabled: { opacity: 0.5 },

    // Input
    label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: spacing.sm, textAlign: 'right' },
    inputWrap: { marginBottom: spacing.xl },
    inputContainer: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.bg2,
      borderWidth: 1, borderColor: colors.border2,
      borderRadius: radius.md, paddingHorizontal: spacing.lg,
      overflow: 'hidden', height: 52,
    },
    input: {
      flex: 1, color: colors.t1, fontSize: fontSize.lg,
      paddingVertical: spacing.md, textAlign: 'right', fontWeight: '600'
    },
    inputError: { color: colors.danger, fontSize: fontSize.xs, marginTop: spacing.sm, textAlign: 'right' },

    // Loading
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xxl },
    loadingSpinWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
    loadingGlow: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.1, backgroundColor: colors.primary },
    loadingText: { color: colors.t3, fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.5 },

    // Empty
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'], gap: spacing.lg },
    emptyIcon: { fontSize: 64, marginBottom: spacing.md, opacity: 0.8 },
    emptyTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.t2, textAlign: 'center', letterSpacing: -0.5 },
    emptySub: { fontSize: fontSize.sm, color: colors.t3, textAlign: 'center', lineHeight: 22 },

    // Section Header
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: spacing.lg, marginTop: spacing.xl,
      paddingHorizontal: spacing.xs,
    },
    sectionTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    sectionTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.t1, letterSpacing: -0.5 },

    // Progress
    progressTrack: { backgroundColor: colors.border, overflow: 'hidden', width: '100%', borderRadius: radius.full },
    progressFill: {},

    // Divider
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },

    // KPI
    kpiCard: {
      flex: 1, backgroundColor: colors.card,
      borderRadius: radius.lg, padding: spacing.xl,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: colors.border,
      ...shadow.sm,
    },
    kpiValue: { fontSize: fontSize.display, fontWeight: '900', letterSpacing: -1, color: colors.t1 },
    kpiLabel: { fontSize: fontSize.sm, color: colors.t3, marginTop: spacing.sm, textAlign: 'center', fontWeight: '700' },

    // StatChip
    statChip: { alignItems: 'flex-start', gap: 4, flex: 1 },
    statChipVal: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.t1, letterSpacing: -0.5 },
    statChipLabel: { fontSize: fontSize.sm, color: colors.t3, fontWeight: '600' },

    // Avatar
    avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    avatarTxt: { fontWeight: '900' },

    // ScreenHeader
    shWrapper: {
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      shadowColor: '#000', shadowOffset: { width:0, height:2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 10,
    },
    shKpiStrip: {
      flexDirection: 'row',
      backgroundColor: colors.bg2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: spacing.sm,
    },
    shKpiItem: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
    shKpiVal: { fontSize: fontSize.lg, fontWeight: '900', letterSpacing: -0.5, color: colors.t1 },
    shKpiLabel: { fontSize: fontSize.xs, color: colors.t3, marginTop: 2, fontWeight: '700' },
    shKpiDivider: { width: 1, backgroundColor: colors.border, marginVertical: 6 },

    shTabBar: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    shTab: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: spacing.sm, paddingVertical: spacing.lg,
      borderBottomWidth: 3, borderBottomColor: 'transparent',
    },
    shTabActive: {
      borderBottomColor: colors.primary,
    },
    shTabTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.t3 },
    shTabTxtActive: { color: colors.primary, fontWeight: '900' },

    shToolbar: {
      flexDirection: 'row', alignItems: 'center',
      gap: spacing.md, padding: spacing.md,
      backgroundColor: colors.card,
    },
    shSearchBox: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.bg2,
      borderWidth: 1, borderColor: colors.border2,
      borderRadius: radius.md, paddingHorizontal: spacing.md,
      height: 40,
    },
    shSearchInput: {
      flex: 1, color: colors.t1, fontSize: fontSize.sm, fontWeight: '600',
      paddingVertical: 0, textAlign: 'right',
    },
    shActionBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      height: 40,
      alignItems: 'center', justifyContent: 'center',
      ...shadow.blue,
    },
    shActionTxt: {
      color: '#fff', fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 0.5,
    },
  });
