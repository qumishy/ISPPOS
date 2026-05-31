import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image, Animated, Easing,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../services/AuthContext';
import { useTheme } from '../theme';
import { makeStyles } from '../styles/login.styles';
import { useLoading } from '../services/LoadingContext';


// Animated floating circle decoration
function FloatingOrb({ size, color, top, left, delay }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }, delay || 0);
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] });

  return (
    <Animated.View style={{
      position: 'absolute', top, left,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, transform: [{ translateY }], opacity,
    }} />
  );
}

export default function LoginScreen() {
  const { login } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();

  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [focusUser, setFocusUser] = useState(false);
  const [focusPass, setFocusPass] = useState(false);

  // Entrance animations
  const logoAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const loginScale = useRef(new Animated.Value(1)).current;

  const scrollRef = useRef(null);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoAnim, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      Animated.timing(formAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) { setError('يرجى إدخال اسم المستخدم وكلمة المرور'); return; }
    showLoading('جاري التحقق من الحساب...'); setError('');
    const result = await login(username.trim(), password);
    hideLoading();
    if (!result.success) setError(result.error);
  };

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -100}
    >
      {/* Background decorations */}
      <FloatingOrb size={200} color={colors.primary} top={-60} left={-60} delay={0} />
      <FloatingOrb size={150} color={colors.purple} top={200} left={250} delay={800} />
      <FloatingOrb size={120} color={colors.cyan} top={550} left={-40} delay={1600} />
      <FloatingOrb size={180} color={colors.success} top={680} left={180} delay={400} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Logo Block */}
        <Animated.View style={[s.logoWrap, {
          opacity: logoAnim,
          transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
        }]}>
          <View style={s.logoIconWrap}>
            <Image
              source={require('../../assets/icon.png')}
              style={s.logoImg}
              resizeMode="contain"
            />
            <View style={s.logoGlow} />
          </View>
          <Text style={[s.logoTitle, { marginTop: 30 }]}>ISP Cards System</Text>
          <Text style={[s.logoSub, { fontSize: 20, fontWeight: '900', color: colors.primary, marginTop: 15, paddingHorizontal: 10, textAlign: 'center', lineHeight: 30 }]}>نظام إدارة مبيعات كروت الشبكات</Text>

        </Animated.View>

        {/* ── Form Card */}
        <Animated.View style={[s.formCard, {
          opacity: formAnim,
          transform: [{ translateY: formAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        }]}>
          <Text style={s.formTitle}>تسجيل الدخول</Text>
          <Text style={s.formSub}>أدخل بياناتك للمتابعة</Text>

          {/* Error */}
          {error ? (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={18} color={colors.danger} style={{ marginLeft: 6 }} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Username */}
          <View style={s.inputGroup}>
            <Text style={s.label}>اسم المستخدم</Text>
            <View style={[s.inputWrap, focusUser && s.inputFocused]}>
              <Feather name="user" size={18} color={focusUser ? colors.primary : colors.t3} style={{ marginLeft: spacing.sm }} />
              <TextInput
                style={s.input}
                value={username}
                onChangeText={(t) => { setUsername(t); if(error) setError(''); }}
                placeholder="اسم المستخدم"
                placeholderTextColor={colors.t3}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => {
                  setFocusUser(true);
                  setTimeout(() => scrollRef.current?.scrollTo({ y: 150, animated: true }), 100);
                }}
                onBlur={() => setFocusUser(false)}
              />
            </View>
          </View>

          {/* Password */}
          <View style={s.inputGroup}>
            <Text style={s.label}>كلمة المرور</Text>
            <View style={[s.inputWrap, focusPass && s.inputFocused]}>
              <Feather name="lock" size={18} color={focusPass ? colors.primary : colors.t3} style={{ marginLeft: spacing.sm }} />
              <TextInput
                style={s.input}
                value={password}
                onChangeText={(t) => { setPassword(t); if(error) setError(''); }}
                placeholder="كلمة المرور"
                placeholderTextColor={colors.t3}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                onFocus={() => {
                  setFocusPass(true);
                  setTimeout(() => scrollRef.current?.scrollTo({ y: 220, animated: true }), 100);
                }}
                onBlur={() => setFocusPass(false)}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={s.eyeBtn}>
                <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color={colors.t3} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <Animated.View style={{ transform: [{ scale: loginScale }] }}>
            <TouchableOpacity
              style={[s.loginBtn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.87}
              onPressIn={() => Animated.spring(loginScale, { toValue: 0.96, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(loginScale, { toValue: 1, useNativeDriver: true }).start()}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.loginBtnText}>دخول آمن</Text>
              }
            </TouchableOpacity>
          </Animated.View>

        </Animated.View>

        <Animated.View style={[s.rolesCard, { opacity: formAnim, marginTop: 15, padding: 12, backgroundColor: colors.bg2 }]}>
          <Text style={{ color: colors.t1, fontSize: 13, fontWeight: '800', marginBottom: 12, textAlign: 'center' }}>الإشراف والتطوير</Text>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Feather name="headphones" size={18} color={colors.primary} style={{ marginBottom: 4 }} />
              <Text style={{ color: colors.t3, fontSize: 10 }}>إشراف ودعم</Text>
              <Text style={{ color: colors.t1, fontSize: 12, fontWeight: '700' }}>م/ احمد مكافح</Text>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: 'bold' }}>774030881</Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 10 }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Feather name="code" size={18} color={colors.cyan} style={{ marginBottom: 4 }} />
              <Text style={{ color: colors.t3, fontSize: 10 }}>تطوير وتصميم</Text>
              <Text style={{ color: colors.t1, fontSize: 12, fontWeight: '700' }}>م/ سالم القميشي</Text>
              <Text style={{ color: colors.cyan, fontSize: 11, fontWeight: 'bold' }}>770726510</Text>
            </View>
          </View>
        </Animated.View>

        <View style={[s.version, { marginTop: 15, marginBottom: 5, alignSelf: 'center' }]}>
          <View style={s.versionDot} />
          <Text style={s.versionTxt}>الإصدار 1.0.0</Text>
        </View>

        <Text style={s.footer}>Smart POS Net © 2026</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
