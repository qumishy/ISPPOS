// ═══════════════════════════════════════════════════════
//  styles/form.styles.js
//  أنماط شاشات النماذج والتفاصيل — High-End ERP Edition
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    section: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: spacing.xl,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'visible',
      ...shadow.sm,
    },
    sectionTitle: {
      fontSize: fontSize.xl,
      fontWeight: '900',
      color: colors.t1,
      marginBottom: spacing.lg,
      textAlign: 'right',
      letterSpacing: -0.3,
    },
    label: {
      fontSize: fontSize.sm,
      fontWeight: '800',
      color: colors.t2,
      marginBottom: spacing.sm,
      textAlign: 'right',
    },

    // Picker & Dropdown
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg2,
      borderWidth: 1,
      borderColor: colors.border2,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      height: 52,
    },
    pickerTxt: { fontSize: fontSize.lg, color: colors.t1, textAlign: 'right', flex: 1, fontWeight: '600' },
    dropdown: {
      marginTop: spacing.xs,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border2,
      ...shadow.lg,
      overflow: 'hidden',
    },
    dropItem: {
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dropItemAct: { backgroundColor: colors.primary + '10' },
    dropTxt: { fontSize: fontSize.lg, color: colors.t1, textAlign: 'right', fontWeight: '600' },

    // Invoice Specific
    invoiceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xl,
      paddingHorizontal: spacing.sm,
    },
    invoiceTitle: { fontSize: fontSize.h, fontWeight: '900', color: colors.t1, letterSpacing: -0.5 },
    invoiceDate: { fontSize: fontSize.md, color: colors.t3, fontWeight: '700' },

    addItemBox: {
      backgroundColor: colors.bg2,
      borderRadius: radius.lg,
      padding: spacing.xl,
      marginTop: spacing.sm,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: colors.primary + '40',
      alignItems: 'center'
    },
    addItemTitle: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      color: colors.primary,
      textAlign: 'center',
    },

    // Table
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: colors.bg2,
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: 4,
    },
    thCell: { color: colors.t3, fontWeight: '800', fontSize: fontSize.xs, textAlign: 'center' },
    tableRow: {
      flexDirection: 'row',
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: 'center',
    },
    tdCell: { fontSize: fontSize.md, color: colors.t1, textAlign: 'center', fontWeight: '700' },

    totalsBox: {
      marginTop: spacing.xl,
      paddingTop: spacing.xl,
      borderTopWidth: 2,
      borderTopColor: colors.border,
    },

    // Info Box
    infoBox: {
      backgroundColor: colors.primary + '08',
      borderRadius: radius.lg,
      padding: spacing.xl,
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: colors.primary + '20',
    },

    actions: { gap: spacing.md, marginTop: spacing.xl },
  });
