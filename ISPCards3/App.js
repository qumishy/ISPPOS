import React, { useEffect, useState } from 'react';
import { initDatabase } from './src/services/database';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/services/AuthContext';
import { startNetworkMonitor, stopNetworkMonitor } from './src/services/SyncService';
import { ThemeProvider } from './src/theme/ThemeContext';
import { registerForPushNotificationsAsync } from './src/services/NotificationService';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 🔔 تأخير بسيط لضمان تهيئة المحركات الأصلية (Native Modules)
    const timer = setTimeout(() => {
      registerForPushNotificationsAsync().catch(err => console.log('Notification Init Error:', err));
    }, 2000);

    const init = async () => {
      await initDatabase();
      console.log("  DB INIT DONE");
      startNetworkMonitor(); setReady(true);
    };
    init();

    return () => {
      clearTimeout(timer);
      stopNetworkMonitor();
    };
  }, []);

  if (!ready) return null; //      DB

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
