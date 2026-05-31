import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Text, TextInput } from 'react-native';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { useFonts } from 'expo-font';

// ── Patch Text.render to inject fontFamily globally into EVERY Text element.
// defaultProps.style gets overridden when components pass their own style prop,
// so we patch the render method instead to merge fontFamily as a base style.
const _origTextRender = Text.render;
Text.render = function(props, ref) {
  const incomingStyle = props.style || {};
  // Flatten array style or keep object
  const flatStyle = Array.isArray(incomingStyle)
    ? [{ fontFamily: 'IBMPlexSansArabic-Regular' }, ...incomingStyle]
    : [{ fontFamily: 'IBMPlexSansArabic-Regular' }, incomingStyle];
  return _origTextRender.call(this, { ...props, style: flatStyle }, ref);
};

// Same for TextInput
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
import { checkAndApplyUpdateSilently } from './src/services/updateService';
import { LoadingProvider } from './src/services/LoadingContext';
import LoadingOverlay from './src/components/LoadingOverlay';

export default function App() {
  const [ready, setReady] = useState(false);

  const [fontsLoaded] = useFonts({
    'IBMPlexSansArabic-Regular':  IBMPlexSansArabic_400Regular,
    'IBMPlexSansArabic-Medium':   IBMPlexSansArabic_500Medium,
    'IBMPlexSansArabic-SemiBold': IBMPlexSansArabic_600SemiBold,
    'IBMPlexSansArabic-Bold':     IBMPlexSansArabic_700Bold,
    // Map the "Black" / "ExtraBold" slots used by ThemeContext to Bold (700)
    'IBMPlexSansArabic-ExtraBold': IBMPlexSansArabic_700Bold,
    'IBMPlexSansArabic-Black':     IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    const init = async () => {
      console.log('App Startup: Starting DB Init...');
      try {
        await initDatabase();
        console.log("  DB INIT DONE");
        startNetworkMonitor(); 
        checkAndApplyUpdateSilently();
        setReady(true);
        
        // Delay Push Token registration until after DB is ready
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
      }
    };
    init();

    return () => {
      stopNetworkMonitor();
    };
  }, []);

  if (!ready || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

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
