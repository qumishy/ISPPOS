import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { syncAll } from '../services/SyncService';

export default function SyncScreen({ navigation }) {

  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState('جاري بدء المزامنة...');

  useEffect(() => {
    startSync();
  }, []);

  const startSync = async () => {
    try {

      setMsg('الاتصال بالسيرفر...');
      setProgress(20);

      await new Promise(r => setTimeout(r, 300));

      setMsg('جلب البيانات...');
      setProgress(50);

      await syncAll(); // ✅ مرة واحدة فقط

      setMsg('تحديث البيانات...');
      setProgress(80);

      await new Promise(r => setTimeout(r, 300));

      setProgress(100);
      setMsg('تم بنجاح ✅');

      // ⏱️ نعطي UI فرصة يظهر النجاح
      setTimeout(() => {
        navigation.replace('MainApp'); // ✅ الحل الصحيح
      }, 500);

    } catch (e) {
      setMsg('فشل المزامنة ❌');
      console.log(e);
    }
  };

  return (
    <View style={{
      flex:1,
      justifyContent:'center',
      alignItems:'center',
      backgroundColor:'#0f172a'
    }}>

      <ActivityIndicator size="large" color="#3b82f6" />

      <Text style={{
        color:'#fff',
        marginTop:20,
        fontSize:16
      }}>
        {msg}
      </Text>

      <View style={{
        width:'80%',
        height:10,
        backgroundColor:'#1e293b',
        borderRadius:10,
        marginTop:20
      }}>
        <View style={{
          width:`${progress}%`,
          height:10,
          backgroundColor:'#3b82f6',
          borderRadius:10
        }}/>
      </View>

    </View>
  );
}
