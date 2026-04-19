// ═══════════════════════════════════════════════════════
//  styles/dashboard.styles.js
//  أنماط شاشة لوحة التحكم
// ═══════════════════════════════════════════════════════
import { StyleSheet, Dimensions } from 'react-native';

const W = Dimensions.get('window').width;

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen:  { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: 100 },

    // Header
    header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl, paddingTop: 8 },
    headerTitle:    { fontSize: fontSize.hh, fontWeight: '900', color: colors.t1, letterSpacing: -0.5 },
    headerSub:      { fontSize: fontSize.sm, color: colors.t3, marginTop: 2 },
    headerBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.green + '18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.green + '40' },
    headerDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
    headerBadgeTxt: { fontSize: fontSize.xs, color: colors.green, fontWeight: '700' },

    // Metric grid
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
    metricCard: {
      width: (W - spacing.lg * 2 - spacing.sm) / 2,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg, overflow: 'hidden',
      position: 'relative',
      ...shadow.md,
    },
    metricGlow:    { position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40 },
    metricIconWrap:{ width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
    metricTitle:   { fontSize: fontSize.xs, color: colors.t3, fontWeight: '600', marginBottom: 4, letterSpacing: 0.3 },
    metricValue:   { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },

    // Section title
    secTitle:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md, marginTop: spacing.xs },
    secTitleAccent: { width: 4, height: 20, backgroundColor: colors.blue, borderRadius: 2 },
    secTitleText:   { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1, flex: 1 },

    // Generic section card
    sectionCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl,
      ...shadow.sm,
    },

    // POS Health
    posHealthHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
    posHealthLabel:   { fontSize: fontSize.xs, color: colors.t3, marginBottom: 3, textAlign: 'right' },
    posHealthVal:     { fontSize: fontSize.xl, fontWeight: '800' },
    progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    progressPct:      { fontSize: fontSize.sm, fontWeight: '700', color: colors.orange },

    // Gauge
    gaugeCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl, alignItems: 'center',
    },
    gaugeSectionTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1, textAlign: 'center' },
    gaugeSub:       { fontSize: fontSize.sm, color: colors.t3, textAlign: 'center', marginTop: 4 },
    gaugeOuter: {
      width: 160, height: 160, borderRadius: 80,
      borderWidth: 10, alignItems: 'center', justifyContent: 'center',
      shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
    },
    gaugeInner:   { width: 130, height: 130, borderRadius: 65, alignItems: 'center', justifyContent: 'center' },
    gaugePercent: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
    gaugeLabel:   { fontSize: fontSize.sm, fontWeight: '700', marginTop: 2 },
    gaugeBadge: {
      marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: 8,
      borderRadius: radius.full, borderWidth: 1,
    },
    gaugeBadgeText: { fontSize: fontSize.md, fontWeight: '700' },

    // Top Agents
    agentRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md },
    agentBorder:  { borderBottomWidth: 1, borderBottomColor: colors.border },
    agentLeft:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    agentRankBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    agentName:    { fontSize: fontSize.lg, fontWeight: '700', color: colors.t1 },
    agentAmt:     { fontSize: fontSize.lg, fontWeight: '800', color: colors.green },

    // Chart
    chartWrap: { marginBottom: spacing.xl, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },

    // Inventory
    invTotalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: spacing.lg, justifyContent: 'center' },
    invLabel:    { fontSize: fontSize.xs, color: colors.t3, flex: 1, textAlign: 'right' },
    invTotal:    { fontSize: 32, fontWeight: '900', color: colors.cyan },
    batchRow:    { marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
    batchRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
    batchSerial: { fontSize: fontSize.md, fontWeight: '700', color: colors.t1 },
    batchPctBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
    batchPct:    { fontSize: fontSize.xs, fontWeight: '700' },
    batchRemain: { fontSize: fontSize.xs, color: colors.t3, marginTop: 6, textAlign: 'right' },

    emptyText: { textAlign: 'center', color: colors.t3, fontSize: fontSize.md, paddingVertical: spacing.md },
  });
