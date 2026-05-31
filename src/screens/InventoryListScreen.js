import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, RefreshControl, Alert, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { Feather } from '@expo/vector-icons';
import {
  getLocalBatches, getLocalCategories, subscribeDataChanges,
  getBatchFinancialSummary, updateLocalBatch, softDeleteBatch,
  zeroRemainingBatchStock, execSQL
} from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Loading, Empty, ProgressBar, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function InventoryScreen({ navigation }) {
  const { can, selectedPhase, projectId } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [batches, setBatches] = useState([]);
  const [cats, setCats] = useState([]);
  const [batchFinancials, setBatchFinancials] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [globalTotals, setGlobalTotals] = useState({ total: 0, sold: 0, remaining: 0 });
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedCatId, setSelectedCatId] = useState(null);

  const runWithConcurrency = useCallback(async (items, limit, worker) => {
    const safeLimit = Math.max(1, Number(limit || 1));
    const out = [];
    let cursor = 0;
    const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        out[idx] = await worker(items[idx], idx);
      }
    });
    await Promise.all(runners);
    return out;
  }, []);

  const load = useCallback(async () => {
    try {
      if (batches.length === 0) setLoading(true);
      const { getInventoryGlobalTotals } = require('../services/database');
      const filters = { project_id: projectId };
      if (selectedPhase) {
        filters.phase_id = selectedPhase.id;
      }
      const [allProjectBatches, bR, cR, gT] = await Promise.all([
        getLocalBatches({ project_id: projectId }),
        getLocalBatches(filters),
        getLocalCategories(projectId),
        getInventoryGlobalTotals(filters)
      ]);
      const validBatches = bR || [];
      setBatches(validBatches);
      setCats(cR || []);
      setGlobalTotals(gT || { total: 0, sold: 0, remaining: 0 });
      console.log(`[Inventory] total batches found=${(allProjectBatches || []).length}`);
      console.log(`[Inventory] batches after project/phase filter=${validBatches.length} project_id=${projectId || 'none'} phase_id=${selectedPhase?.id || 'none'}`);

      const finRows = await runWithConcurrency(validBatches, 6, async (b) => {
        const summary = await getBatchFinancialSummary(b.id, filters);
        return [b.id, summary];
      });
      const finMap = {};
      for (const [batchId, summary] of finRows) {
        finMap[batchId] = summary;
      }
      setBatchFinancials(finMap);
    } catch (e) { }
    setLoading(false); setRefreshing(false);
  }, [batches.length, projectId, selectedPhase?.id, runWithConcurrency]);


  useEffect(() => {
    load();
    const unsub = subscribeDataChanges(e => {
      if (['batches', 'card_categories', 'invoice_items', 'invoices', 'collections', 'all'].includes(e.type)) load();
    });
    return unsub;
  }, [load]);

  const isSoldOut = (b) => {
    const f = batchFinancials[b.id];
    if (!f) return false;
    return (b.available_cards || 0) === 0 && (f.walletRemaining || 0) === 0;
  };

  const isSettled = (b) => {
    const f = batchFinancials[b.id];
    if (!f) return false;
    return f.collectionStatus === 'full';
  };

  const matchesTab = (b) => {
    if (activeTab === 'pending') return !isSoldOut(b);
    if (activeTab === 'sold_out') return isSoldOut(b);
    if (activeTab === 'settled') return isSettled(b);
    return true;
  };

  const tabFiltered = batches.filter(matchesTab);
  const categoryFiltered = tabFiltered.filter(b => !selectedCatId || b.category_id === selectedCatId);
  const filtered = categoryFiltered.filter(b => !search || JSON.stringify(b).toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    console.log(`[Inventory] batches after tab filter=${tabFiltered.length} activeTab=${activeTab}`);
    console.log(`[Inventory] batches after category filter=${categoryFiltered.length} category_id=${selectedCatId || 'all'}`);
  }, [tabFiltered.length, categoryFiltered.length, activeTab, selectedCatId]);

  // Calculate totals for active tab
  const tabTotals = filtered.reduce((acc, b) => {
    const f = batchFinancials[b.id] || {};
    const totalDist = (b.total_cards || 0) - (b.available_cards || 0);
    acc.total += (b.total_cards || 0);
    acc.sold += (f.soldQty || 0); 
    acc.totalDistributed += totalDist;
    acc.available += (b.available_cards || 0);
    acc.walletRemaining += (f.walletRemaining || 0);
    acc.remaining += (b.available_cards || 0) + (f.walletRemaining || 0);
    return acc;
  }, { total: 0, sold: 0, totalDistributed: 0, available: 0, walletRemaining: 0, remaining: 0 });

  const catColors = [colors.primary, colors.cyan, colors.warning, colors.success];


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
        tabs={[
          { k: 'pending', l: 'المعلقة' },
          { k: 'sold_out', l: 'المكتمل بيعها' },
          { k: 'settled', l: 'المكتمل استحقاقها' },
        ]}
        activeTab={activeTab}
        onTabSelect={setActiveTab}
        kpis={[
          { label: 'الموزع', value: tabTotals.totalDistributed, color: colors.blue },
          { label: 'المباع', value: tabTotals.sold, color: colors.warning },
          { label: 'المتاح', value: tabTotals.available, color: colors.cyan },
          { label: 'المعلقين', value: tabTotals.remaining, color: colors.success },
          { label: 'المتاح في المحفظة', value: tabTotals.walletRemaining, color: colors.purple },
        ]}
        search={search} onSearch={setSearch}
        searchPlaceholder="بحث..."
        action="+ إضافة دفعة"
        onAction={() => navigation.push('AddBatch')}
      />

      {/* Category Filter Chips */}
      <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs }}>
          <TouchableOpacity 
            onPress={() => setSelectedCatId(null)}
            style={{ 
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, 
              backgroundColor: !selectedCatId ? colors.primary : colors.bg2,
              borderWidth: 1, borderColor: !selectedCatId ? colors.primary : colors.border
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: !selectedCatId ? '#fff' : colors.t3 }}>الكل</Text>
          </TouchableOpacity>
          {cats.map(c => (
            <TouchableOpacity 
              key={c.id}
              onPress={() => setSelectedCatId(c.id)}
              style={{ 
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, 
                backgroundColor: selectedCatId === c.id ? colors.primary : colors.bg2,
                borderWidth: 1, borderColor: selectedCatId === c.id ? colors.primary : colors.border
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '800', color: selectedCatId === c.id ? '#fff' : colors.t3 }}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
      >


        {filtered.length === 0
          ? <Empty icon="box" title="لا توجد دفعات متوفرة" action="إضافة أول دفعة" onAction={() => navigation.navigate('AddBatch')} />
          : filtered.map(batch => {
            const catObj = cats.find(c => c.id === batch.category_id);
            const catIdx = cats.findIndex(c => c.id === batch.category_id);
            const col = catColors[catIdx % catColors.length] || colors.primary;
            const dist = (batch.total_cards || 0) - (batch.available_cards || 0);
            const distPct = batch.total_cards > 0 ? (dist / batch.total_cards) * 100 : 0;
            const financial = batchFinancials[batch.id] || {};
            const expanded = expandedBatchId === batch.id;

            return (
              <TouchableOpacity
                key={batch.id}
                style={[s.batchCard, { 
                  padding: spacing.md, 
                  borderRadius: radius.lg, 
                  marginBottom: spacing.md, 
                  elevation: 2,
                  borderBottomWidth: 3,
                  borderBottomColor: colors.border + '50'
                }]}
                activeOpacity={0.85}
                onPress={() => setExpandedBatchId(expanded ? null : batch.id)}
                onLongPress={() => {
                  const opts = [{ text: 'إلغاء', style: 'cancel' }];
                  opts.push({ text: 'تعديل', onPress: () => openEditModal(batch) });
                  if (can('canManageInventory')) opts.push({ text: 'حذف', style: 'destructive', onPress: async () => { await softDeleteBatch(batch.id); load(); } });
                  Alert.alert('إجراءات الدفعة', `دفعة رقم ${batch.batch_number}`, opts);
                }}
              >
                {/* ── COLLAPSED: Primary info (always visible) ── */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Badge status={batch.status || 'نشط'} style={{ paddingVertical: 2, paddingHorizontal: 6 }} />
                    <View style={{ backgroundColor: col + '10', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: col + '30' }}>
                      <Text style={{ color: col, fontWeight: '900', fontSize: 11 }}>{catObj?.name || 'صنف'}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16, color: colors.primary, fontWeight: '900' }}>#{batch.batch_number}</Text>
                    <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.t3} />
                  </View>
                </View>



                {/* Stat strip: total / distributed / remaining */}
                <View style={{ flexDirection: 'row', backgroundColor: colors.bg2, borderRadius: radius.sm, padding: 0, overflow: 'hidden', borderWidth: 1, borderColor: colors.border + '20' }}>
                  {[
                    { l: 'الإجمالي', v: batch.total_cards, c: colors.t1, bg: colors.primary + '03' },
                    { l: 'الموزع', v: dist, c: colors.warning, bg: colors.warning + '03' },
                    { l: 'المتبقي', v: batch.available_cards, c: batch.available_cards < 10 ? colors.danger : colors.success, bg: colors.success + '03' }
                  ].map((st, i) => (
                    <View key={i} style={{ flex: 1, paddingVertical: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: st.bg, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: colors.border + '20' }}>
                      <Text style={{ fontSize: 8, color: colors.t3, marginBottom: 0, fontWeight: '700' }}>{st.l}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: st.c }}>{st.v}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ marginTop: 4 }}>
                  <ProgressBar percent={distPct} color={col} height={3} />
                </View>

                {/* ── EXPANDED: Financial details + actions ── */}
                {expanded && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border + '20', paddingTop: 8 }}>
                    <View style={{ marginBottom: 8 }}>
                      {[
                        { l: 'قيمة الدفعة', v: formatCurrency(financial.totalValue || 0), c: colors.t1 },
                        { l: 'إجمالي المبيعات', v: formatCurrency(financial.totalSalesValue || 0), c: colors.primary },
                        { l: 'إجمالي التحصيل', v: formatCurrency(financial.totalCollectionsValue || 0), c: colors.success },
                        { l: `متبقي التحصيل من قيمة الدفعة (${(financial.collectionProgressPct || 0).toFixed(0)}%)`, v: formatCurrency(financial.remainingAmount || 0), c: colors.warning },
                      ].map((row, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={{ color: colors.t3, fontSize: 10 }}>{row.l}</Text>
                          <Text style={{ color: row.c, fontWeight: '800', fontSize: 11 }}>{row.v}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                      <TouchableOpacity 
                        onPress={() => navigation.navigate('BatchStockDetail', { batchId: batch.id, batchNumber: batch.batch_number })} 
                        style={{
                          flex: 1,
                          paddingVertical: 8,
                          backgroundColor: colors.blue + '08',
                          borderRadius: radius.sm,
                          alignItems: 'center',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          gap: 4,
                          borderWidth: 1,
                          borderColor: colors.blue + '20',
                        }}
                      >
                        <Feather name="activity" size={14} color={colors.blue} />
                        <Text style={{ fontSize: 11, color: colors.blue, fontWeight: '700' }}>حركة المخزون</Text>
                      </TouchableOpacity>

                      {(batch.available_cards || 0) > 0 && (
                        <TouchableOpacity
                          onPress={() => {
                            const avail = batch.available_cards || 0;
                            Alert.alert(
                              'تصفير المخزون المتبقي',
                              `سيتم تصفير ${avail} ورقة غير موزَّعة من دفعة رقم ${batch.batch_number}.\n\nهل تريد المتابعة؟`,
                              [
                                { text: 'إلغاء', style: 'cancel' },
                                {
                                  text: 'تأكيد التصفير',
                                  style: 'destructive',
                                  onPress: async () => {
                                    try {
                                      const { zeroed } = await zeroRemainingBatchStock(batch.id);
                                      Alert.alert('✅ تم التصفير', `تم تصفير ${zeroed} ورقة من المخزون غير الموزَّع.`);
                                      load();
                                    } catch (e) {
                                      Alert.alert('تعذّر التصفير', e?.message || 'حدث خطأ غير متوقع');
                                    }
                                  },
                                },
                              ]
                            );
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 8,
                            backgroundColor: colors.danger + '08',
                            borderRadius: radius.sm,
                            alignItems: 'center',
                            flexDirection: 'row',
                            justifyContent: 'center',
                            gap: 4,
                            borderWidth: 1,
                            borderColor: colors.danger + '20',
                          }}
                        >
                          <Feather name="x-circle" size={14} color={colors.danger} />
                          <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '700' }}>تصفير ({batch.available_cards})</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={{ borderTopWidth: 1, borderTopColor: colors.border + '20', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: colors.t3 }}>{formatDateShort(batch.received_date)}</Text>
                      <View style={{ flexDirection: 'row-reverse', gap: 6 }}>
                        <TouchableOpacity onPress={() => openEditModal(batch)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: colors.bg2, borderRadius: 4, borderWidth: 1, borderColor: colors.border }}>
                          <Feather name="edit-2" size={10} color={colors.t2} />
                          <Text style={{ fontSize: 10, color: colors.t2, fontWeight: '600' }}>تعديل</Text>
                        </TouchableOpacity>
                        {can('canManageInventory') && (
                          <TouchableOpacity onPress={async () => {
                            Alert.alert('حذف الدفعة', 'هل تريد حذف الدفعة؟', [
                              { text: 'إلغاء', style: 'cancel' },
                              {
                                text: 'تأكيد الحذف', style: 'destructive', onPress: async () => {
                                  try { await softDeleteBatch(batch.id); await load(); } catch (e) { Alert.alert('تعذر حذف الدفعة', e?.message || 'حدث خطأ'); }
                                }
                              }
                            ]);
                          }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: colors.danger + '05', borderRadius: 4, borderWidth: 1, borderColor: colors.danger + '20' }}>
                            <Feather name="trash-2" size={10} color={colors.danger} />
                            <Text style={{ fontSize: 10, color: colors.danger, fontWeight: '600' }}>حذف</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        }
      </ScrollView>

      <Modal visible={editModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.t1, marginBottom: 20, textAlign: 'center' }}>
                <Feather name="edit-2" size={18} color={colors.t1} /> تعديل الدفعة
              </Text>
              <TextInput style={{ backgroundColor: colors.bg2, padding: 12, borderRadius: 8, marginBottom: 12, color: colors.t1 }} value={editForm.batch_number} onChangeText={v => setEditForm({ ...editForm, batch_number: v })} placeholder="رقم الدفعة" />
              <TextInput style={{ backgroundColor: colors.bg2, padding: 12, borderRadius: 8, marginBottom: 12, color: colors.t1 }} value={editForm.total_cards} onChangeText={v => setEditForm({ ...editForm, total_cards: v })} keyboardType="numeric" placeholder="عدد الأوراق" />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity onPress={() => setEditModal(false)} style={{ flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}><Text style={{ color: colors.t2 }}>إلغاء</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleEditSave} style={{ flex: 1.5, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '900' }}>حفظ</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
