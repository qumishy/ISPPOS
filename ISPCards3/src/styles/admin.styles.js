// ═══════════════════════════════════════════════════════
//  styles/admin.styles.js
//  أنماط شاشة الإدارة
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },

    // Tab bar
    tabBar: {
      maxHeight: 56, backgroundColor: colors.card,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    tab: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
      borderBottomWidth: 2, borderBottomColor: 'transparent',
      position: 'relative',
    },
    tabAct:       { borderBottomColor: colors.blue, backgroundColor: colors.blue + '0A' },
    tabTxt:       { fontSize: fontSize.sm, color: colors.t3, fontWeight: '600' },
    tabTxtAct:    { color: colors.blue, fontWeight: '700' },
    tabIndicator: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: colors.blue, borderRadius: 1 },

    tabContent: { flex: 1 },

    // Add button
    addBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.blue + '15',
      borderWidth: 1, borderColor: colors.blue + '40', borderRadius: radius.md,
      padding: spacing.md, marginBottom: spacing.md,
      borderStyle: 'dashed',
    },
    addBtnTxt: { color: colors.blue, fontWeight: '700', fontSize: fontSize.md },

    // Form card
    formCard: {
      backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border2,
      borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg,
      ...shadow.sm,
    },
    formTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1, marginBottom: spacing.lg },
    label:     { fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: 7 },

    // Picker
    picker: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.bg2, borderWidth: 1.5, borderColor: colors.border2,
      borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
    },
    pickerOpen: { borderColor: colors.blue },
    pickerTxt:  { fontSize: fontSize.lg, color: colors.t1, flex: 1 },
    dropdown: {
      backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border2,
      borderRadius: radius.md, marginTop: -spacing.md, marginBottom: spacing.md,
      overflow: 'hidden',
      ...shadow.md,
    },
    dropItem:    { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
    dropItemAct: { backgroundColor: colors.blue + '12' },
    dropTxt:     { fontSize: fontSize.lg, color: colors.t1 },

    // List card
    listCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
    },
    userName:  { fontSize: fontSize.lg, fontWeight: '700', color: colors.t1 },
    userMeta:  { fontSize: fontSize.xs, color: colors.t3, marginTop: 3 },
    roleBadge: {
      paddingHorizontal: spacing.sm, paddingVertical: 4,
      borderRadius: radius.full, borderWidth: 1,
    },
    roleTxt:   { fontSize: fontSize.xs, fontWeight: '700' },
    editLink:  { backgroundColor: colors.blue + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
    editLinkTxt: { fontSize: fontSize.xs, color: colors.blue, fontWeight: '600' },
    iconBtn: { padding: 6, backgroundColor: colors.card2, borderRadius: radius.sm },

    // Categories
    catIconBig: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md },

    // Batches
    batchNum:  { fontSize: fontSize.lg, fontWeight: '700', color: colors.cyan },
    availChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
    editLink2: { fontSize: fontSize.sm, color: colors.blue, fontWeight: '700', textDecorationLine: 'underline' },
    batchNote: { fontSize: fontSize.xs, color: colors.t3, marginTop: 4 },

    // Settings
    settingsCard: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm,
    },
    settingsCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
    settingsCardTitle:  { fontSize: fontSize.xl, fontWeight: '800', color: colors.t1 },
    settingsRow:        { justifyContent: 'space-between', paddingVertical: spacing.md },
    settingsRowBorder:  { borderBottomWidth: 1, borderBottomColor: colors.border },
    settingsLabel:      { fontSize: fontSize.md, color: colors.t2 },
    settingsValue:      { fontSize: fontSize.md, fontWeight: '700', color: colors.t1 },
    settingsHint:       { fontSize: fontSize.sm, color: colors.t3, lineHeight: 20, marginBottom: spacing.md },

    // Logout
    logoutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: colors.red + '12', borderWidth: 1, borderColor: colors.red + '40',
      borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.sm,
    },
    logoutTxt: { color: colors.red, fontWeight: '800', fontSize: fontSize.xl },
  });
