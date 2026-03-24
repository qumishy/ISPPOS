import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSync } from '../hooks/useSync';

export default function SyncBar() {
  const { online, pending, syncing, runSync } = useSync();

  const bg = !online ? '#7f1d1d' : pending > 0 ? '#92400e' : '#065f46';
  const label = !online
    ? 'أوفلاين'
    : syncing
      ? 'جاري المزامنة...'
      : pending > 0
        ? `${pending} بانتظار الرفع`
        : 'تمت المزامنة';

  return (
    <TouchableOpacity
      style={[s.wrap, { backgroundColor: bg }]}
      onPress={runSync}
      activeOpacity={0.85}
    >
      <View style={s.row}>
        {syncing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.icon}>{online ? '☁️' : '📴'}</Text>
        )}
        <Text style={s.text}>{label}</Text>
        <Text style={s.action}>اضغط للمزامنة</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginVertical: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 16,
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },
  action: {
    color: '#fff',
    opacity: 0.9,
    fontSize: 12,
  },
});
