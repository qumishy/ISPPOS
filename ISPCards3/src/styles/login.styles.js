// ═══════════════════════════════════════════════════════
//  styles/login.styles.js
//  أنماط شاشة تسجيل الدخول
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen:  { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.xl, paddingTop: 80, paddingBottom: 40, flexGrow: 1 },

    // Logo
    logoWrap: { alignItems: 'center', marginBottom: 32 },
    logoIconWrap: {
      position: 'relative', marginBottom: spacing.lg,
      alignItems: 'center', justifyContent: 'center',
    },
    logoImg: {
      width: 96, height: 96, borderRadius: 24,
      borderWidth: 2, borderColor: colors.blue + '50',
    },
    logoGlow: {
      position: 'absolute', width: 120, height: 120, borderRadius: 60,
      backgroundColor: colors.blue, opacity: 0.08,
    },
    logoTitle: { fontSize: 26, fontWeight: '900', color: colors.t1, letterSpacing: -0.5, marginBottom: 6 },
    logoSub:   { fontSize: fontSize.md, color: colors.t2, textAlign: 'center', lineHeight: 20 },
    version: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginTop: 12, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 5,
      borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    },
    versionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
    versionTxt: { fontSize: fontSize.xs, color: colors.t3, fontWeight: '600' },

    // Form Card
    formCard: {
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border2,
      borderRadius: radius.xl,
      padding: spacing.xl,
      marginBottom: spacing.lg,
      ...shadow.md,
    },
    formTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.t1, textAlign: 'center', marginBottom: 4 },
    formSub:   { fontSize: fontSize.sm,  color: colors.t3,  textAlign: 'center', marginBottom: spacing.xl },

    // Error
    errorBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.red + '12',
      borderWidth: 1, borderColor: colors.red + '40',
      borderRadius: radius.md, padding: spacing.md,
      marginBottom: spacing.lg,
    },
    errorText: { color: colors.red, fontSize: fontSize.sm, fontWeight: '600', flex: 1, textAlign: 'right' },

    // Inputs
    inputGroup: { marginBottom: spacing.lg },
    label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: 8, textAlign: 'right' },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.bg2,
      borderWidth: 1.5, borderColor: colors.border2,
      borderRadius: radius.md, paddingHorizontal: spacing.md,
    },
    inputFocused: { borderColor: colors.blue, backgroundColor: colors.bg3 },
    inputIcon: { fontSize: 18, marginLeft: spacing.sm },
    input: {
      flex: 1, color: colors.t1, fontSize: fontSize.xl,
      paddingVertical: 13, textAlign: 'right',
    },
    eyeBtn: { padding: spacing.sm },

    // Login button
    loginBtn: {
      backgroundColor: colors.blue,
      borderRadius: radius.md, paddingVertical: 15,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: spacing.sm,
      ...shadow.blue,
    },
    loginBtnText: { color: '#fff', fontSize: fontSize.xl, fontWeight: '800', letterSpacing: 0.5 },

    // Roles card
    rolesCard: {
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.xl, padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    rolesTitle:   { fontSize: fontSize.md,  fontWeight: '700', color: colors.t2, textAlign: 'center' },
    rolesDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
    roleItem: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingVertical: spacing.md,
    },
    roleItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    roleIconWrap: {
      width: 44, height: 44, borderRadius: radius.md,
      alignItems: 'center', justifyContent: 'center',
    },
    roleName: { fontSize: fontSize.md, fontWeight: '700', marginBottom: 2 },
    roleDesc: { fontSize: fontSize.xs, color: colors.t3, lineHeight: 16 },

    footer: { textAlign: 'center', color: colors.t4, fontSize: fontSize.xs, marginTop: 8 },
  });
