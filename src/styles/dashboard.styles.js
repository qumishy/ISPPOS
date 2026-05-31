// ═══════════════════════════════════════════════════════
//  styles/dashboard.styles.js
//  Premium POS Dashboard — Cairo Fonts + 3-col grid
// ═══════════════════════════════════════════════════════
import { StyleSheet, Dimensions } from 'react-native';

const W = Dimensions.get('window').width;

export const makeStyles = (colors, spacing, radius, fontSize, shadow, scale, ff) => {
  const isScaleAvailable = typeof scale === 'function';
  const getW = (val) => isScaleAvailable ? scale(val) : val;

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.xl, paddingBottom: 120 },

    // Header — clean greeting
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: spacing.lg, marginTop: spacing.sm,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      ...shadow.sm,
    },
    headerTitle: {
      fontSize: fontSize.hh, fontFamily: ff?.black || undefined, fontWeight: '900',
      color: colors.t1, letterSpacing: -0.5,
    },
    headerSub: {
      fontSize: fontSize.md, fontFamily: ff?.semiBold || undefined,
      color: colors.t3, marginBottom: 2, fontWeight: '600',
    },
    headerActions: { alignItems: 'flex-end', gap: spacing.sm },
    headerBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.success + '15', paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs, borderRadius: radius.full,
      borderWidth: 1, borderColor: colors.success + '40',
    },
    headerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
    headerBadgeTxt: { fontSize: fontSize.sm, color: colors.success, fontFamily: ff?.bold || undefined, fontWeight: '800' },

    // Metric grid — 2 columns
    metricsGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl,
    },
    metricCard: {
      width: (W - spacing.xl * 2 - spacing.md) / 2,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.sm, overflow: 'hidden',
      position: 'relative', ...shadow.sm, alignContent: 'center', alignItems: 'center'
    },
    metricGlow: { position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50 },
    metricIconWrap: {
      width: 40, height: 40, borderRadius: radius.md,
      alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
    },
    metricTitle: {
      fontSize: fontSize.xs, color: colors.t3, fontFamily: ff?.semiBold || undefined,
      fontWeight: '700', marginBottom: 2, textAlign: 'center'
    },
    metricValue: {
      fontSize: fontSize.lg, fontFamily: ff?.black || undefined,
      fontWeight: '900', letterSpacing: -0.5, color: colors.t1, textAlign: 'center'
    },

    // Agent Wallet 3-col grid
    walletCard3Col: {
      width: (W - spacing.xl * 2 - spacing.md * 2) / 3,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
      overflow: 'hidden', position: 'relative', ...shadow.sm,
    },

    // Section title
    secTitle: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      marginBottom: spacing.lg, marginTop: spacing.md,
    },
    secTitleAccent: { width: 5, height: 22, backgroundColor: colors.primary, borderRadius: 3 },
    secTitleText: {
      fontSize: fontSize.xl, fontFamily: ff?.extraBold || undefined,
      fontWeight: '900', color: colors.t1, flex: 1, letterSpacing: -0.5,
    },

    // Generic section card
    sectionCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
      ...shadow.sm,
    },

    // Gauge
    gaugeCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
      alignItems: 'center', ...shadow.sm,
    },
    gaugeSectionTitle: {
      fontSize: fontSize.xl, fontFamily: ff?.black || undefined,
      fontWeight: '900', color: colors.t1, textAlign: 'center', letterSpacing: -0.5,
    },
    gaugeSub: {
      fontSize: fontSize.sm, fontFamily: ff?.regular || undefined,
      color: colors.t3, textAlign: 'center', marginTop: spacing.xs, fontWeight: '600',
    },
    gaugeOuter: {
      width: getW(150), height: getW(150), borderRadius: getW(75),
      borderWidth: 8, alignItems: 'center', justifyContent: 'center',
      shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6,
      shadowRadius: 15, elevation: 8, marginTop: spacing.lg,
    },
    gaugeInner: {
      width: getW(114), height: getW(114), borderRadius: getW(57),
      alignItems: 'center', justifyContent: 'center',
    },
    gaugePercent: {
      fontSize: fontSize.display, fontFamily: ff?.black || undefined,
      fontWeight: '900', letterSpacing: -1, color: colors.t1,
    },
    gaugeLabel: {
      fontSize: fontSize.sm, fontFamily: ff?.bold || undefined,
      fontWeight: '800', marginTop: 4,
    },
    gaugeBadge: {
      marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
      borderRadius: radius.full, borderWidth: 1,
    },
    gaugeBadgeText: {
      fontSize: fontSize.sm, fontFamily: ff?.bold || undefined, fontWeight: '800',
    },

    // Top Agents
    agentRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', paddingVertical: spacing.lg,
    },
    agentBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    agentLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    agentRankBadge: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    agentName: {
      fontSize: fontSize.lg, fontFamily: ff?.bold || undefined,
      fontWeight: '800', color: colors.t1,
    },
    agentAmt: {
      fontSize: fontSize.lg, fontFamily: ff?.black || undefined,
      fontWeight: '900', color: colors.success, letterSpacing: -0.3,
    },

    // Chart
    chartWrap: {
      marginBottom: spacing.lg, borderRadius: radius.lg, overflow: 'hidden',
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingVertical: spacing.sm
    },

    // Inventory
    invTotalRow: {
      flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm,
      marginBottom: spacing.xl, justifyContent: 'center',
    },
    invLabel: {
      fontSize: fontSize.sm, color: colors.t3, flex: 1, textAlign: 'right',
      fontFamily: ff?.bold || undefined, fontWeight: '700',
    },
    invTotal: {
      fontSize: fontSize.display, fontFamily: ff?.black || undefined,
      fontWeight: '900', color: colors.primary, letterSpacing: -1,
    },
    inventoryEmptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      gap: spacing.xs,
    },
    inventoryChartRow: {
      paddingVertical: spacing.sm,
    },
    inventoryChartBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    inventoryChartHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    inventoryChartLabel: {
      flex: 1,
      fontSize: fontSize.sm,
      color: colors.t1,
      fontFamily: ff?.bold || undefined,
      fontWeight: '800',
    },
    inventoryChartValue: {
      fontSize: fontSize.lg,
      color: colors.primary,
      fontFamily: ff?.black || undefined,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    inventoryChartTrack: {
      width: '100%',
      height: 10,
      borderRadius: 999,
      backgroundColor: colors.bg2,
      overflow: 'hidden',
    },
    inventoryChartFill: {
      height: '100%',
      borderRadius: 999,
      minWidth: 0,
    },
    batchRow: {
      marginBottom: spacing.lg, paddingBottom: spacing.lg,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    batchSerial: {
      fontSize: fontSize.md, fontFamily: ff?.bold || undefined,
      fontWeight: '800', color: colors.t1, marginBottom: spacing.sm,
    },

    emptyText: {
      textAlign: 'center', color: colors.t3, fontSize: fontSize.lg,
      paddingVertical: spacing.xl, fontFamily: ff?.regular || undefined, fontWeight: '600',
    },
  });
};
