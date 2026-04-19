import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';

export default function ExportCsvButton({ onPress, label = 'تصدير CSV' }) {
  return (
    <TouchableOpacity
      style={s.btn}
      onPress={async () => {
        try {
          await onPress?.();
        } catch (e) {
          Alert.alert('خطأ', e?.message || 'تعذر التصدير');
        }
      }}
      activeOpacity={0.85}
    >
      <Text style={s.txt}>📤 {label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    backgroundColor: '#0f766e',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  txt: {
    color: '#fff',
    fontWeight: '800',
  },
});
