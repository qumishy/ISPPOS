import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TextInput, TouchableOpacity, Linking, Alert } from 'react-native';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { useFonts } from 'expo-font';

// ── Patch Text.render to inject fontFamily globally into EVERY Text element.
const _origTextRender = Text.render;
Text.render = function(props, ref) {
  const incomingStyle = props.style || {};
  const flatStyle = Array.isArray(incomingStyle)
    ? [{ fontFamily: 'IBMPlexSansArabic-Regular' }, ...incomingStyle]
    : [{ fontFamily: 'IBMPlexSansArabic-Regular' }, incomingStyle];
  return _origTextRender.call(this, { ...props, style: flatStyle }, ref);
};

const _origTIRender = TextInput.render;
TextInput.render = function(props, ref) {
  const incomingStyle = props.style || {};
  const flatStyle = Array.isArray(incomingStyle)
    ? [{ fontFamily: 'IBMPlexSansArabic-Regular' }, ...incomingStyle]
    : [{ fontFamily: 'IBMPlexSansArabic-Regular' }, incomingStyle];
  return _origTIRender.call(this, { ...props, style: flatStyle }, ref);
};

import { initDatabase } from './src/services/database';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/services/AuthContext';
import { startNetworkMonitor, stopNetworkMonitor } from './src/services/SyncService';
import { ThemeProvider } from './src/theme/ThemeContext';
import { registerForPushNotificationsAsync } from './src/services/NotificationService';
import {
  checkAndApplyOtaUpdateSilently,
  checkForApkUpdate,
  openUpdateUrl,
  getCachedMandatoryUpdate,
} from './src/services/updateService';
import { LoadingProvider } from './src/services/LoadingContext';
import LoadingOverlay from './src/components/LoadingOverlay';

export default function App() {
  const [ready, setReady] = useState(false);
  const [mandatoryUpdate, setMandatoryUpdate] = useState(null);

  const [fontsLoaded] = useFonts({
    'IBMPlexSansArabic-Regular':  IBMPlexSansArabic_400Regular,
    'IBMPlexSansArabic-Medium':   IBMPlexSansArabic_500Medium,
    'IBMPlexSansArabic-SemiBold': IBMPlexSansArabic_600SemiBold,
    'IBMPlexSansArabic-Bold':     IBMPlexSansArabic_700Bold,
    'IBMPlexSansArabic-ExtraBold': IBMPlexSansArabic_700Bold,
    'IBMPlexSansArabic-Black':     IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    const init = async () => {
      console.log('App Startup: Starting DB Init...');
      try {
        await initDatabase();
        console.log('  DB INIT DONE');
        startNetworkMonitor();

        // OTA JS/assets update (silent, non-blocking)
        checkAndApplyOtaUpdateSilently();

        // APK native update check (non-blocking for optional, blocking for mandatory)
        checkApkUpdateOnStartup();

        setReady(true);

        // Push token registration (delayed)
        setTimeout(async () => {
          try {
            const token = await registerForPushNotificationsAsync();
            if (token) {
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              const stored = await AsyncStorage.getItem('isp_user');
              if (stored) {
                const userData = JSON.parse(stored);
                const { supabase } = require('./src/services/supabase');
                await supabase.from('users').update({ push_token: token }).eq('id', userData.id);
                console.log('[App] Push Token Synced to Supabase');
              }
            }
          } catch (err) {
            console.log('Notification Init Error:', err);
          }
        }, 1000);
      } catch (err) {
        console.log('App Startup: Critical DB Init Error:', err);
        setReady(true); // still allow app to render
      }
    };
    init();

    return () => {
      stopNetworkMonitor();
    };
  }, []);

  const checkApkUpdateOnStartup = async () => {
    try {
      const result = await checkForApkUpdate();
      if (result.isMandatory) {
        setMandatoryUpdate(result.manifest);
      }
    } catch (error) {
      // Offline or error — check cached mandatory state
      console.log('Startup APK check failed (non-blocking):', error?.message);
      try {
        const cached = await getCachedMandatoryUpdate();
        if (cached?.apkUrlValid) {
          setMandatoryUpdate(cached);
        }
      } catch (_) {}
    }
  };

  const onMandatoryUpdatePress = async () => {
    Alert.alert(
      'تنزيل التحديث الإجباري',
      'سيتم فتح رابط تحميل التحديث. بعد اكتمال التنزيل، افتح ملف APK واضغط تثبيت.\n\nإذا لم تظهر شاشة التثبيت، فعّل السماح بتثبيت التطبيقات من هذا المصدر من إعدادات أندرويد، ثم افتح ملف APK مرة أخرى.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'فتح رابط التنزيل',
          onPress: async () => {
            try {
              await openUpdateUrl(mandatoryUpdate.apkUrl);
            } catch (e) {
              console.log('Failed to open update URL:', e?.message);
            }
          },
        },
      ]
    );
  };

  // ── Loading screen ──
  if (!ready || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  // ── Mandatory update blocking screen ──
  if (mandatoryUpdate?.apkUrlValid) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#EF4444', padding: 28, maxWidth: 400, width: '100%' }}>
          <Text style={{ color: '#F87171', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>
            تحديث إجباري
          </Text>
          <Text style={{ color: '#CBD5E1', fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 8 }}>
            يتوفر إصدار جديد ({mandatoryUpdate.latestVersion}) يتطلب تحديثاً إجبارياً.
          </Text>
          <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
            يرجى تحديث التطبيق للمتابعة.
          </Text>
          {mandatoryUpdate.releaseNotes ? (
            <Text style={{ color: '#64748B', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 16 }}>
              {mandatoryUpdate.releaseNotes}
            </Text>
          ) : null}
          <Text style={{ color: '#94A3B8', fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 16 }}>
            بعد التنزيل، افتح ملف APK من التنزيلات واضغط تثبيت.
          </Text>
          <TouchableOpacity
            onPress={onMandatoryUpdatePress}
            style={{
              backgroundColor: '#EF4444',
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>تحديث الآن</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Normal app ──
  return (
    <ThemeProvider>
      <LoadingProvider>
        <AuthProvider>
          <AppNavigator />
          <LoadingOverlay />
        </AuthProvider>
      </LoadingProvider>
    </ThemeProvider>
  );
}
