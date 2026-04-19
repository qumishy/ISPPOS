import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useTheme } from '../theme';
import { getLocalPOS, toggleLocalPOSBlock, subscribeDataChanges } from '../services/database';
import { formatCurrency, creditPercent, creditColor } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, ProgressBar, Avatar, ScreenHeader } from '../components/UI';
import { makeStyles } from '../styles/main.styles';

export default function POSScreen({ navigation }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try { const d = await getLocalPOS(); setPos(d || []); } catch (e) { }
    setLoading(false); setRefreshing(false);
  }, []);
  
  useEffect(() => { 
    load(); 
    const unsub = subscribeDataChanges(e => { if (['pos_customers', 'all'].includes(e.type)) load(); });
    return unsub;
  }, [load]);

  const handleToggleBlock = (id, name, blocked) =>
    Alert.alert(blocked ? 'رفع الحجب' : 'حجب نقطة البيع', blocked ? `رفع الحجب عن "${name}"؟` : `حجب "${name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: blocked ? 'رفع الحجب' : 'حجب', style: blocked ? 'default' : 'destructive', onPress: async () => { await toggleLocalPOSBlock(id, !blocked); load(); } },
    ]);

  const filtered = pos.filter(p => !search || JSON.stringify(p).toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={s.screen}>
      <ScreenHeader
        kpis={[
          { label: 'إجمالي النقاط', value: pos.length, color: colors.blue },
          { label: 'نشط', value: pos.filter(p => !p.is_blocked).length, color: colors.green },
          { label: 'محجوب', value: pos.filter(p => p.is_blocked).length, color: colors.red },
        ]}
        search={search} onSearch={setSearch}
        action="+ إضافة نقطة"
        onAction={() => navigation.navigate('POSTab', { screen: 'NewPOS' })}
      />
      {loading ? <Loading /> : filtered.length === 0
        ? <Empty icon="🏪" title="لا توجد نقاط بيع" action="+ نقطة بيع جديدة" onAction={() => navigation.navigate('POSTab', { screen: 'NewPOS' })} />
        : <FlatList
          data={filtered} keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
          renderItem={({ item: p }) => {
            const pct = creditPercent(p.credit_used, p.credit_limit);
            const col = creditColor(pct, p.is_blocked);
            return (
              <TouchableOpacity style={[s.posCard, p.is_blocked && s.posBlocked]} activeOpacity={0.87} onPress={() => navigation.navigate('POSTab', { screen: 'EditPOS', params: { id: p.id } })}>
                <View style={s.posCardTop}>
                  <Avatar name={p.name} color={p.is_blocked ? colors.red : col} size={48} />
                  <View style={{ flex: 1, marginRight: spacing.md }}>
                    <Text style={s.posName}>{p.name}</Text>
                    <Text style={s.posMeta}>{p.owner_name || '—'} · {p.city || '—'}</Text>
                  </View>
                  <Badge status={p.is_blocked ? 'محجوب' : pct >= 80 ? 'تحذير' : 'نشط'} />
                </View>
                <View style={s.posStats}>
                  {[{ l: 'مستخدم', v: formatCurrency(p.credit_used), c: colors.orange },{ l: 'الحد', v: formatCurrency(p.credit_limit), c: colors.t1 },{ l: '%', v: `${pct}%`, c: col }].map((st, i) => (
                    <View key={i} style={{ flex: 1 }}><Text style={{ fontSize: fontSize.xs, color: colors.t3 }}>{st.l}</Text><Text style={{ fontSize: fontSize.md, fontWeight: '700', color: st.c }}>{st.v}</Text></View>
                  ))}
                </View>
                <ProgressBar percent={pct} color={col} height={5} />
                <View style={s.posActions}>
                  <Btn label="✏️ تعديل" variant="glass" size="xs" style={{ flex: 1 }} onPress={() => navigation.navigate('POSTab', { screen: 'EditPOS', params: { id: p.id } })} />
                  <Btn label={p.is_blocked ? '✓ رفع الحجب' : '✗ حجب'} variant={p.is_blocked ? 'success' : 'danger'} size="xs" style={{ flex: 1 }} onPress={() => handleToggleBlock(p.id, p.name, p.is_blocked)} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      }
    </View>
  );
}
