// ═══════════════════════════════════════════════════════
//  styles/login.styles.js
//  أنماط شاشة تسجيل الدخول
// ═══════════════════════════════════════════════════════
import { StyleSheet } from 'react-native';

export const makeStyles = (colors, spacing, radius, fontSize, shadow) =>
  StyleSheet.create({
    screen:  { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.xl, paddingTop: 60, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' },

    // Logo
    logoWrap: { alignItems: 'center', marginBottom: 32 },
    logoIconWrap: {
      position: 'relative', marginBottom: spacing.lg,
      alignItems: 'center', justifyContent: 'center',
    },
    logoImg: {
      width: 96, height: 96, borderRadius: 24,
      borderWidth: 2, borderColor: colors.primary + '50',
    },
    logoGlow: {
      position: 'absolute', width: 120, height: 120, borderRadius: 60,
      backgroundColor: colors.primary, opacity: 0.08,
    },
    logoTitle: { fontSize: 26, fontFamily: 'IBMPlexSansArabic-Black', fontWeight: '900', color: colors.t1, letterSpacing: -0.5, marginBottom: 6 },
    logoSub:   { fontSize: fontSize.md, color: colors.t2, textAlign: 'center', lineHeight: 20 },
    version: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginTop: 12, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 5,
      borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    },
    versionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
    versionTxt: { fontSize: fontSize.xs, color: colors.t3, fontWeight: '600' },

    // Form Card
    formCard: {
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: 28,
      padding: spacing.xl,
      marginBottom: spacing.lg,
      ...shadow.lg,
    },
    formTitle: { fontSize: fontSize.xxl, fontFamily: 'IBMPlexSansArabic-Bold', fontWeight: '800', color: colors.t1, textAlign: 'center', marginBottom: 4 },
    formSub:   { fontSize: fontSize.sm,  color: colors.t3,  textAlign: 'center', marginBottom: spacing.xl },

    // Error
    errorBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.danger + '12',
      borderWidth: 1, borderColor: colors.danger + '40',
      borderRadius: radius.md, padding: spacing.md,
      marginBottom: spacing.lg,
    },
    errorText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600', flex: 1, textAlign: 'right' },
    recoveryWarningBox: {
      flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
      backgroundColor: colors.warning + '12',
      borderWidth: 1, borderColor: colors.warning + '45',
      borderRadius: radius.md, padding: spacing.md,
      marginBottom: spacing.lg,
    },
    recoveryWarningText: { color: colors.t1, fontSize: fontSize.sm, fontWeight: '600', flex: 1, textAlign: 'right' },
    recoverySuccessBox: {
      flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
      backgroundColor: colors.success + '12',
      borderWidth: 1, borderColor: colors.success + '45',
      borderRadius: radius.md, padding: spacing.md,
      marginBottom: spacing.lg,
    },
    recoverySuccessText: { color: colors.success, fontSize: fontSize.sm, fontWeight: '700', flex: 1, textAlign: 'right' },

    // Inputs
    inputGroup: { marginBottom: spacing.lg },
    label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: 8, textAlign: 'right' },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.bg,
      borderWidth: 1.5, borderColor: colors.border,
      borderRadius: 16, paddingHorizontal: spacing.md,
      height: 56,
    },
    inputFocused: { borderColor: colors.primary, backgroundColor: colors.bg2, ...shadow.sm },
    inputIcon: { fontSize: 18, marginLeft: spacing.sm },
    input: {
      flex: 1, color: colors.t1, fontSize: 16,
      textAlign: 'right', height: '100%',
    },
    eyeBtn: { padding: spacing.sm },

    // Login button
    loginBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16, height: 56,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      marginTop: spacing.sm,
      ...shadow.blue,
    },
    loginBtnText: { color: '#fff', fontSize: 18, fontFamily: 'IBMPlexSansArabic-Bold', fontWeight: '800' },
    projectList: { gap: spacing.sm, marginBottom: spacing.lg },
    projectCard: {
      minHeight: 74,
      flexDirection: 'row-reverse',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.bg,
      padding: spacing.md,
    },
    projectCardSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '0D' },
    projectRadio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.md,
    },
    projectRadioSelected: { borderColor: colors.primary },
    projectRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    projectDetails: { flex: 1 },
    projectTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    projectName: { color: colors.t1, fontSize: fontSize.md, fontFamily: 'IBMPlexSansArabic-Bold', textAlign: 'right' },
    projectLicense: { color: colors.t3, fontSize: fontSize.xs, marginTop: 4, textAlign: 'right' },
    lastProjectBadge: {
      color: colors.primary,
      backgroundColor: colors.primary + '14',
      borderRadius: radius.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
      fontSize: 10,
      fontFamily: 'IBMPlexSansArabic-SemiBold',
    },
    backToLoginBtn: {
      flexDirection: 'row-reverse',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      paddingTop: spacing.lg,
    },
    backToLoginText: { color: colors.t2, fontSize: fontSize.sm, fontFamily: 'IBMPlexSansArabic-SemiBold' },
    repairLoginBtn: {
      flexDirection: 'row-reverse',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
    },
    repairLoginText: { color: colors.primary, fontSize: fontSize.sm, fontFamily: 'IBMPlexSansArabic-SemiBold' },

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
