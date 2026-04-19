import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useTheme } from '../theme';
import {
  getLocalWallets, getLocalCategories, getLocalBatches, getLocalPOS, getWalletMovements
} from '../services/database';
import { formatCurrency } from '../utils/helpers';
import { Loading, ScreenHeader } from '../components/UI';
import { makeStyles } from '../styles/main.styles';

export default function WalletDetailScreen({ route, navigation }) {
  const { agentId, name } = route.params;
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ category_id: '', batch_id: '', pos_id: '', date: '' });
  const [totalSummary, setTotalSummary] = useState({ total: 0, sold: 0, rem: 0 });
  const [cats, setCats] = useState([]);
  const [batches, setBatches] = useState([]);
  const [poses, setPoses] = useState([]);

  useEffect(() => {
    async function init() {
      const wallets = await getLocalWallets(agentId);
      const tt = wallets.reduce((a, b) => a + (b.total_cards || 0), 0);
      const ss = wallets.reduce((a, b) => a + (b.sold_cards || 0), 0);
      setTotalSummary({ total: tt, sold: ss, rem: tt - ss });

      const [c, b, p] = await Promise.all([getLocalCategories(), getLocalBatches(), getLocalPOS()]);
      setCats(c || []); setBatches(b || []); setPoses(p || []);
      loadMovements();
    }
    init();
  }, [agentId]);

  const loadMovements = async () => {
    setLoading(true);
    const data = await getWalletMovements(agentId, filters);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { loadMovements(); }, [filters]);

  const filteredSold = items.reduce((acc, it) => acc + (it.quantity || 0), 0);

  return (
    <View style={s.screen}>
      <ScreenHeader 
        title={`حركة مبيعات: ${name}`}
        kpis={[
          { label: 'إجمالي المباع', value: totalSummary.sold, color: colors.orange },
          { label: 'المتبقي', value: totalSummary.rem, color: colors.green },
          { label: 'المباع (المفلتر)', value: filteredSold, color: colors.blue },
        ]}
      />
      
      <View style={{ backgroundColor: colors.bg, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
           <FilterBtn label="📅 التاريخ" onValueChange={v => setFilters({ ...filters, date: v })} options={[{ label: 'كل التواريخ', value: '' }, ...Array.from(new Set(items.map(i => i.invoice_date))).map(d => ({ label: d, value: d } ))]} value={filters.date} s={s} colors={colors} />
           <FilterBtn label="💳 الفئة" onValueChange={v => setFilters({ ...filters, category_id: v })} options={[{ label: 'كل الفئات', value: '' }, ...cats.map(c => ({ label: c.name, value: c.id }))]} value={filters.category_id} s={s} colors={colors} />
           <FilterBtn label="📦 الدفعة" onValueChange={v => setFilters({ ...filters, batch_id: v })} options={[{ label: 'كل الدفعات', value: '' }, ...batches.map(b => ({ label: b.batch_number, value: b.id }))]} value={filters.batch_id} s={s} colors={colors} />
           <FilterBtn label="🏪 النقطة" onValueChange={v => setFilters({ ...filters, pos_id: v })} options={[{ label: 'كل النقاط', value: '' }, ...poses.map(p => ({ label: p.name, value: p.id }))]} value={filters.pos_id} s={s} colors={colors} />
        </ScrollView>
      </View>

      {loading ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
          <View style={[s.section, { padding: 0, marginHorizontal: spacing.md }]}>
            <View style={[s.tableHeader, { backgroundColor: colors.blue + '10' }]}>
              <Text style={[s.thCell, { flex: 1.2 }]}>الفاتورة</Text>
              <Text style={[s.thCell, { flex: 1 }]}>الباقة</Text>
              <Text style={[s.thCell, { flex: 0.6, textAlign: 'center' }]}>الكمية</Text>
              <Text style={[s.thCell, { flex: 1 }]}>العميل</Text>
            </View>
            {items.length === 0 ? <Text style={{ padding: 30, textAlign: 'center', color: colors.t3 }}>لا توجد بيانات</Text> : items.map((it, idx) => (
              <TouchableOpacity key={idx} style={[s.tableRow, idx % 2 === 1 && { backgroundColor: 'rgba(255,255,255,0.03)' }]} onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: it.invoice_id } })}>
                <View style={{ flex: 1.2 }}><Text style={s.tdMain}>{it.invoice_number}</Text><Text style={s.tdSub}>{it.invoice_date}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.tdMain}>{it.category_name}</Text><Text style={s.tdSub}>#{it.batch_number}</Text></View>
                <View style={{ flex: 0.6, alignItems: 'center' }}><Text style={[s.tdMain, { color: colors.orange, fontWeight: '900' }]}>{it.quantity}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.tdMain} numberOfLines={1}>{it.pos_name}</Text></View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function FilterBtn({ label, options, value, onValueChange, colors }) {
  const active = !!value;
  return (
    <TouchableOpacity onPress={() => {
      Alert.alert(label, 'اختر قيمة:', options.map(opt => ({
        text: opt.label + (opt.value === value ? ' ✅' : ''),
        onPress: () => onValueChange(opt.value)
      })).concat([{ text: 'إلغاء', style: 'cancel' }]));
    }} style={{
      backgroundColor: active ? colors.blue : 'rgba(255,255,255,0.08)',
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
      borderWidth: 1, borderColor: active ? colors.blue : 'rgba(255,255,255,0.15)',
      flexDirection: 'row', alignItems: 'center', gap: 5
    }}>
      <Text style={{ color: active ? '#FFF' : colors.t2, fontSize: 12, fontWeight: '700' }}>{label}: {options.find(o => o.value === value)?.label || 'الكل'}</Text>
    </TouchableOpacity>
  );
}
