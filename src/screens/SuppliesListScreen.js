import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import * as Print from 'expo-print';
import { useTheme } from '../theme';
import {
  getLocalSupplies, subscribeDataChanges, approveLocalSupply,
  cancelLocalSupplyApproval, rejectLocalSupply, getSupplyPrintDetails
} from '../services/database';
import { formatCurrency, formatDateShort, generateSupplyReceiptHTML } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, Row, ScreenHeader, Input } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function SuppliesScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('pending');

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [approveNotes, setApproveNotes] = useState('');

  const [showJournalModal, setShowJournalModal] = useState(false);
  const [journalData, setJournalData] = useState(null);
  const [journalLoading, setJournalLoading] = useState(false);

  const load = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const filters = user?.role === 'cashier' ? { user_id: user.id } : {};
      const data = await getLocalSupplies(filters);
      setSupplies(data || []);
    } catch (e) { }
    finally { if (!quiet) setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => {
    load();
    const unsub = subscribeDataChanges(e => { if (['supplies', 'all', 'sync_queue'].includes(e.type)) load(true); });
    return unsub;
  }, [load]);

  const pending = supplies.filter(x => x.status === 'pending');
  const approved = supplies.filter(x => x.status === 'approved');
  const rejected = supplies.filter(x => x.status === 'rejected');

  const activeList = tab === 'pending' ? pending : (tab === 'approved' ? approved : rejected);
  const filtered = activeList.filter(x => !search || JSON.stringify(x).toLowerCase().includes(search.toLowerCase()));
  const total = activeList.reduce((sum, x) => sum + (x.amount || 0), 0);

  const handleApprove = async () => {
    if (!approvingId) return;
    try {
      await approveLocalSupply(approvingId, approveNotes);
      setShowApproveModal(false);
      setApproveNotes('');
      load();
    } catch(e) { Alert.alert('خطأ', e.message); }
  };

  const handleReject = async (id) => {
    Alert.alert('رفض التوريد', 'هل أنت متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'متأكد (رفض)', style: 'destructive', onPress: async () => { await rejectLocalSupply(id); load(); } }
    ]);
  };

  const handlePrint = async (sup) => {
    try {
      const details = await getSupplyPrintDetails(sup.id);
      const html = generateSupplyReceiptHTML(sup, details, sup.user_name || 'غير معروف', sup.agent_name || 'عدة مناديب');
      await Print.printAsync({ html });
    } catch(e) { Alert.alert('خطأ', e.message); }
  };

  const openJournal = async (sup) => {
    setJournalData({ supply: sup, collections: [] });
    setShowJournalModal(true);
    setJournalLoading(true);
    try {
      const details = await getSupplyPrintDetails(sup.id);
      setJournalData({ supply: sup, collections: details || [] });
    } catch(e) {
      Alert.alert('خطأ', 'فشل في جلب تفاصيل القيد المحاسبي');
    }
    setJournalLoading(false);
  };

  return (
    <View style={s.screen}>
      <ScreenHeader
        kpis={[{ label: 'الإجمالي', value: formatCurrency(total), color: colors.green }, { label: 'العدد', value: activeList.length, color: colors.cyan }]}
        tabs={[{ k: 'pending', l: `قيد الإيراد (${pending.length})` }, { k: 'approved', l: `المعتمدة (${approved.length})` }, { k: 'rejected', l: `المرفوضة (${rejected.length})` }]}
        activeTab={tab} onTabSelect={setTab} search={search} onSearch={setSearch}
        action="+ إيراد" onAction={() => navigation.push('NewSupply')}
      />

      {loading ? <Loading /> : filtered.length === 0
        ? <Empty icon="💰" title="لا توجد توريدات" />
        : <FlatList
          data={filtered} keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}
          renderItem={({ item: sup }) => (
            <View style={{ backgroundColor: colors.card, marginBottom: spacing.md, borderRadius: radius.md, ...shadow }}>
              <View style={[s.invCard, { marginBottom: 0, paddingBottom: spacing.sm, elevation: 0, shadowOpacity: 0 }]}>
                <View style={s.invCardLeft}>
                  <Text style={s.invNum}>{sup.supply_number}</Text>
                  <Text style={s.invPos}>إيراد من: {sup.agent_name || '—'}</Text>
                  <Text style={s.invMeta}>{sup.user_name} · {formatDateShort(sup.created_at)}</Text>
                </View>
              <View style={s.invCardRight}>
                <Text style={[s.invAmt, { color: colors.green }]}>{formatCurrency(sup.amount)}</Text>
              </View>
            </View>
            <View style={[s.colActions, { paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border2, marginTop: 4 }]}>
              <Row style={{ gap: 10, marginBottom: 10 }}>
                <Btn label="🖨️ طباعة" variant="glass" size="lg" style={{ flex: 1 }} onPress={() => handlePrint(sup)} />
                <Btn label="🔍 تفاصيل القيد" variant="primary" size="lg" style={{ flex: 1 }} onPress={() => openJournal(sup)} />
              </Row>
              <Row style={{ gap: 10 }}>
                {sup.status === 'pending' && user?.role === 'admin' && (
                  <Btn label="✅ اعتماد الشيك/النقد" variant="success" size="lg" style={{ flex: 1 }} onPress={() => { setApprovingId(sup.id); setShowApproveModal(true); }} />
                )}
                {sup.status === 'pending' && user?.role === 'admin' && (
                  <Btn label="❌ رفض" variant="danger" size="lg" style={{ flex: 1 }} onPress={() => handleReject(sup.id)} />
                )}
              </Row>
            </View>
          </View>
          )}
        />
      }

      <Modal visible={showJournalModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: '85%', padding: 0 }]}>
            <View style={{ backgroundColor: colors.blue, padding: spacing.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFF' }}>🧾 كشف حساب (قيد التحصيلات)</Text>
                <TouchableOpacity onPress={() => setShowJournalModal(false)}>
                  <Text style={{ fontSize: 20, color: '#FFF' }}>✕</Text>
                </TouchableOpacity>
              </Row>
            </View>
            
            {journalData?.supply && (
              <ScrollView style={{ padding: spacing.md }}>
                <View style={{ backgroundColor: colors.bg2, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md }}>
                   <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                     <Text style={{ color: colors.t2 }}>رقم الإيراد المحاسبي:</Text>
                     <Text style={{ fontWeight: 'bold', color: colors.blue }}>{journalData.supply.supply_number}</Text>
                   </Row>
                   <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                     <Text style={{ color: colors.t2 }}>تاريخ القيد:</Text>
                     <Text style={{ fontWeight: 'bold', color: colors.t1 }}>{formatDateShort(journalData.supply.created_at)}</Text>
                   </Row>
                   <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                     <Text style={{ color: colors.t2 }}>اسم المحاسب:</Text>
                     <Text style={{ fontWeight: 'bold', color: colors.t1 }}>{journalData.supply.user_name}</Text>
                   </Row>
                   <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                     <Text style={{ color: colors.t2 }}>الجهة الموردة (المندوب):</Text>
                     <Text style={{ fontWeight: 'bold', color: colors.t1 }}>{journalData.supply.agent_name || '—'}</Text>
                   </Row>
                   <View style={{ height: 1, backgroundColor: colors.border2, marginVertical: 8 }} />
                   <Row style={{ justifyContent: 'space-between' }}>
                     <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.t1 }}>إجمالي القيد:</Text>
                     <Text style={{ fontSize: 20, fontWeight: '900', color: colors.green }}>{formatCurrency(journalData.supply.amount)}</Text>
                   </Row>
                </View>

                <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.t1, marginBottom: 10 }}>التحصيلات المرفقة بهذا الإيراد:</Text>
                
                {journalLoading ? <Loading /> : (
                  journalData?.collections?.length === 0 ? (
                    <Text style={{ color: colors.t3, textAlign: 'center', marginTop: 20 }}>لا توجد تحصيلات تفصيلية مسجلة.</Text>
                  ) : (
                    journalData.collections.map((col, index) => (
                      <View key={index} style={{ backgroundColor: colors.bg1, padding: 12, borderRadius: radius.md, marginBottom: 8, borderWidth: 1, borderColor: colors.border2 }}>
                        <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontWeight: 'bold', color: colors.t1, flex: 1 }}>{col.source_label}</Text>
                          <Text style={{ fontWeight: 'bold', color: colors.orange }}>{formatCurrency(col.amount)}</Text>
                        </Row>
                        <Row style={{ justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 12, color: colors.t3 }}>طريقة الدفع: {col.method === 'cash' ? 'نقدي 💵' : col.method === 'transfer' ? 'تحويل 🏦' : 'شيك 📝'}</Text>
                          <Text style={{ fontSize: 12, color: colors.t3 }}>{formatDateShort(col.collection_date)}</Text>
                        </Row>
                      </View>
                    ))
                  )
                )}
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
            
            <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border2 }}>
              <Btn label="إغلاق التقرير" variant="outline" onPress={() => setShowJournalModal(false)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showApproveModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalContent}>
            <Text style={s.sectionTitle}>اعتماد التوريد</Text>
            <Input label="ملاحظات" value={approveNotes} onChangeText={setApproveNotes} multiline style={{ height: 80 }} />
            <Row style={{ gap: 10, marginTop: 20 }}>
              <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => setShowApproveModal(false)} />
              <Btn label="✅ اعتماد" variant="primary" style={{ flex: 1.5 }} onPress={handleApprove} />
            </Row>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
