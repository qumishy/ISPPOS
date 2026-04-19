import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, RefreshControl, Alert, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import {
  getLocalBatches, getLocalCategories, subscribeDataChanges,
  getBatchFinancialSummary, updateLocalBatch, softDeleteBatch, execSQL
} from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Loading, Empty, ProgressBar, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function InventoryScreen({ navigation }) {
  const { can } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [batches, setBatches] = useState([]);
  const [cats, setCats] = useState([]);
  const [batchFinancials, setBatchFinancials] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [bR, cR] = await Promise.all([getLocalBatches(), getLocalCategories()]);
      const validBatches = bR || [];
      setBatches(validBatches); setCats(cR || []);
      
      const finMap = {};
      for (const b of validBatches) {
         finMap[b.id] = await getBatchFinancialSummary(b.id);
      }
      setBatchFinancials(finMap);
    } catch (e) { }
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { 
    load();
    const unsub = subscribeDataChanges(e => { if (['batches', 'card_categories', 'all'].includes(e.type)) load(); });
    return unsub;
  }, [load]);

  const catColors = [colors.blue, colors.cyan, colors.purple, colors.green];
  const catSummary = cats.map((cat, i) => ({
    ...cat, color: catColors[i % catColors.length],
    total: batches.filter(b => b.category_id === cat.id).reduce((s, b) => s + (b.available_cards || 0), 0),
  }));

  const filtered = batches.filter(b => !search || JSON.stringify(b).toLowerCase().includes(search.toLowerCase()));

  const [editModal, setEditModal] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const [editForm, setEditForm] = useState({ batch_number: '', serial_number: '', total_cards: '', received_date: '', category_id: '' });
  const [editSaving, setEditSaving] = useState(false);

  const openEditModal = async (batch) => {
    try {
      const w = await execSQL(`SELECT id FROM agent_wallets WHERE batch_id=? LIMIT 1`, [batch.id]);
      if (w.rows._array.length > 0) {
        Alert.alert(
          'تنبيه: الدفعة موزعة',
          'لا يمكن تعديل هذه الدفعة نهائياً لأنها مرتبطة بمحافظ مناديب.'
        );
        return;
      }
    } catch (e) { console.log('Check distributed error', e); }

    setEditBatch(batch);
    setEditForm({
      batch_number: batch.batch_number || '',
      serial_number: batch.serial_number || '',
      total_cards: String(batch.total_cards || ''),
      received_date: batch.received_date || '',
      category_id: batch.category_id || '',
    });
    setEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editBatch) return;
    setEditSaving(true);
    try {
      const updates = {
        batch_number: editForm.batch_number,
        serial_number: editForm.serial_number,
        received_date: editForm.received_date,
        total_cards: parseInt(editForm.total_cards) || 0,
        available_cards: parseInt(editForm.total_cards) || 0,
        category_id: editForm.category_id,
      };
      await updateLocalBatch(editBatch.id, updates);
      setEditModal(false);
      setEditBatch(null);
      Alert.alert('✅ تم', 'تم تعديل بيانات الدفعة بنجاح');
      load();
    } catch (e) { Alert.alert('خطأ', e.message); }
    setEditSaving(false);
  };

  if (loading) return <Loading />;

  return (
    <View style={s.screen}>
      <ScreenHeader
        kpis={[
          { label: 'إجمالي المتوفر', value: batches.reduce((sum, b) => sum + (b.available_cards || 0), 0), color: colors.blue },
          { label: 'الفئات', value: cats.length, color: colors.cyan },
          { label: 'نواقص', value: catSummary.filter(c => c.total < 15).length, color: colors.red },
        ]}
        search={search} onSearch={setSearch}
        searchPlaceholder="بحث برقم الدفعة..."
        action="+ إضافة دفعة"
        onAction={() => navigation.push('AddBatch')}
      />
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
      >
        <View style={s.catGrid}>
          {catSummary.map(cat => (
            <View key={cat.id} style={[s.catCard, { borderTopColor: cat.color, borderTopWidth: 3 }]}>
              <Text style={[s.catTotal, cat.total < 15 && { color: colors.red }]}>{cat.total}</Text>
              <Text style={s.catName}>{cat.name}</Text>
              <Text style={s.catPrice}>{formatCurrency(cat.price)}/كارت</Text>
            </View>
          ))}
        </View>

        {filtered.length === 0
          ? <Empty icon="📦" title="لا توجد دفعات متوفرة" action="+ إضافة أول دفعة" onAction={() => navigation.navigate('AddBatch')} />
          : filtered.map(batch => {
            const catObj = cats.find(c => c.id === batch.category_id);
            const catIdx = cats.findIndex(c => c.id === batch.category_id);
            const col = catColors[catIdx % catColors.length] || colors.blue;
            const dist = (batch.total_cards || 0) - (batch.available_cards || 0);
            const distPct = batch.total_cards > 0 ? (dist / batch.total_cards) * 100 : 0;
            const remPct = 100 - distPct;
            
            return (
              <View key={batch.id} style={s.batchCard}>
                <View style={s.batchCardTop}>
                  <View>
                    <Text style={[s.batchNum, { color: col }]}>{batch.serial_number || batch.batch_number}</Text>
                    <Text style={{ fontSize: 13, color: colors.t3 }}>دفعة رقم: {batch.batch_number}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Badge status={batch.status || 'نشط'} />
                    <View style={[s.catChip, { backgroundColor: col + '15', paddingHorizontal: 12 }]}>
                      <Text style={[s.catChipTxt, { color: col, fontWeight: '900' }]}>{catObj?.name || 'صنف'}</Text>
                    </View>
                  </View>
                </View>

                <View style={[s.batchStats, { backgroundColor: colors.bg2, borderRadius: radius.md, padding: 0, overflow: 'hidden', borderWidth: 1, borderColor: colors.border + '40' }]}>
                  {[{ l: 'الإجمالي', v: batch.total_cards, c: colors.t1, bg: colors.blue + '08' },{ l: 'الموزع', v: dist, c: colors.orange, bg: colors.orange + '08' },{ l: 'المتبقي', v: batch.available_cards, c: batch.available_cards < 10 ? colors.red : colors.green, bg: colors.green + '08' }].map((st, i) => (
                    <View key={i} style={{ flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: st.bg, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: colors.border + '40' }}>
                      <Text style={{ fontSize: 11, color: colors.t3, marginBottom: 4, fontWeight: '600' }}>{st.l}</Text>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: st.c }}>{st.v}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ marginTop: 15 }}>
                  <ProgressBar percent={distPct} color={col} height={8} />
                </View>

                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border + '30', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                   <Text style={{ fontSize: 11, color: colors.t3 }}>{formatDateShort(batch.received_date)}</Text>
                   <View style={{ flexDirection: 'row', gap: 10 }}>
                     <TouchableOpacity onPress={() => openEditModal(batch)}><Text style={{ fontSize: 12, color: colors.blue }}>تعديل ✏️</Text></TouchableOpacity>
                     {can('canManageInventory') && (
                       <TouchableOpacity onPress={async () => {
                         Alert.alert('حذف الدفعة', 'هل تريد حذف الدفعة؟', [
                           { text: 'إلغاء', style: 'cancel' },
                           { text: 'تأكيد الحذف', style: 'destructive', onPress: async () => { await softDeleteBatch(batch.id); load(); } }
                         ]);
                       }}><Text style={{ fontSize: 12, color: colors.red }}>🗑️ حذف</Text></TouchableOpacity>
                     )}
                   </View>
                </View>
              </View>
            );
          })
        }
      </ScrollView>

      <Modal visible={editModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.t1, marginBottom: 20 }}>✏️ تعديل الدفعة</Text>
              <TextInput style={{ backgroundColor: colors.bg2, padding: 12, borderRadius: 8, marginBottom: 12, color: colors.t1 }} value={editForm.batch_number} onChangeText={v => setEditForm({ ...editForm, batch_number: v })} placeholder="رقم الدفعة" />
              <TextInput style={{ backgroundColor: colors.bg2, padding: 12, borderRadius: 8, marginBottom: 12, color: colors.t1 }} value={editForm.total_cards} onChangeText={v => setEditForm({ ...editForm, total_cards: v })} keyboardType="numeric" placeholder="عدد الأوراق" />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity onPress={() => setEditModal(false)} style={{ flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}><Text style={{ color: colors.t2 }}>إلغاء</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleEditSave} style={{ flex: 1.5, padding: 14, borderRadius: 10, backgroundColor: colors.blue, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '900' }}>حفظ</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
