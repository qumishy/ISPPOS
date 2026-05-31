import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, Modal } from 'react-native';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import { getLocalInvoices, getPendingDiscountInvoices, approveInvoiceDiscount, rejectInvoiceDiscount, subscribeDataChanges } from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Btn, Empty, Input, Loading, Row } from '../components/UI';

export default function DiscountApprovalsScreen({ navigation }) {
  const { user, selectedPhase } = useAuth();
  const { colors, spacing, radius, fontSize } = useTheme();

  if (user?.role !== 'admin') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: colors.red }}>🚫 غير مصرح</Text>
        <Text style={{ marginTop: 8, color: colors.t3, textAlign: 'center' }}>
          هذه الشاشة مخصصة للمدير فقط.
        </Text>
        <Btn label="العودة" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 18, width: '100%' }} />
      </View>
    );
  }

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [approveModal, setApproveModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [appliedValue, setAppliedValue] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      // Use the dedicated non-cached function so the manager always sees the
      // latest invoices without waiting for the 60-second cache TTL.
      const pending = await getPendingDiscountInvoices(selectedPhase?.id || null);
      setRows(pending);
    } finally {
      if (!quiet) setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPhase?.id]);

  useEffect(() => {
    load();
    const unsub = subscribeDataChanges((e) => {
      if (['invoices', 'all', 'sync_queue'].includes(e.type)) load(true);
    });
    return unsub;
  }, [load]);

  const openApprove = (inv) => {
    setSelected(inv);
    setAppliedValue(String(Number(inv.discount_requested_value || 0)));
    setNote('');
    setApproveModal(true);
  };

  const doApprove = async () => {
    if (!selected?.id) return;
    const val = Math.max(0, Number(appliedValue || 0));
    if (val > Number(selected.total_amount || 0)) {
      Alert.alert('تنبيه', 'قيمة الخصم المعتمد لا يمكن أن تتجاوز إجمالي الفاتورة.');
      return;
    }
    try {
      setBusyId(selected.id);
      await approveInvoiceDiscount(selected.id, user?.id, val, note);
      setApproveModal(false);
      setSelected(null);
      await load(true);
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذر اعتماد الخصم');
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (inv) => {
    setSelected(inv);
    setReason('');
    setRejectModal(true);
  };

  const doReject = async () => {
    if (!selected?.id) return;
    try {
      setBusyId(selected.id);
      await rejectInvoiceDiscount(selected.id, user?.id, reason);
      setRejectModal(false);
      setSelected(null);
      await load(true);
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذر رفض الخصم');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Modal visible={approveModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, padding: 16, borderRadius: radius.lg }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.t1, marginBottom: 10 }}>اعتماد خصم الفاتورة</Text>
            <Input label="الخصم المعتمد" value={appliedValue} onChangeText={setAppliedValue} keyboardType="numeric" />
            <Input label="ملاحظة (اختياري)" value={note} onChangeText={setNote} multiline />
            <Row style={{ gap: spacing.sm }}>
              <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => setApproveModal(false)} />
              <Btn label="اعتماد" variant="success" style={{ flex: 1.4 }} onPress={doApprove} loading={busyId === selected?.id} />
            </Row>
          </View>
        </View>
      </Modal>

      <Modal visible={rejectModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, padding: 16, borderRadius: radius.lg }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.t1, marginBottom: 10 }}>رفض خصم الفاتورة</Text>
            <Input label="سبب الرفض (اختياري)" value={reason} onChangeText={setReason} multiline />
            <Row style={{ gap: spacing.sm }}>
              <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => setRejectModal(false)} />
              <Btn label="رفض" variant="danger" style={{ flex: 1.4 }} onPress={doReject} loading={busyId === selected?.id} />
            </Row>
          </View>
        </View>
      </Modal>

      {rows.length === 0 ? (
        <Empty icon="check-circle" title="لا توجد طلبات خصم معلقة" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {rows.map(inv => (
            <View key={inv.id} style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
              <Text style={{ color: colors.t1, fontWeight: '900', fontSize: fontSize.md }}>{inv.invoice_number || '—'}</Text>
              
              <View style={{ marginTop: 8, padding: 8, backgroundColor: colors.bg2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.t2, fontSize: 13, fontWeight: '800' }}>📍 {inv.pos_name || 'نقطة غير معروفة'}</Text>
                {inv.owner_name && <Text style={{ color: colors.t3, fontSize: 11, marginTop: 2 }}>المالك: {inv.owner_name}</Text>}
                {inv.pos_phone && <Text style={{ color: colors.t3, fontSize: 11 }}>هاتف: {inv.pos_phone}</Text>}
              </View>

              <Text style={{ color: colors.t3, marginTop: 8 }}>المندوب: <Text style={{ color: colors.t1, fontWeight: '700' }}>{inv.agent_name || '—'}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>إجمالي الفاتورة: <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(Number(inv.total_amount || 0))}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>الخصم المطلوب: <Text style={{ color: colors.orange, fontWeight: '800' }}>{formatCurrency(Number(inv.discount_requested_value || 0))}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>السبب: <Text style={{ color: colors.t1, fontWeight: '700' }}>{inv.discount_requested_reason || '—'}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>التاريخ: <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatDateShort(inv.created_at || inv.invoice_date)}</Text></Text>
              
              {selectedPhase?.status !== 'closed' ? (
                <Row style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  <Btn label="اعتماد الخصم" variant="success" style={{ flex: 1 }} onPress={() => openApprove(inv)} loading={busyId === inv.id} />
                  <Btn label="رفض" variant="danger" style={{ flex: 1 }} onPress={() => openReject(inv)} loading={busyId === inv.id} />
                </Row>
              ) : (
                 <Text style={{ color: colors.danger, marginTop: 8, fontWeight: 'bold' }}>⚠️ المرحلة مغلقة، لا يمكن اتخاذ إجراء.</Text>
              )}

              <TouchableOpacity onPress={() => navigation.navigate('InvoiceDetail', { id: inv.id })} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>عرض تفاصيل الفاتورة</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

