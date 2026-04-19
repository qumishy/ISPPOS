import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useSync } from '../hooks/useSync';
import { colors, radius, fontSize } from '../theme';

export default function SyncBar() {
  const { online, pending, syncing, failed, runSync, retryFailed } = useSync();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (syncing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.92, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [syncing]);

  const states = {
    offline: { bg: '#7f1d1d', border: '#991b1b', icon: '📴', label: 'غير متصل',  action: 'في وضع أوفلاين', dot: colors.red },
    failed:  { bg: '#7f1d1d', border: '#991b1b', icon: '⚠️', label: `${failed} عملية فشلت`, action: 'اضغط للمحاولة', dot: colors.red },
    pending: { bg: '#78350f', border: '#92400e', icon: '📤', label: `${pending} قيد الانتظار`, action: 'اضغط للرفع', dot: colors.orange },
    syncing: { bg: '#1e3a5f', border: '#1d4ed8', icon: '⟳',  label: 'جاري المزامنة...', action: '',              dot: colors.blue },
    done:    { bg: '#064e3b', border: '#065f46', icon: '✓',  label: 'تمت المزامنة',    action: 'اضغط للتحديث',   dot: colors.green },
  };

  const key = !online ? 'offline' : failed > 0 ? 'failed' : syncing ? 'syncing' : pending > 0 ? 'pending' : 'done';
  const st  = states[key];

  return (
    <TouchableOpacity
      style={[s.wrap, { backgroundColor: st.bg, borderColor: st.border }]}
      onPress={failed > 0 ? retryFailed : runSync}
      activeOpacity={0.85}
    >
      <Animated.View style={[s.row, { transform: [{ scale: pulse }] }]}>
        <View style={[s.dotWrap, { backgroundColor: st.dot }]}>
          {syncing
            ? <ActivityIndicator color="#fff" size={10} />
            : <Text style={s.dotIcon}>{st.icon}</Text>
          }
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{st.label}</Text>
          {st.action ? <Text style={s.action}>{st.action}</Text> : null}
        </View>
        {pending > 0 && !syncing && (
          <View style={s.countBadge}>
            <Text style={s.countTxt}>{pending}</Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 14, marginVertical: 8,
    borderRadius: radius.lg, padding: 10,
    borderWidth: 1,
  },
  row:        { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  dotWrap:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotIcon:    { fontSize: 13, color: '#fff' },
  label:      { color: '#fff', fontWeight: '700', fontSize: fontSize.sm, textAlign: 'right' },
  action:     { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, textAlign: 'right', marginTop: 2 },
  countBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  countTxt:   { color: '#fff', fontWeight: '800', fontSize: fontSize.xs },
});
