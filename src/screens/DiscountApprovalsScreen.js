import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, Modal } from 'react-native';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getPendingDiscountInvoices,
  approveInvoiceDiscount,
  rejectInvoiceDiscount,
  subscribeDataChanges,
  getPendingCardReturnRequests,
  getCardReturnRequestDetails,
  approveCardReturnRequest,
  deleteLocalCollection,
} from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Btn, Empty, Input, Loading, Row } from '../components/UI';
import { uuidv4 } from '../services/dbCore';

export default function DiscountApprovalsScreen({ navigation }) {
  const { user, selectedPhase, projectId, canAccess } = useAuth();
  const { colors, spacing, radius, fontSize } = useTheme();
  const normalizedRole = String(user?.role || '').trim().toLowerCase();
  const canApproveDiscounts = ['admin', 'manager', 'مدير'].includes(normalizedRole);
  const canApproveCardReturns = user?.role === 'admin' && canAccess?.('approve_card_returns');

  if (!canApproveDiscounts && !canApproveCardReturns) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: colors.red }}>🚫 غير مصرح</Text>
        <Text style={{ marginTop: 8, color: colors.t3, textAlign: 'center' }}>
          هذه الشاشة مخصصة للمستخدمين المخولين بالاعتماد.
        </Text>
        <Btn label="العودة" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 18, width: '100%' }} />
      </View>
    );
  }

  const [rows, setRows] = useState([]);
  const [cardRows, setCardRows] = useState([]);
  const [tab, setTab] = useState(canApproveDiscounts ? 'discounts' : 'card_returns');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [approveModal, setApproveModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [appliedValue, setAppliedValue] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [cardDetails, setCardDetails] = useState(null);
  const [cardModal, setCardModal] = useState(false);
  const [cardAction, setCardAction] = useState(null);
  const [cardActionNote, setCardActionNote] = useState('');
  const [cardFilter, setCardFilter] = useState('all');

  const load = useCallback(async (quiet = false) => {
    try {
      const [pending, pendingCardReturns] = await Promise.all([
        canApproveDiscounts ? getPendingDiscountInvoices(selectedPhase?.id || null) : Promise.resolve([]),
        canApproveCardReturns ? getPendingCardReturnRequests(projectId, selectedPhase?.id || null) : Promise.resolve([]),
      ]);
      setRows(pending || []);
      setCardRows(pendingCardReturns || []);
    } catch (e) {
      console.error('[DiscountApprovals] load failed:', e?.message || e);
      if (!quiet) Alert.alert('خطأ', e?.message || 'تعذر تحميل طلبات الاعتماد');
    } finally {
      if (!quiet) setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPhase?.id, projectId, canApproveDiscounts, canApproveCardReturns]);

  useEffect(() => {
    load();
    const unsub = subscribeDataChanges((e) => {
      if (['invoices', 'collections', 'invoice_card_returns', 'all', 'sync_queue'].includes(e.type)) load(true);
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

  const openCardRequest = async (req) => {
    try {
      setBusyId(req.request_id);
      const details = await getCardReturnRequestDetails({
        collectionId: req.collection_id || null,
        invoiceId: req.invoice_id,
        projectId,
      });
      setCardDetails({ request: req, details });
      setCardModal(true);
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذر فتح طلب المرتجع');
    } finally {
      setBusyId(null);
    }
  };

  const cardRequestStatusMeta = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return { label: 'معتمد', color: colors.green };
    if (normalized === 'cancelled' || normalized === 'canceled') return { label: 'ملغي', color: colors.red };
    return { label: 'غير معتمد', color: colors.warning };
  };

  const filteredCardRows = cardRows.filter(req => {
    if (cardFilter === 'approved') return String(req.status || '').toLowerCase() === 'approved';
    if (cardFilter === 'unapproved') return String(req.status || '').toLowerCase() !== 'approved';
    return true;
  });

  const closeCardModal = () => {
    setCardModal(false);
    setCardAction(null);
    setCardActionNote('');
    setCardDetails(null);
  };

  const doCardDecision = async () => {
    const req = cardDetails?.request;
    if (!req?.invoice_id || !cardAction) return;
    try {
      setBusyId(req.request_id);
      const operationGroupId = uuidv4();
      if (cardAction === 'approve') {
        await approveCardReturnRequest({
          collectionId: req.collection_id || null,
          invoiceId: req.invoice_id,
          approvedBy: user?.id || null,
          notes: cardActionNote,
          projectId,
          operationGroupId,
        });
      }
      Alert.alert('تم', 'تم اعتماد مرتجع الكروت');
      setCardAction(null);
      setCardActionNote('');
      setCardModal(false);
      setCardDetails(null);
      await load(true);
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذر تنفيذ الإجراء');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelCardCollection = () => {
    const req = cardDetails?.request;
    if (!req?.collection_id) return;
    Alert.alert('إلغاء التحصيل', 'هل تريد إلغاء التحصيل ومرتجع الكروت المرتبط به؟ سيتم الحفظ كإلغاء دون حذف فعلي.', [
      { text: 'لا', style: 'cancel' },
      {
        text: 'إلغاء التحصيل',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusyId(req.request_id);
            await deleteLocalCollection(req.collection_id, user?.id || null);
            closeCardModal();
            await load(true);
          } catch (e) {
            Alert.alert('خطأ', e?.message || 'تعذر إلغاء التحصيل');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
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

      <Modal visible={cardModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: colors.card, padding: 14, borderRadius: radius.lg, maxHeight: '88%' }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.t1, marginBottom: 10 }}>اعتماد مرتجع الكروت</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {cardDetails?.details ? (
                <>
                  <View style={{ backgroundColor: colors.bg2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 10 }}>
                    <Text style={{ color: colors.t3 }}>رقم الفاتورة: <Text style={{ color: colors.t1, fontWeight: '800' }}>{cardDetails.details.invoice?.invoice_number || '—'}</Text></Text>
                    <Text style={{ color: colors.t3, marginTop: 3 }}>رقم التحصيل: <Text style={{ color: colors.t1, fontWeight: '800' }}>{cardDetails.details.collection?.collection_number || '—'}</Text></Text>
                    <Text style={{ color: colors.t3, marginTop: 3 }}>نقطة البيع / العميل: <Text style={{ color: colors.t1, fontWeight: '800' }}>{cardDetails.details.invoice?.pos_name || '—'}</Text></Text>
                    <Text style={{ color: colors.t3, marginTop: 3 }}>المندوب: <Text style={{ color: colors.t1, fontWeight: '800' }}>{cardDetails.details.invoice?.agent_name || cardDetails.details.collection?.agent_name || '—'}</Text></Text>
                  </View>

                  {(cardDetails.details.rows || []).map(row => (
                    <View key={row.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 10, marginBottom: 8 }}>
                      <Text style={{ color: colors.t1, fontWeight: '900' }}>{row.category_name || '—'}</Text>
                      <Text style={{ color: colors.t3, marginTop: 4 }}>عدد الكروت المرتجعة: <Text style={{ color: colors.t1, fontWeight: '800' }}>{row.returned_cards_count}</Text></Text>
                      <Text style={{ color: colors.t3, marginTop: 2 }}>قيمة الكرت: <Text style={{ color: colors.t1, fontWeight: '800' }}>{formatCurrency(row.card_value || 0)}</Text></Text>
                      <Text style={{ color: colors.t3, marginTop: 2 }}>قيمة المرتجع: <Text style={{ color: colors.orange, fontWeight: '900' }}>{formatCurrency(row.return_amount || 0)}</Text></Text>
                      {!!row.reason && <Text style={{ color: colors.t3, marginTop: 2 }}>السبب: <Text style={{ color: colors.t1, fontWeight: '700' }}>{row.reason}</Text></Text>}
                    </View>
                  ))}

                  <View style={{ backgroundColor: colors.bg2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
                    <Text style={{ color: colors.t3 }}>صافي الفاتورة الأصلي: <Text style={{ color: colors.t1, fontWeight: '900' }}>{formatCurrency(cardDetails.details.original_net_amount || 0)}</Text></Text>
                    <Text style={{ color: colors.t3, marginTop: 3 }}>التحصيلات المعتمدة قبل الطلب: <Text style={{ color: colors.green, fontWeight: '900' }}>{formatCurrency(cardDetails.details.approved_collections_total || 0)}</Text></Text>
                    <Text style={{ color: colors.t3, marginTop: 3 }}>إجمالي المرتجع: <Text style={{ color: colors.orange, fontWeight: '900' }}>{formatCurrency(cardDetails.details.pending_return_amount || 0)}</Text></Text>
                    <Text style={{ color: colors.t3, marginTop: 3 }}>الصافي بعد المرتجع: <Text style={{ color: colors.blue, fontWeight: '900' }}>{formatCurrency(cardDetails.details.net_after_approval || 0)}</Text></Text>
                    <Text style={{ color: colors.t3, marginTop: 3 }}>المتبقي بعد التحصيل والمرتجع: <Text style={{ color: colors.red, fontWeight: '900' }}>{formatCurrency(cardDetails.details.remaining_after_approval || 0)}</Text></Text>
                  </View>

                  {cardAction === 'approve' && (
                    <View style={{ marginTop: 10 }}>
                      <Input label="ملاحظات الاعتماد" value={cardActionNote} onChangeText={setCardActionNote} multiline />
                    </View>
                  )}
                </>
              ) : (
                <Text style={{ color: colors.t3, textAlign: 'center', padding: 20 }}>لا توجد تفاصيل متاحة.</Text>
              )}
            </ScrollView>
            <Row style={{ gap: spacing.sm, marginTop: 12 }}>
              <Btn label="إغلاق" variant="outline" style={{ flex: 1 }} onPress={closeCardModal} />
              {cardAction ? (
                <Btn label="تأكيد الاعتماد" variant="success" style={{ flex: 1.4 }} onPress={doCardDecision} loading={busyId === cardDetails?.request?.request_id} />
              ) : (
                <>
                  {String(cardDetails?.request?.status || '').toLowerCase() !== 'approved' && (
                    <Btn label="اعتماد" variant="success" style={{ flex: 1 }} onPress={() => setCardAction('approve')} />
                  )}
                  {selectedPhase?.status !== 'closed' && cardDetails?.request?.collection_id && (user?.role === 'admin' || user?.role === 'manager') && (
                    <Btn label="إلغاء التحصيل" variant="danger" style={{ flex: 1 }} onPress={handleCancelCardCollection} loading={busyId === cardDetails?.request?.request_id} />
                  )}
                </>
              )}
            </Row>
          </View>
        </View>
      </Modal>

      <Row style={{ padding: spacing.md, gap: spacing.sm }}>
        {canApproveDiscounts && (
          <TouchableOpacity onPress={() => setTab('discounts')} style={{ flex: 1, padding: 10, borderRadius: radius.sm, backgroundColor: tab === 'discounts' ? colors.primary : colors.bg2, alignItems: 'center' }}>
            <Text style={{ color: tab === 'discounts' ? '#fff' : colors.t1, fontWeight: '900' }}>اعتماد الخصومات</Text>
          </TouchableOpacity>
        )}
        {canApproveCardReturns && (
          <TouchableOpacity onPress={() => setTab('card_returns')} style={{ flex: 1, padding: 10, borderRadius: radius.sm, backgroundColor: tab === 'card_returns' ? colors.primary : colors.bg2, alignItems: 'center' }}>
            <Text style={{ color: tab === 'card_returns' ? '#fff' : colors.t1, fontWeight: '900' }}>اعتماد مرتجع الكروت</Text>
          </TouchableOpacity>
        )}
      </Row>

      {tab === 'discounts' && rows.length === 0 ? (
        <Empty icon="check-circle" title="لا توجد طلبات خصم معلقة" />
      ) : tab === 'discounts' ? (
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
      ) : (
        <>
          <Row style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm }}>
            {[
              ['all', 'الكل'],
              ['approved', 'معتمد'],
              ['unapproved', 'غير معتمد'],
            ].map(([key, label]) => (
              <TouchableOpacity
                key={key}
                onPress={() => setCardFilter(key)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  backgroundColor: cardFilter === key ? colors.primary : colors.bg2,
                  borderWidth: 1,
                  borderColor: cardFilter === key ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: cardFilter === key ? '#fff' : colors.t1, fontWeight: '900', fontSize: 12 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </Row>
          {filteredCardRows.length === 0 ? (
            <Empty icon="check-circle" title="لا توجد طلبات مرتجع كروت" />
          ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {filteredCardRows.map(req => {
            const statusMeta = cardRequestStatusMeta(req.status);
            return (
            <TouchableOpacity key={req.request_id} activeOpacity={0.86} onPress={() => openCardRequest(req)} style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
              <Text style={{ color: colors.t1, fontWeight: '900', fontSize: fontSize.md }}>{req.collection_number || 'تحصيل بدون رقم'}</Text>
              <Text style={{ color: colors.t3, marginTop: 6 }}>رقم الفاتورة: <Text style={{ color: colors.t1, fontWeight: '800' }}>{req.invoice_number || '—'}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>نقطة البيع / العميل: <Text style={{ color: colors.t1, fontWeight: '800' }}>{req.pos_name || '—'}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>المندوب: <Text style={{ color: colors.t1, fontWeight: '800' }}>{req.agent_name || '—'}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>المرحلة: <Text style={{ color: colors.t1, fontWeight: '800' }}>{req.phase_name || '—'}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>إجمالي الكروت المرتجعة: <Text style={{ color: colors.t1, fontWeight: '900' }}>{req.total_returned_cards || 0}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>إجمالي قيمة المرتجع: <Text style={{ color: colors.orange, fontWeight: '900' }}>{formatCurrency(req.total_return_amount || 0)}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>الحالة: <Text style={{ color: statusMeta.color, fontWeight: '900' }}>{statusMeta.label}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>أنشئت بواسطة: <Text style={{ color: colors.t1, fontWeight: '800' }}>{req.created_by_name || '—'}</Text></Text>
              <Text style={{ color: colors.t3, marginTop: 2 }}>تاريخ الإنشاء: <Text style={{ color: colors.t1, fontWeight: '800' }}>{formatDateShort(req.created_at)}</Text></Text>
              {!!req.approved_at && <Text style={{ color: colors.t3, marginTop: 2 }}>تاريخ الاعتماد: <Text style={{ color: colors.t1, fontWeight: '800' }}>{formatDateShort(req.approved_at)}</Text></Text>}
              {!!req.approved_by_name && <Text style={{ color: colors.t3, marginTop: 2 }}>المعتمد بواسطة: <Text style={{ color: colors.t1, fontWeight: '800' }}>{req.approved_by_name}</Text></Text>}
            </TouchableOpacity>
          );})}
        </ScrollView>
          )}
        </>
      )}
    </View>
  );
}
