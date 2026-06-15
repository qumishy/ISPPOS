import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { getLocalWallets, getLocalCategories, getLocalBatches, getLocalPOS, getWalletMovements } from '../services/database';
import { formatCurrency } from '../utils/helpers';
import { Loading, ScreenHeader, Picker, Input, Row } from '../components/UI';
import { makeStyles } from '../styles/main.styles';
import { useAuth } from '../services/AuthContext';


const COLS = [
  { key: 'invoice_number', label: 'الفاتورة', w: 100 },
  { key: 'invoice_date', label: 'التاريخ', w: 100 },
  { key: 'category_name', label: 'الفئة', w: 120 },
  { key: 'batch_number', label: 'رقم الدفعة', w: 110 },
  { key: 'quantity', label: 'الكمية', w: 80 },
  { key: 'pos_name', label: 'نقطة البيع', w: 150 },
  { key: 'distributor_name', label: 'الموزع', w: 120 },
];
export default function WalletDetailScreen({ route, navigation }) {
  const { agentId, name } = route.params;
  const { projectId, selectedPhase, allPhases } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ category_id: '', batch_id: '', pos_id: '', date: '', phase_id: '' });
  const [search, setSearch] = useState('');
  const [filterVisible, setFilterVisible] = useState(false);
  const [totalSummary, setTotalSummary] = useState({ total: 0, sold: 0, rem: 0 });
  const [cats, setCats] = useState([]);
  const [batches, setBatches] = useState([]);
  const [poses, setPoses] = useState([]);

  const [sortKey, setSortKey] = useState('invoice_date');
  const [sortAsc, setSortAsc] = useState(false);

  const activeCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    setFilters(prev => {
      const nextPhaseId = selectedPhase?.id || '';
      if (prev.phase_id === nextPhaseId) return prev;
      return { ...prev, phase_id: nextPhaseId };
    });
  }, [selectedPhase?.id]);

  useEffect(() => {
    async function init() {
      if (!projectId) return;
      const wallets = await getLocalWallets(agentId, projectId);
      const activeWallets = wallets.filter(w => (w.total_cards || 0) - (w.sold_cards || 0) > 0);
      const tt = activeWallets.reduce((a, b) => a + (b.total_cards || 0), 0);
      const ss = activeWallets.reduce((a, b) => a + (b.sold_cards || 0), 0);
      setTotalSummary({ total: tt, sold: ss, rem: tt - ss });

      const [c, b, p] = await Promise.all([
        getLocalCategories(projectId),
        getLocalBatches(projectId),
        getLocalPOS(projectId)
      ]);
      setCats(c || []); setBatches(b || []); setPoses(p || []);
      loadMovements();
    }
    init();
  }, [agentId, projectId]);

  const loadMovements = async () => {
    setLoading(true);
    const data = await getWalletMovements(agentId, { ...filters, project_id: projectId });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { loadMovements(); }, [filters]);

  const filteredItems = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(it => COLS.some(col => String(it[col.key] ?? '').toLowerCase().includes(q)));
    }
    return r.sort((a, b) => {
      let va = a[sortKey] || '';
      let vb = b[sortKey] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (sortKey === 'quantity') {
        va = Number(va);
        vb = Number(vb);
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [items, search, sortKey, sortAsc]);

  const filteredSold = filteredItems.reduce((acc, it) => acc + (it.quantity || 0), 0);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={`مبيعات: ${name}`}
        kpis={[
          { label: 'إجمالي المباع', value: totalSummary.sold, color: colors.orange },
          { label: 'المتبقي', value: totalSummary.rem, color: colors.green },
          { label: 'المباع (المفلتر)', value: filteredSold, color: colors.blue },
        ]}
      />

      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg2, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
            <Feather name="search" size={16} color={colors.t3} />
            <TextInput 
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: colors.t1, fontSize: 13, textAlign: 'right' }} 
              placeholder="بحث سريع في النتائج..." 
              placeholderTextColor={colors.t3} 
              value={search} 
              onChangeText={setSearch} 
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Feather name="x-circle" size={16} color={colors.t3} />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={() => setFilterVisible(true)}
            style={{
              width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center',
              backgroundColor: activeCount > 0 ? colors.blue : colors.bg2,
              borderWidth: 1, borderColor: activeCount > 0 ? colors.blue : colors.border,
            }}
          >
            <View style={{ alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <View style={{ width: 18, height: 2, backgroundColor: activeCount > 0 ? '#fff' : colors.t2, borderRadius: 1 }} />
              <View style={{ width: 13, height: 2, backgroundColor: activeCount > 0 ? '#fff' : colors.t2, borderRadius: 1 }} />
              <View style={{ width: 8, height: 2, backgroundColor: activeCount > 0 ? '#fff' : colors.t2, borderRadius: 1 }} />
            </View>
            {activeCount > 0 && (
              <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', borderRadius: 6, width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>{activeCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {loading ? <Loading /> : (
        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
          <View>
            <View style={{ flexDirection: 'row', backgroundColor: '#1e3a5f' }}>
              {COLS.map((col) => (
                <TouchableOpacity key={col.key} onPress={() => toggleSort(col.key)} style={{ width: col.w, padding: 10, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)', borderBottomWidth: 2, borderBottomColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#e2e8f0', textAlign: 'center' }}>{col.label}</Text>
                  {sortKey === col.key && (
                    <Feather name={sortAsc ? 'chevron-up' : 'chevron-down'} size={12} color="#e2e8f0" style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ paddingBottom: 50 }}>
              {filteredItems.length === 0 ? <Text style={{ padding: 30, textAlign: 'center', color: colors.t3 }}>لا توجد بيانات</Text> : filteredItems.map((it, idx) => (
                <View key={idx} style={{ flexDirection: 'row', backgroundColor: idx % 2 === 0 ? colors.card : colors.bg2, borderBottomWidth: 1, borderBottomColor: colors.border + '25' }}>
                  {COLS.map(col => {
                    const isQty = col.key === 'quantity';
                    let v = it[col.key];
                    if (col.key === 'distributor_name' && !v) v = 'الإدارة';
                    return (
                      <View key={col.key} style={{ width: col.w, padding: 8, borderRightWidth: 1, borderRightColor: colors.border + '35', justifyContent: 'center', alignItems: isQty ? 'center' : 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: isQty ? colors.orange : colors.t1, fontWeight: isQty ? '900' : 'normal' }} numberOfLines={1}>{v ?? '—'}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {!loading && filteredItems.length > 0 && (
        <View style={{ backgroundColor: colors.card, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 5 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: colors.t3, marginBottom: 4, fontWeight: '700' }}>إجمالي الأوراق المباعة</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.blue }}>{filteredItems.reduce((a, b) => a + (b.quantity || 0), 0)}</Text>
          </View>
          <View style={{ width: 1, height: 30, backgroundColor: colors.border }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: colors.t3, marginBottom: 4, fontWeight: '700' }}>القيمة الإجمالية</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.green }}>{formatCurrency(filteredItems.reduce((a, b) => a + (b.total_price || 0), 0))}</Text>
          </View>
        </View>
      )}

      <FilterSheet 
        visible={filterVisible} 
        onClose={() => setFilterVisible(false)} 
        filters={filters} 
        onApply={setFilters} 
        colors={colors} 
        items={items} 
        cats={cats} 
        batches={batches} 
        poses={poses} 
        phases={allPhases || []}
      />
    </View>
  );
}

function FilterSheet({ visible, onClose, filters, onApply, colors, items, cats, batches, poses, phases }) {
  const [local, setLocal] = useState(filters);
  const set = (k, v) => setLocal(p => ({ ...p, [k]: v }));
  useEffect(() => { if (visible) setLocal(filters); }, [visible, filters]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} activeOpacity={1} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ color: colors.t3, fontSize: 20, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.t1 }}>تصفية النتائج</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ marginBottom: 16 }}>
              <Picker 
                label="تاريخ الفاتورة" 
                options={[{ label: 'الكل', value: '' }, ...Array.from(new Set(items.map(i => i.invoice_date))).filter(Boolean).sort().reverse().map(d => ({ label: d, value: d }))]} 
                value={local.date} 
                onChange={v => set('date', v)} 
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <Picker
                label="المرحلة"
                options={[{ label: 'الكل', value: '' }, ...(phases || []).map(p => ({ label: p.name, value: p.id }))]}
                value={local.phase_id}
                onChange={v => set('phase_id', v)}
                searchable={true}
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <Picker 
                label="الفئة" 
                options={[{ label: 'الكل', value: '' }, ...cats.map(c => ({ label: c.name, value: c.id }))]} 
                value={local.category_id} 
                onChange={v => set('category_id', v)} 
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <Picker 
                label="الدفعة" 
                options={[{ label: 'الكل', value: '' }, ...batches.map(b => ({ label: b.batch_number, value: b.id }))]} 
                value={local.batch_id} 
                onChange={v => set('batch_id', v)} 
                searchable={true} 
              />
            </View>
            <View style={{ marginBottom: 20 }}>
              <Picker 
                label="نقطة البيع" 
                options={[{ label: 'الكل', value: '' }, ...poses.map(p => ({ label: p.name, value: p.id }))]} 
                value={local.pos_id} 
                onChange={v => set('pos_id', v)} 
                searchable={true} 
              />
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={() => { onApply({ category_id: '', batch_id: '', pos_id: '', date: '', phase_id: '' }); onClose(); }}
              style={{ flex: 1, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.border + '60', alignItems: 'center' }}>
              <Text style={{ color: colors.t3, fontWeight: '700' }}>إعادة تعيين</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onApply(local); onClose(); }}
              style={{ flex: 2, padding: 13, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Feather name="check" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900' }}>تطبيق</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
