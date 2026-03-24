import React, { useEffect, useState } from 'react';
import { initDatabase } from './src/services/database';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/services/AuthContext';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initDatabase();
      console.log(" DB INIT DONE");
      setReady(true);   //       DB
    };
    init();
  }, []);

  if (!ready) return null; //      DB

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
