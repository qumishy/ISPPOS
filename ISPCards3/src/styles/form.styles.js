// ═══════════════════════════════════════════════════════
//  styles/form.styles.js
//  أنماط شاشات النماذج والتفاصيل
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    section: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.sm,
    },
    sectionTitle: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: colors.t1,
      marginBottom: spacing.md,
      textAlign: 'right',
    },
    label: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: colors.t2,
      marginBottom: 6,
      textAlign: 'right',
    },

    // Picker & Dropdown
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 50,
    },
    pickerTxt: { fontSize: fontSize.md, color: colors.t1, textAlign: 'right', flex: 1 },
    dropdown: {
      marginTop: 4,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.md,
      overflow: 'hidden',
    },
    dropItem: {
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dropItemAct: { backgroundColor: colors.blue + '10' },
    dropTxt: { fontSize: fontSize.md, color: colors.t2, textAlign: 'right' },

    // Invoice Specific
    invoiceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.xs,
    },
    invoiceTitle: { fontSize: 24, fontWeight: '900', color: colors.t1 },
    invoiceDate: { fontSize: fontSize.md, color: colors.t3, fontWeight: '600' },

    addItemBox: {
      backgroundColor: colors.bg2,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.sm,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.blue + '50',
    },
    addItemTitle: {
      fontSize: fontSize.md,
      fontWeight: '700',
      color: colors.blue,
      marginBottom: spacing.md,
      textAlign: 'center',
    },

    // Table
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: colors.bg2,
      padding: spacing.sm,
      borderRadius: radius.sm,
      marginBottom: 2,
    },
    thCell: { color: colors.t3, fontWeight: '700', fontSize: 11, textAlign: 'center' },
    tableRow: {
      flexDirection: 'row',
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: 'center',
    },
    tdCell: { fontSize: fontSize.sm, color: colors.t1, textAlign: 'center' },

    totalsBox: {
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 2,
      borderTopColor: colors.border,
    },

    // Info Box
    infoBox: {
      backgroundColor: colors.blue + '08',
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.blue + '20',
    },

    actions: { gap: spacing.md, marginTop: spacing.lg },
  });
