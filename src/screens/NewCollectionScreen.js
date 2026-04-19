import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getLocalUsers, getLocalPosDB, getLocalInvoices, getInvoicePaidSum, createLocalCollection
} from '../services/database';
import { todayISO, formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Row, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';

export default function NewCollectionScreen({ route, navigation }) {
  const { user } = useAuth();
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

  const [agents, setAgents] = useState([]);
  const [pos, setPos] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ agent_id: user?.role === 'agent' ? user.id : '', pos_id: '', invoice_id: '', amount: '', method: 'cash', reference_number: '', collection_date: todayISO(), note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [a, p, i] = await Promise.all([getLocalUsers(), getLocalPosDB(), getLocalInvoices({ onlyWithBalance: true })]);
        setAgents(a.filter(u => u.role === 'agent' && u.active)); setPos(p);
        setInvoices(i || []); setAllInvoices(i || []);

        if (route?.params?.pos_id) {
           const posInvs = (i || []).filter(inv => inv.pos_id === route.params.pos_id);
           setInvoices(posInvs);
           const invToSel = posInvs.find(x => x.id === route.params.invoice_id) || posInvs[0];
           if (invToSel) {
              const paidSum = await getInvoicePaidSum(invToSel.id);
              setSelectedInvoice({ ...invToSel, paid_sum: paidSum });
              const rem = Math.max(0, (invToSel.net_amount || invToSel.total_amount) - paidSum);
              setForm(f => ({ ...f, pos_id: route.params.pos_id, invoice_id: invToSel.id, amount: String(rem) }));
           } else {
              setForm(f => ({ ...f, pos_id: route.params.pos_id }));
           }
        }
      } catch (e) { }
      setDataLoading(false);
    }
    load();
  }, [user, route?.params]);

  const onSelectInvoice = async (invId) => {
    const inv = invoices.find(x => x.id === invId);
    if (!inv) { setSelectedInvoice(null); return; }
    const paidSum = await getInvoicePaidSum(invId);
    setSelectedInvoice({ ...inv, paid_sum: paidSum });
    const rem = Math.max(0, (inv.net_amount || inv.total_amount) - paidSum);
    setForm(f => ({ ...f, invoice_id: invId, amount: String(rem) }));
  };

  const save = async () => {
    if (!form.pos_id || !form.amount || !form.invoice_id) { Alert.alert('تنبيه', 'يجب تحديد نقطة البيع والفاتورة والمبلغ'); return; }

    if (selectedInvoice) {
      const rem = (selectedInvoice.net_amount || selectedInvoice.total_amount) - (selectedInvoice.paid_sum || 0);
      if (parseFloat(form.amount) > (rem + 0.1)) {
        Alert.alert('⚠️ خطأ في المبلغ', `المبلغ المدخل (${form.amount}) أكبر من المتبقي للفاتورة (${rem.toFixed(2)})`);
        return;
      }
    }

    setSaving(true);
    Alert.alert('تأكيد', 'هل أنت متأكد من حفظ سند القبض؟', [
      { text: 'إلغاء', style: 'cancel', onPress: () => setSaving(false) },
      {
        text: 'تأكيد وحفظ', onPress: async () => {
          try {
            await createLocalCollection({ ...form, amount: parseFloat(form.amount) });
            setSaving(false);
            Alert.alert('✅ تم', 'تم رفع الإشعار بنجاح', [{ text: 'موافق', onPress: () => navigation.goBack() }]);
          } catch (e) {
            setSaving(false);
            Alert.alert('خطأ', e.message);
          }
        }
      }
    ]);
  };

  if (dataLoading) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={s.section}>
        {user?.role !== 'agent' && <Picker label="المندوب *" options={agents.map(a => ({ value: a.id, label: a.name }))} value={form.agent_id} onChange={v => setForm({ ...form, agent_id: v })} />}
        <Picker label="نقطة البيع *" options={pos.map(p => ({ value: p.id, label: p.name }))} value={form.pos_id} onChange={v => { setInvoices(allInvoices.filter(i => String(i.pos_id) === String(v))); setForm({ ...form, pos_id: v, invoice_id: '' }); setSelectedInvoice(null); }} />
        <Picker label="الفاتورة *" options={invoices.map(i => ({ value: i.id, label: i.invoice_number }))} value={form.invoice_id} onChange={onSelectInvoice} />
        {selectedInvoice && (
          <View style={s.infoBox}>
            <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: colors.t3 }}>المستحق:</Text><Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(selectedInvoice.net_amount || selectedInvoice.total_amount)}</Text></Row>
            <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: colors.t3 }}>المحصل:</Text><Text style={{ color: colors.green }}>{formatCurrency(selectedInvoice.paid_sum || 0)}</Text></Row>
            <View style={s.divider} />
            <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontWeight: 'bold' }}>المتبقي:</Text><Text style={{ color: colors.orange, fontWeight: '800' }}>{formatCurrency(Math.max(0, (selectedInvoice.net_amount || selectedInvoice.total_amount) - (selectedInvoice.paid_sum || 0)))}</Text></Row>
          </View>
        )}
        <Input label="المبلغ *" value={form.amount} onChangeText={v => setForm({ ...form, amount: v })} keyboardType="numeric" />
        <Picker label="الطريقة" options={[{ value: 'cash', label: 'نقدي' }, { value: 'transfer', label: 'تحويل' }, { value: 'check', label: 'شيك' }]} value={form.method} onChange={v => setForm({ ...form, method: v })} />
        <Input label="ملاحظات" value={form.note} onChangeText={v => setForm({ ...form, note: v })} multiline />
        <Row style={s.actions}><Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} /><Btn label={saving ? '...' : '💾 حفظ'} variant="primary" style={{ flex: 2 }} onPress={save} /></Row>
      </View>
    </ScrollView>
  );
}
