import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image, Animated, Easing,
} from 'react-native';
import { useAuth } from '../services/AuthContext';
import { useTheme } from '../theme';
import { makeStyles } from '../styles/login.styles';

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

  const scrollRef = useRef(null);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoAnim, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      Animated.timing(formAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) { setError('يرجى إدخال اسم المستخدم وكلمة المرور'); return; }
    setLoading(true); setError('');
    const result = await login(username.trim(), password);
    setLoading(false);
    if (!result.success) setError(result.error);
  };

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -100}
    >
      {/* Background decorations */}
      <FloatingOrb size={200} color={colors.blue} top={-60} left={-60} delay={0} />
      <FloatingOrb size={150} color={colors.purple} top={200} left={250} delay={800} />
      <FloatingOrb size={120} color={colors.cyan} top={550} left={-40} delay={1600} />
      <FloatingOrb size={180} color={colors.green} top={680} left={180} delay={400} />

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
          <Text style={[s.logoSub, { fontSize: 20, fontWeight: '900', color: colors.blue, marginTop: 15, paddingHorizontal: 10, textAlign: 'center', lineHeight: 30 }]}>نظام إدارة مبيعات كروت الشبكات</Text>

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
              <Text style={{ fontSize: 16 }}>⚠️</Text>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Username */}
          <View style={s.inputGroup}>
            <Text style={s.label}>اسم المستخدم</Text>
            <View style={[s.inputWrap, focusUser && s.inputFocused]}>
              <Text style={s.inputIcon}>👤</Text>
              <TextInput
                style={s.input}
                value={username}
                onChangeText={setUsername}
                placeholder="أدخل اسم المستخدم"
                placeholderTextColor={colors.t3}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => {
                  setFocusUser(true);
                  setTimeout(() => scrollRef.current?.scrollTo({ y: 180, animated: true }), 100);
                }}
                onBlur={() => setFocusUser(false)}
              />
            </View>
          </View>

          {/* Password */}
          <View style={s.inputGroup}>
            <Text style={s.label}>كلمة المرور</Text>
            <View style={[s.inputWrap, focusPass && s.inputFocused]}>
              <Text style={s.inputIcon}>🔒</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="أدخل كلمة المرور"
                placeholderTextColor={colors.t3}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                onFocus={() => {
                  setFocusPass(true);
                  setTimeout(() => scrollRef.current?.scrollTo({ y: 260, animated: true }), 100);
                }}
                onBlur={() => setFocusPass(false)}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={s.eyeBtn}>
                <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[s.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.87}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                <Text style={{ fontSize: 18 }}>🚀</Text>
                <Text style={s.loginBtnText}>دخول</Text>
              </>
            }
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[s.rolesCard, { opacity: formAnim, marginTop: 15, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
          <Text style={{ color: colors.t1, fontSize: 12, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>⚙️ الإشراف والتطوير</Text>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.t3, fontSize: 9 }}>إشراف ودعم</Text>
              <Text style={{ color: colors.t1, fontSize: 11, fontWeight: '700' }}>م/ احمد مكافح</Text>
              <Text style={{ color: colors.blue, fontSize: 10, fontWeight: 'bold' }}>774030881</Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 10, opacity: 0.3 }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.t3, fontSize: 9 }}>تطوير وتصميم</Text>
              <Text style={{ color: colors.t1, fontSize: 11, fontWeight: '700' }}>م/ سالم القميشي</Text>
              <Text style={{ color: colors.cyan, fontSize: 10, fontWeight: 'bold' }}>770726510</Text>
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
