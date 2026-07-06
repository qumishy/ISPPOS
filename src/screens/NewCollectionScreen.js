import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, Alert, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getLocalUsers, getLocalPosDB, getLocalInvoices, getInvoicePaidSum, createLocalCollection, getInvoiceCardReturnOptions
} from '../services/database';
import { todayISO, formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Row, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';
import { useLoading } from '../services/LoadingContext';
import { uuidv4 } from '../services/dbCore';


export default function NewCollectionScreen({ route, navigation }) {
  const { user, selectedPhase, projectId } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();

  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  // 🛡️ فحص الصلاحية: المدير لا يضيف تحصيلات
  if (user?.role === 'admin') {
    return (
      <View style={[s.screen, { justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: colors.bg }]}>
        <Text style={{ fontSize: 60 }}>💰</Text>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.red, textAlign: 'center', marginTop: 15 }}>منع إدخال التحصيل</Text>
        <Text style={{ color: colors.t3, textAlign: 'center', marginTop: 10, lineHeight: 22 }}>
          لا يُسمح للمدير بإضافة سندات قبض يدوياً؛ يجب أن يقوم المندوب برفع السند، ومن ثم تقوم أنت باعتماده من شاشة "التحصيلات المعلقة".
        </Text>
        <Btn label="العودة" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 25, width: '100%' }} />
      </View>
    );
  }

  // 🛡️ فحص حالة المرحلة: إذا كانت مغلقة لا يمكن الإضافة
  if (selectedPhase?.status === 'closed') {
    return (
      <View style={[s.screen, { justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: colors.bg }]}>
        <Text style={{ fontSize: 60 }}>🔒</Text>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.red, textAlign: 'center', marginTop: 15 }}>المرحلة مغلقة</Text>
        <Text style={{ color: colors.t3, textAlign: 'center', marginTop: 10, lineHeight: 22 }}>
          عذراً، المرحلة الحالية ({selectedPhase.name}) مغلقة. لا يمكن إضافة تحصيلات جديدة حتى يتم تفعيل مرحلة جديدة.
        </Text>
        <Btn label="العودة" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 25, width: '100%' }} />
      </View>
    );
  }

  const [agents, setAgents] = useState([]);
  const [pos, setPos] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnRows, setReturnRows] = useState([]);
  const [cardReturns, setCardReturns] = useState({});
  const [hasCardReturn, setHasCardReturn] = useState(false);
  const [invoiceHint, setInvoiceHint] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ agent_id: user?.role === 'agent' ? user.id : '', pos_id: '', invoice_id: '', amount: '', method: 'cash', reference_number: '', collection_date: todayISO(), note: '' });
  const [saving, setSaving] = useState(false);

  const applyPOSInvoices = async (posId, sourceInvoices, presetInvoiceId = null) => {
    const posInvoices = (sourceInvoices || []).filter(inv => String(inv.pos_id) === String(posId));
    setInvoices(posInvoices);
    setSelectedInvoice(null);
    setReturnRows([]);
    setCardReturns({});
    setHasCardReturn(false);
    setInvoiceHint('');

    if (!posId) {
      setForm(f => ({ ...f, pos_id: '', invoice_id: '', amount: '' }));
      return;
    }

    if (posInvoices.length === 0) {
      setForm(f => ({ ...f, pos_id: posId, invoice_id: '', amount: '' }));
      setInvoiceHint('لا توجد فواتير مستحقة أو مؤهلة لهذه النقطة.');
      return;
    }

    if (presetInvoiceId) {
      const matched = posInvoices.find(inv => String(inv.id) === String(presetInvoiceId));
      if (matched) {
        const paidSum = await getInvoicePaidSum(matched.id);
        const rem = Math.max(0, (matched.net_amount || matched.total_amount) - paidSum);
        const rows = await getInvoiceCardReturnOptions(matched.id);
        setReturnRows(rows);
        setSelectedInvoice({ ...matched, paid_sum: paidSum });
        setForm(f => ({ ...f, pos_id: posId, invoice_id: matched.id, amount: String(rem) }));
        return;
      }
    }

    if (posInvoices.length === 1) {
      const onlyInv = posInvoices[0];
      const paidSum = await getInvoicePaidSum(onlyInv.id);
      const rem = Math.max(0, (onlyInv.net_amount || onlyInv.total_amount) - paidSum);
      const rows = await getInvoiceCardReturnOptions(onlyInv.id);
      setReturnRows(rows);
      setSelectedInvoice({ ...onlyInv, paid_sum: paidSum });
      setForm(f => ({ ...f, pos_id: posId, invoice_id: onlyInv.id, amount: String(rem) }));
      return;
    }

    setForm(f => ({ ...f, pos_id: posId, invoice_id: '', amount: '' }));
    setInvoiceHint('يوجد أكثر من فاتورة مستحقة. اختر الفاتورة المطلوبة.');
  };

  useEffect(() => {
    async function load() {
      try {
        const invoiceFilters = { onlyWithBalance: true, excludePendingDiscount: true };
        if (selectedPhase?.id) invoiceFilters.phase_id = selectedPhase.id;
        if (projectId) invoiceFilters.project_id = projectId;

        const [a, p, i] = await Promise.all([getLocalUsers(projectId), getLocalPosDB(projectId), getLocalInvoices(invoiceFilters)]);
        setAgents(a.filter(u => u.role === 'agent' && u.active)); setPos(p);
        setInvoices(i || []); setAllInvoices(i || []);

        if (route?.params?.pos_id) {
           await applyPOSInvoices(route.params.pos_id, i || [], route.params.invoice_id);
        }
      } catch (e) { }
      setDataLoading(false);
    }
    load();
  }, [user, route?.params, selectedPhase?.id, projectId]);

  const onSelectInvoice = async (invId) => {
    const inv = invoices.find(x => x.id === invId);
    if (!inv) { setSelectedInvoice(null); setReturnRows([]); setCardReturns({}); setHasCardReturn(false); return; }
    const paidSum = await getInvoicePaidSum(invId);
    const rows = await getInvoiceCardReturnOptions(invId);
    setReturnRows(rows);
    setCardReturns({});
    setHasCardReturn(false);
    setSelectedInvoice({ ...inv, paid_sum: paidSum });
    const rem = Math.max(0, (inv.net_amount || inv.total_amount) - paidSum);
    setForm(f => ({ ...f, invoice_id: invId, amount: String(rem) }));
  };

  const totalReturnAmount = hasCardReturn ? returnRows.reduce((sum, row) => {
    const count = Math.max(0, Number(cardReturns[row.invoice_item_id] || 0));
    return sum + count * Number(row.card_value || 0);
  }, 0) : 0;
  const invoiceNet = Number(selectedInvoice?.net_amount || selectedInvoice?.total_amount || 0);
  const paidSum = Number(selectedInvoice?.paid_sum || 0);
  const collectionAmount = Number(form.amount || 0);
  const netAfterReturn = Math.max(0, invoiceNet - totalReturnAmount);
  const collectionCoverageAmount = collectionAmount + totalReturnAmount;
  const remainingAfterCollectionAndReturn = Math.max(0, netAfterReturn - paidSum - collectionAmount);
  const coverageComplete = collectionCoverageAmount > 0 && remainingAfterCollectionAndReturn <= 0.1;
  const paymentStatusLabel = coverageComplete
    ? 'مسددة'
    : collectionCoverageAmount > 0
      ? 'مسددة جزئياً'
      : 'غير مسددة';
  const approvalStatusLabel = coverageComplete
    ? 'بانتظار اعتماد التحصيل'
    : 'غير معتمدة';

  const setReturnedCardsCount = (row, value) => {
    const raw = String(value || '').replace(/[^\d]/g, '');
    const count = Math.max(0, Math.floor(Number(raw || 0)));
    const capped = Math.min(count, Number(row.max_returnable_cards || 0));
    setCardReturns(prev => ({ ...prev, [row.invoice_item_id]: capped ? String(capped) : '' }));
    if (selectedInvoice) {
      const nextReturns = returnRows.reduce((sum, r) => {
        const nextCount = r.invoice_item_id === row.invoice_item_id ? capped : Math.max(0, Number(cardReturns[r.invoice_item_id] || 0));
        return sum + nextCount * Number(r.card_value || 0);
      }, 0);
      const rem = Math.max(0, Number(selectedInvoice.net_amount || selectedInvoice.total_amount || 0) - Number(selectedInvoice.paid_sum || 0) - nextReturns);
      setForm(f => ({ ...f, amount: String(rem) }));
    }
  };

  const save = async () => {
    if (saving) return;
    if (!form.pos_id || !form.amount || !form.invoice_id) { Alert.alert('تنبيه', 'يجب تحديد نقطة البيع والفاتورة والمبلغ'); return; }

    if (selectedInvoice) {
      const selectedReturns = hasCardReturn ? returnRows.reduce((sum, row) => sum + Math.max(0, Number(cardReturns[row.invoice_item_id] || 0)) * Number(row.card_value || 0), 0) : 0;
      const rem = (selectedInvoice.net_amount || selectedInvoice.total_amount) - (selectedInvoice.paid_sum || 0) - selectedReturns;
      if (parseFloat(form.amount) > (rem + 0.1)) {
        Alert.alert('⚠️ خطأ في المبلغ', `المبلغ المدخل (${form.amount}) أكبر من المتبقي للفاتورة (${rem.toFixed(2)})`);
        return;
      }
    }

    Alert.alert('تأكيد', 'هل أنت متأكد من حفظ سند القبض؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تأكيد وحفظ', onPress: async () => {
          setSaving(true);
          showLoading('جاري حفظ سند التحصيل...');
          try {
            const operationGroupId = uuidv4();
            await createLocalCollection({
              ...form,
              amount: parseFloat(form.amount),
              project_id: projectId,
              phase_id: selectedPhase?.id || null,
              user_id: user?.id || null,
              collector_id: user?.id || null,
              agent_id: form.agent_id || user?.id || null,
              operation_group_id: operationGroupId,
              card_returns: hasCardReturn ? returnRows.map(row => ({
                invoice_item_id: row.invoice_item_id,
                returned_cards_count: Math.max(0, Number(cardReturns[row.invoice_item_id] || 0)),
                card_value: Number(row.card_value || 0),
              })).filter(row => row.returned_cards_count > 0) : [],
            });
            Alert.alert('تم الحفظ', 'تم تسجيل التحصيل بنجاح وسيتم إشعار الإدارة.', [{ text: 'موافق', onPress: () => navigation.goBack() }]);
          } catch (e) {
            Alert.alert('خطأ', e.message || 'حدث خطأ أثناء الحفظ');
          } finally {
            setSaving(false);
            hideLoading();
          }
        }
      }
    ]);
  };

  if (dataLoading) return <Loading />;
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ padding: spacing.lg, overflow: 'visible' }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[s.section, { zIndex: 40, elevation: 20, overflow: 'visible' }]}>
        <Text style={s.sectionTitle}>بيانات التحصيل</Text>
        {user?.role !== 'agent' && (
          <Picker
            label="المندوب *"
            options={agents.map(a => ({ value: a.id, label: a.name }))}
            value={form.agent_id}
            onChange={v => setForm({ ...form, agent_id: v })}
            searchable={true}
            dropdownZIndex={1800}
            wrapperStyle={{ zIndex: 18 }}
          />
        )}
        <Picker
          label="نقطة البيع *"
          options={pos.map(p => ({ value: p.id, label: p.name }))}
          value={form.pos_id}
          onChange={async (v) => { await applyPOSInvoices(v, allInvoices); }}
          searchable={true}
          dropdownZIndex={1700}
          wrapperStyle={{ zIndex: 17 }}
        />
        <Picker
          label="الفاتورة *"
          options={invoices.map(i => ({ value: i.id, label: i.invoice_number }))}
          value={form.invoice_id}
          onChange={onSelectInvoice}
          searchable={true}
          dropdownZIndex={1600}
          wrapperStyle={{ zIndex: 16 }}
        />
        {!!invoiceHint && (
          <Text style={{ marginTop: 4, fontSize: 12, color: colors.t3, textAlign: 'right', fontWeight: '700' }}>
            {invoiceHint}
          </Text>
        )}
      </View>
      {selectedInvoice && (
        <View style={[s.section, { marginTop: spacing.md, zIndex: 5, elevation: 1 }]}>
          <Text style={s.sectionTitle}>ملخص الفاتورة</Text>
          <View style={{ marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 }}>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ color: colors.t3 }}>رقم الفاتورة</Text>
              <Text style={{ color: colors.t1, fontWeight: '800' }}>{selectedInvoice.invoice_number}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ color: colors.t3 }}>نقطة البيع</Text>
              <Text style={{ color: colors.t1, fontWeight: '700' }}>{selectedInvoice.pos_name || '-'}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ color: colors.t3 }}>صافي الفاتورة</Text>
              <Text style={{ color: colors.blue, fontWeight: '900' }}>{formatCurrency(selectedInvoice.net_amount || selectedInvoice.total_amount)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ color: colors.t3 }}>المبلغ المدفوع</Text>
              <Text style={{ color: colors.green, fontWeight: '700' }}>{formatCurrency(selectedInvoice.paid_sum || 0)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ color: colors.t3 }}>المبلغ المتبقي</Text>
              <Text style={{ color: colors.orange, fontWeight: '900' }}>{formatCurrency(Math.max(0, (selectedInvoice.net_amount || selectedInvoice.total_amount) - (selectedInvoice.paid_sum || 0)))}</Text>
            </Row>
          </View>
        </View>
      )}
      {selectedInvoice && (() => {
        const hasDiscount = Number(selectedInvoice.discount_requested_value || 0) > 0;
        if (!hasDiscount) return null;
        const ds = String(selectedInvoice.discount_status || '').trim();
        const isPending = !['approved','auto_approved','rejected','none',''].includes(ds);
        const isApproved = ['approved','auto_approved'].includes(ds);
        const tone = isPending ? colors.danger : isApproved ? colors.green : colors.t2;
        const bg = isPending ? colors.danger + '15' : isApproved ? colors.green + '15' : colors.t3 + '15';
        return (
          <View style={[s.section, { marginTop: spacing.md, borderColor: tone + '50', zIndex: 4, elevation: 1 }]}>
            <Text style={s.sectionTitle}>حالة الخصم</Text>
            <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: bg, borderWidth: 1, borderColor: tone + '50' }}>
              <Row style={{ alignItems: 'center', gap: 6 }}>
                <Feather name="percent" size={14} color={tone} />
                <Text style={{ fontWeight: 'bold', fontSize: 13, color: tone }}>
                  {isPending ? '⚠️ الفاتورة بها خصم معلق' : isApproved ? '✅ الفاتورة بها خصم معتمد' : '❌ خصم مرفوض'}
                </Text>
              </Row>
              {isPending && <Text style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>التحصيل محظور حتى يعتمد المدير أو يرفض الخصم.</Text>}
              {isApproved && <Text style={{ fontSize: 11, color: colors.green, marginTop: 4 }}>التحصيل مبني على الصافي بعد الخصم المعتمد.</Text>}
            </View>
          </View>
        );
      })()}
      <View style={[s.section, { marginTop: spacing.md, zIndex: 3, elevation: 1 }]}>
        <Text style={s.sectionTitle}>إدخال التحصيل</Text>
        <View style={{ marginTop: 10 }}>
          <Input label="مبلغ التحصيل *" value={form.amount} onChangeText={v => setForm({ ...form, amount: v })} keyboardType="numeric" />
          <Picker label="طريقة التحصيل" options={[{ value: 'cash', label: 'نقدي' }, { value: 'transfer', label: 'تحويل' }, { value: 'check', label: 'شيك' }]} value={form.method} onChange={v => setForm({ ...form, method: v })} />
          <Input label="ملاحظات" value={form.note} onChangeText={v => setForm({ ...form, note: v })} multiline />
        </View>
      </View>
      {selectedInvoice && returnRows.length > 0 && (
        <View style={[s.section, { marginTop: spacing.md, zIndex: 2, elevation: 1 }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              const next = !hasCardReturn;
              setHasCardReturn(next);
              if (!next) {
                setCardReturns({});
                if (selectedInvoice) {
                  const rem = Math.max(0, Number(selectedInvoice.net_amount || selectedInvoice.total_amount || 0) - Number(selectedInvoice.paid_sum || 0));
                  setForm(f => ({ ...f, amount: String(rem) }));
                }
              }
            }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
          >
            <Text style={s.sectionTitle}>يوجد مرتجع كروت</Text>
            <Feather name={hasCardReturn ? 'check-square' : 'square'} size={22} color={hasCardReturn ? colors.primary : colors.t3} />
          </TouchableOpacity>
        </View>
      )}
      {selectedInvoice && hasCardReturn && returnRows.length > 0 && (
        <View style={[s.section, { marginTop: spacing.md, zIndex: 2, elevation: 1 }]}>
          <Text style={s.sectionTitle}>مرتجع الكروت</Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            {returnRows.map(row => {
              const returnedCount = Math.max(0, Number(cardReturns[row.invoice_item_id] || 0));
              const amount = returnedCount * Number(row.card_value || 0);
              return (
                <View key={row.invoice_item_id} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 }}>
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                    <Text style={{ color: colors.t3 }}>اسم الفئة</Text>
                    <Text style={{ color: colors.t1, fontWeight: '800', flexShrink: 1, textAlign: 'right' }}>{row.category_name}</Text>
                  </Row>
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                    <Text style={{ color: colors.t3 }}>كمية الفاتورة</Text>
                    <Text style={{ color: colors.t1, fontWeight: '700' }}>{row.quantity}</Text>
                  </Row>
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                    <Text style={{ color: colors.t3 }}>عدد الكروت في الورقة</Text>
                    <Text style={{ color: colors.t1, fontWeight: '700' }}>{row.cards_per_sheet}</Text>
                  </Row>
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                    <Text style={{ color: colors.t3 }}>إجمالي الكروت</Text>
                    <Text style={{ color: colors.t1, fontWeight: '700' }}>{row.total_cards_sold}</Text>
                  </Row>
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                    <Text style={{ color: colors.t3 }}>قيمة الكرت</Text>
                    <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(row.card_value || 0)}</Text>
                  </Row>
                  <Input
                    label="عدد الكروت المرتجعة"
                    value={String(cardReturns[row.invoice_item_id] || '')}
                    onChangeText={v => setReturnedCardsCount(row, v)}
                    keyboardType="numeric"
                    placeholder={`0 - ${row.max_returnable_cards}`}
                  />
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                    <Text style={{ color: colors.t3 }}>قيمة المرتجع</Text>
                    <Text style={{ color: colors.orange, fontWeight: '900' }}>{formatCurrency(amount)}</Text>
                  </Row>
                </View>
              );
            })}
            <View style={{ paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: colors.t3 }}>مبلغ التحصيل</Text>
                <Text style={{ color: colors.green, fontWeight: '900' }}>{formatCurrency(collectionAmount)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: colors.t3 }}>إجمالي المرتجع</Text>
                <Text style={{ color: colors.orange, fontWeight: '900' }}>{formatCurrency(totalReturnAmount)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: colors.t3 }}>الإجمالي المغطي</Text>
                <Text style={{ color: colors.blue, fontWeight: '900' }}>{formatCurrency(collectionCoverageAmount)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: colors.t3 }}>الصافي بعد المرتجع</Text>
                <Text style={{ color: colors.blue, fontWeight: '900' }}>{formatCurrency(netAfterReturn)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: colors.t3 }}>المتبقي بعد التحصيل والمرتجع</Text>
                <Text style={{ color: colors.green, fontWeight: '900' }}>{formatCurrency(remainingAfterCollectionAndReturn)}</Text>
              </Row>
            </View>
          </View>
        </View>
      )}
      {selectedInvoice && (
        <View style={[s.section, { marginTop: spacing.md, zIndex: 2, elevation: 1 }]}>
          <Text style={s.sectionTitle}>حالة التحصيل</Text>
          <View style={{ marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 }}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: colors.t3 }}>حالة التحصيل</Text>
              <Text style={{ color: coverageComplete ? colors.success : colors.orange, fontWeight: '800' }}>
                {paymentStatusLabel}
              </Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: colors.t3 }}>حالة الاعتماد</Text>
              <Text style={{ color: coverageComplete ? colors.warning : colors.t3, fontWeight: '800' }}>
                {approvalStatusLabel}
              </Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: colors.t3 }}>الملاحظات</Text>
              <Text style={{ color: colors.t1, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{form.note || '-'}</Text>
            </Row>
          </View>
        </View>
      )}
      <View style={[s.section, { marginTop: spacing.md, zIndex: 1, elevation: 1 }]}>
        <Text style={s.sectionTitle}>الإجراءات</Text>
        <Row style={[s.actions, { marginTop: 10 }]}>
          <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} disabled={saving} />
          <Btn label="حفظ التحصيل" icon="save" variant="primary" style={{ flex: 2 }} onPress={save} loading={saving} disabled={saving} />
        </Row>
      </View>
    </ScrollView>
  );
}
