// ═══════════════════════════════════════════════════════
//  styles/main.styles.js
//  أنماط شاشات: Invoices, Collections, Inventory, POS, Wallets
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow, scale) => {
  const isScaleAvailable = typeof scale === 'function';
  const getScale = (val) => isScaleAvailable ? scale(val) : val;

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },

    // Invoice Card
    invCard: {
      flexDirection: 'row', backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.md,
      marginBottom: spacing.md, ...shadow.sm,
    },
    invCardLeft: { flex: 1, gap: 6 },
    invCardRight: { alignItems: 'flex-end', gap: 6, justifyContent: 'center' },
    invNumRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    invNum: { fontSize: fontSize.sm, fontWeight: '900', color: colors.primary, letterSpacing: 0.3 },
    syncDot: {
      width: 18, height: 18, borderRadius: 9,
      backgroundColor: colors.warning + '20',
      alignItems: 'center', justifyContent: 'center'
    },
    invPos: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.t1 },
    invMeta: { fontSize: fontSize.sm, color: colors.t3, fontWeight: '600' },
    invAmt: { fontSize: fontSize.h, fontWeight: '900', color: colors.t1 },

    // Collection Card
    colCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md, ...shadow.sm,
    },
    colCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    colNum: { fontSize: fontSize.md, fontWeight: '900', color: colors.primary, letterSpacing: 0.3 },
    colMethod: { fontSize: fontSize.sm, color: colors.t3, marginTop: 4, fontWeight: '600' },
    colAmt: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.success, letterSpacing: -0.5 },
    colDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
    colGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    colGridItem: { backgroundColor: colors.bg2, borderRadius: radius.md, padding: spacing.md, minWidth: '45%', flex: 1, borderWidth: 1, borderColor: colors.border },
    colGridLabel: { fontSize: fontSize.xs, color: colors.t3, marginBottom: 4, fontWeight: '700' },
    colGridVal: { fontSize: fontSize.lg, fontWeight: '800', color: colors.t1 },
    colNotes: { fontSize: fontSize.sm, color: colors.t3, marginTop: spacing.md, fontStyle: 'italic' },
    colActions: { gap: spacing.md, marginTop: spacing.lg },

    // Inventory
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
    catCard: {
      width: '31%', backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.sm, alignItems: 'center', position: 'relative', ...shadow.sm,
    },
    catTotal: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.t1, letterSpacing: -1 },
    catName: { fontSize: fontSize.sm, fontWeight: '800', color: colors.t2, marginTop: 4, textAlign: 'center' },
    catPrice: { fontSize: fontSize.sm, color: colors.t3, marginTop: 4, fontWeight: '600' },
    catAlert: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.full },

    batchCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadow.sm,
    },
    batchCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
    batchNum: { fontSize: fontSize.xxl, fontWeight: '900' },
    batchStats: { flexDirection: 'row', marginBottom: spacing.lg },
    batchStat: { flex: 1 },
    batchStatLabel: { fontSize: fontSize.sm, color: colors.t3, marginBottom: 4, fontWeight: '700' },
    batchStatVal: { fontSize: fontSize.xl, fontWeight: '800' },
    catChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full },
    catChipTxt: { fontSize: fontSize.sm, fontWeight: '800' },

    // POS
    posCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadow.sm,
    },
    posBlocked: { borderColor: colors.danger + '60', backgroundColor: colors.danger + '06' },
    posCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    posName: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.t1, letterSpacing: -0.5 },
    posMeta: { fontSize: fontSize.sm, color: colors.t3, marginTop: 4, fontWeight: '600' },
    posStats: { flexDirection: 'row', marginBottom: spacing.lg },
    posActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },

    // Wallets
    walCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadow.sm,
    },
    walCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    walCatName: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.t1, letterSpacing: -0.5 },
    walMeta: { fontSize: fontSize.sm, color: colors.t3, marginTop: 4, fontWeight: '600' },
    walStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.lg },
    remBadge: {
      alignItems: 'center', justifyContent: 'center',
      padding: spacing.md, borderRadius: radius.md,
      borderWidth: 1, minWidth: getScale(70), backgroundColor: colors.bg2
    },
    remVal: { fontSize: fontSize.display, fontWeight: '900', letterSpacing: -1 },
    remUnit: { fontSize: fontSize.sm, fontWeight: '700', marginTop: 2 },

    // Tables (Detailed Reports)
    section: { backgroundColor: colors.card, borderRadius: radius.xl, marginVertical: spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow.sm },
    tableHeader: { flexDirection: 'row', paddingVertical: spacing.lg, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: colors.border, backgroundColor: colors.bg2 },
    thCell: { fontSize: fontSize.sm, fontWeight: '900', color: colors.t3, textAlign: 'right' },
    tableRow: { flexDirection: 'row', paddingVertical: spacing.lg, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
    tdMain: { fontSize: fontSize.md, fontWeight: '800', color: colors.t1, textAlign: 'right' },
    tdSub: { fontSize: fontSize.xs, color: colors.t3, marginTop: 4, textAlign: 'right', fontWeight: '600' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(5,5,5,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    modalContent: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xxl, width: '100%', ...shadow.lg, borderWidth: 1, borderColor: colors.border2 },
    sectionTitle: { fontSize: fontSize.xl, fontWeight: '900', color: colors.t1, marginBottom: spacing.md, letterSpacing: -0.5 },
  });
};
