import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSync } from '../hooks/useSync';

export default function SyncBar() {
  const { online, pending, syncing, failed, runSync, retryFailed } = useSync();

  const bg = !online ? '#7f1d1d' : failed > 0 ? '#b91c1c' : pending > 0 ? '#92400e' : '#065f46';
  const label = !online
    ? 'أوفلاين'
    : syncing
      ? 'جاري المزامنة...'
      : failed > 0
        ? `${failed} عمليات فشلت`
        : pending > 0
          ? `${pending} بانتظار الرفع`
          : 'تمت المزامنة';

  return (
    <TouchableOpacity
      style={[s.wrap, { backgroundColor: bg }]}
      onPress={failed > 0 ? retryFailed : runSync}
      activeOpacity={0.85}
    >
      <View style={s.row}>
        {syncing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.icon}>{online ? (failed > 0 ? '⚠️' : '☁️') : '📴'}</Text>
        )}
        <Text style={s.text}>{label}</Text>
        <Text style={s.action}>{failed > 0 ? 'اضغط لإعادة المحاولة' : 'اضغط للمزامنة'}</Text>
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
