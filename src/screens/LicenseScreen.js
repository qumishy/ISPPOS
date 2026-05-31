import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useAuth } from '../services/AuthContext';
import { useTheme } from '../theme';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function LicenseScreen({ navigation }) {
  const [license, setLicense] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { loginWithLicense } = useAuth();
  const { colors, fontSize, isDark } = useTheme();

  const handleVerify = async () => {
    if (!license.trim()) {
      setErrorMsg('الرجاء إدخال رقم الترخيص');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    
    const result = await loginWithLicense(license.trim());
    if (result.success) {
      navigation.replace('Login');
    } else {
      setErrorMsg(result.error);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <LinearGradient colors={isDark ? [colors.bg, colors.bg2] : [colors.primary, colors.primary + 'CC']} style={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.headerIcon}>
            <Feather name="shield" size={48} color={colors.primary} />
          </View>
          
          <Text style={[styles.title, { color: colors.t1, fontSize: fontSize.xxl }]}>تسجيل الترخيص</Text>
          <Text style={[styles.subtitle, { color: colors.t2, fontSize: fontSize.md }]}>أدخل رقم الترخيص الخاص بمشروعك للبدء.</Text>
          
          {errorMsg ? (
            <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '30' }]}>
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={[styles.inputContainer, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Feather name="key" size={20} color={colors.t3} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.t1, fontSize: fontSize.lg }]}
              placeholder="مثال: PRJ-XXXX-YYYY"
              placeholderTextColor={colors.t3}
              value={license}
              onChangeText={setLicense}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleVerify}
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleVerify}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>التحقق من الترخيص</Text>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  headerIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(24, 119, 242, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: 'IBMPlexSansArabic-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'IBMPlexSansArabic-Regular',
    textAlign: 'center',
    marginBottom: 32,
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    width: '100%',
  },
  errorText: {
    fontFamily: 'IBMPlexSansArabic-Medium',
    fontSize: 13,
    marginRight: 8,
  },
  inputContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 60,
    marginBottom: 24,
    width: '100%',
  },
  inputIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    fontFamily: 'IBMPlexSansArabic-Medium',
    textAlign: 'right',
  },
  btn: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'IBMPlexSansArabic-Bold',
  },
});
