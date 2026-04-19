// ═══════════════════════════════════════════════════════
//  styles/main.styles.js
//  أنماط شاشات: Invoices, Collecthions, Inventory, POS, Wallets
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },

    // Invoice Card
    invCard: {
      flexDirection: 'row', backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.md,
      marginBottom: spacing.sm, ...shadow.sm,
    },
    invCardLeft: { flex: 1, gap: 3 },
    invCardRight: { alignItems: 'flex-end', gap: 5, justifyContent: 'center' },
    invNumRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    invNum: { fontSize: fontSize.md, fontWeight: '700', color: colors.cyan },
    syncDot: {
      width: 16, height: 16, borderRadius: 8,
      backgroundColor: colors.orange + '20',
      alignItems: 'center', justifyContent: 'center'
    },
    invPos: { fontSize: fontSize.lg, fontWeight: '700', color: colors.t1 },
    invMeta: { fontSize: fontSize.xs, color: colors.t3 },
    invAmt: { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1 },

    // Collection Card
    colCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm,
    },
    colCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    colNum: { fontSize: fontSize.lg, fontWeight: '700', color: colors.cyan },
    colMethod: { fontSize: fontSize.xs, color: colors.t3, marginTop: 3 },
    colAmt: { fontSize: 22, fontWeight: '900', color: colors.green },
    colDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
    colGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    colGridItem: { backgroundColor: colors.bg2, borderRadius: radius.sm, padding: spacing.sm, minWidth: '45%', flex: 1 },
    colGridLabel: { fontSize: fontSize.xs, color: colors.t3, marginBottom: 2 },
    colGridVal: { fontSize: fontSize.md, fontWeight: '600', color: colors.t1 },
    colNotes: { fontSize: fontSize.xs, color: colors.t3, marginTop: spacing.sm, fontStyle: 'italic' },
    colActions: { gap: spacing.sm, marginTop: spacing.md },

    // Inventory
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    catCard: {
      width: '47.5%', backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', position: 'relative',
    },
    catTotal: { fontSize: 30, fontWeight: '900', color: colors.t1 },
    catName: { fontSize: fontSize.md, fontWeight: '700', color: colors.t2, marginTop: 4, textAlign: 'center' },
    catPrice: { fontSize: fontSize.xs, color: colors.t3, marginTop: 2 },
    catAlert: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },

    batchCard: {
      backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
    },
    batchCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    batchNum: { fontSize: fontSize.xl, fontWeight: '800' },
    batchStats: { flexDirection: 'row', marginBottom: spacing.md },
    batchStat: { flex: 1 },
    batchStatLabel: { fontSize: fontSize.xs, color: colors.t3, marginBottom: 2 },
    batchStatVal: { fontSize: fontSize.lg, fontWeight: '700' },
    catChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
    catChipTxt: { fontSize: fontSize.xs, fontWeight: '700' },

    // POS
    posCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
    },
    posBlocked: { borderColor: colors.red + '50', backgroundColor: colors.red + '05' },
    posCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    posName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.t1 },
    posMeta: { fontSize: fontSize.xs, color: colors.t3, marginTop: 3 },
    posStats: { flexDirection: 'row', marginBottom: spacing.md },
    posActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },

    // Wallets
    walCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
    },
    walCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    walCatName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.t1 },
    walMeta: { fontSize: fontSize.xs, color: colors.t3, marginTop: 3 },
    walStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.md },
    remBadge: {
      alignItems: 'center', justifyContent: 'center',
      padding: spacing.sm, borderRadius: radius.md,
      borderWidth: 1, minWidth: 56,
    },
    remVal: { fontSize: fontSize.xxl, fontWeight: '900' },
    remUnit: { fontSize: fontSize.xs, fontWeight: '600', marginTop: 1 },

    // Tables (Detailed Reports)
    section: { backgroundColor: colors.card, borderRadius: radius.lg, marginVertical: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    tableHeader: { flexDirection: 'row', paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 2, borderBottomColor: colors.border },
    thCell: { fontSize: 11, fontWeight: '900', color: colors.t3, textAlign: 'right' },
    tableRow: { flexDirection: 'row', paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border + '30', alignItems: 'center' },
    tdMain: { fontSize: 13, fontWeight: '700', color: colors.t1, textAlign: 'right' },
    tdSub: { fontSize: 10, color: colors.t3, marginTop: 2, textAlign: 'right' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    modalContent: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.lg, width: '100%', ...shadow.lg },
    sectionTitle: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.t1, marginBottom: spacing.md },
  });
