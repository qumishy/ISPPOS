import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getLocalUsers, getLocalCategories, getLocalWallets, getLocalInvoices,
  getBatchesByAgent, createLocalInvoice, addInvoiceItem, getLocalInvoiceItems,
  getLocalPosDB, subscribeDataChanges, getPOSRemainingCredit
} from '../services/database';
import { todayISO, formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Row, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';
import { useLoading } from '../services/LoadingContext';
import { uuidv4 } from '../services/dbCore';


export default function NewInvoiceScreen({ navigation }) {
  const { user, selectedPhase, projectId } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  // 🛡️ فحص الصلاحية: المدير لا يضيف فواتير
  if (user?.role === 'admin') {
    return (
      <View style={[s.screen, { justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: colors.bg }]}>
        <Text style={{ fontSize: 60 }}>🚫</Text>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.red, textAlign: 'center', marginTop: 15 }}>تنبيه: صلاحية محدودة</Text>
        <Text style={{ color: colors.t3, textAlign: 'center', marginTop: 10, lineHeight: 22 }}>
          عذراً، لا يمكن للمدير إضافة فواتير مباشرة. هذه الشاشة مخصصة للمناديب لإدخال مبيعاتهم الميدانية. دورك كمدير هو الرقابة والاعتماد فقط.
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
          عذراً، المرحلة الحالية ({selectedPhase.name}) مغلقة. لا يمكن إضافة فواتير جديدة حتى يتم تفعيل مرحلة جديدة.
        </Text>
        <Btn label="العودة" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 25, width: '100%' }} />
      </View>
    );
  }

  const [pos, setPos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [batches, setBatches] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({
    pos_id: '', agent_id: user?.role === 'agent' ? user.id : '',
    type: 'credit', invoice_date: todayISO(), notes: '', discount: '0', discount_reason: '',
  });
  const [items, setItems] = useState([]);
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [newItem, setNewItem] = useState({ category_id: '', wallet_id: '', batch_id: '', unit_price: '', quantity: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savePromptOpenRef = useRef(false);
  const saveInFlightRef = useRef(false);
  // Live credit state: loaded from SQLite whenever POS or items change
  const [posCredit, setPosCredit] = useState(null); // { creditLimit, usedCredit, remainingCredit }

  useEffect(() => {
    async function load() {
      try {
        const agentId = user?.role === 'agent' ? user.id : null;
        const [posR, agentR, catR, walR, invsR] = await Promise.all([
          getLocalPosDB(projectId), getLocalUsers(projectId), getLocalCategories(projectId), getLocalWallets(agentId || undefined, projectId), getLocalInvoices({ onlyWithBalance: true, project_id: projectId })
        ]);
        setPos(posR.filter(p => !p.is_blocked));
        setAgents(agentR.filter(a => a.role === 'agent' && a.active));
        setCategories(catR.filter(c => c.active));
        setPendingInvoices(invsR || []);
        const w = walR.map(x => ({ ...x, remaining_cards: Number(x.total_cards || 0) - Number(x.sold_cards || 0) }));
        setWallets(w.filter(x => x.remaining_cards > 0));
        if (agentId) setBatches(await getBatchesByAgent(agentId, projectId));
      } catch (e) { console.error('[NewInvoiceScreen] load error:', e?.message || e); }

      setDataLoading(false);
    }
    load();

    // 🔄 إعادة تحميل المحافظ تلقائياً عند وصول تحديث من المزامنة
    const unsub = subscribeDataChanges((event) => {
      if (event.type !== 'agent_wallets' && event.type !== 'all') return;
      const agentId = user?.role === 'agent' ? user.id : null;
      getLocalWallets(agentId || undefined, projectId).then(walR => {
        const w = walR.map(x => ({ ...x, remaining_cards: Number(x.total_cards || 0) - Number(x.sold_cards || 0) }));
        setWallets(w.filter(x => x.remaining_cards > 0));
        setDataLoading(false);
      }).catch(() => { });
    });
    return () => unsub && unsub();
  }, [user]);

  // ── Live credit re-query whenever POS or draft items change ──
  useEffect(() => {
    if (!form.pos_id) { setPosCredit(null); return; }
    getPOSRemainingCredit(form.pos_id)
      .then(setPosCredit)
      .catch(() => setPosCredit(null));
  }, [form.pos_id, items]);

  const dynamicWallets = wallets.map(w => {
    const usedInForm = items.filter(i => i.wallet_id === w.id).reduce((sum, i) => sum + i.quantity, 0);
    return { ...w, remaining_cards: w.remaining_cards - usedInForm };
  }).filter(w => w.remaining_cards > 0 && (!form.agent_id || w.agent_id === form.agent_id));

  const availableCategories = categories.filter(c => dynamicWallets.some(w => w.category_id === c.id));

  const onSelectCategory = (catId) => {
    const cat = categories.find(c => c.id === catId);
    const catWallets = dynamicWallets.filter(w => w.category_id === catId);
    setNewItem(f => ({ ...f, category_id: catId, unit_price: String(cat?.price || ''), wallet_id: catWallets?.length === 1 ? catWallets[0].id : '', batch_id: '' }));
  };

  const filteredWallets = dynamicWallets.filter(w => !newItem.category_id || w.category_id === newItem.category_id);

  const addItem = () => {
    if (!newItem.category_id || !newItem.quantity || !newItem.unit_price) { Alert.alert('تنبيه', 'اختر الفئة وأدخل الكمية والسعر'); return; }
    if (!String(newItem.batch_id || '').trim()) { Alert.alert('تنبيه', 'يرجى اختيار الدفعة'); return; }
    const qty = parseInt(newItem.quantity) || 0;
    const wallet = dynamicWallets.find(w => w.id === newItem.wallet_id);
    if (!wallet || wallet.batch_id !== newItem.batch_id) { Alert.alert('تنبيه', 'يرجى اختيار الدفعة'); return; }
    if (wallet && qty > wallet.remaining_cards) { Alert.alert('خطأ', `المتاح المتبقي في المحفظة هو: ${wallet.remaining_cards} ورقة فقط`); return; }
    const cat = categories.find(c => c.id === newItem.category_id);
    setItems(prev => [...prev, { ...newItem, cat_name: cat?.name || '—', batch_number: wallet?.batches?.serial_number || '', quantity: qty, unit_price: parseFloat(newItem.unit_price), total: qty * parseFloat(newItem.unit_price), id: Date.now().toString() }]);
    setNewItem({ category_id: '', wallet_id: '', batch_id: '', unit_price: '', quantity: '' });
  };

  const openSavedInvoiceDetails = async (invoiceId) => {
    console.log('[InvoiceSave] navigation start');
    showLoading('جاري تحميل تفاصيل الفاتورة...');
    const [savedInvoices, savedItems] = await Promise.all([
      getLocalInvoices({ id: invoiceId, project_id: projectId }),
      getLocalInvoiceItems(invoiceId),
    ]);

    if (!savedInvoices?.length) {
      throw new Error('تم حفظ الفاتورة لكن تعذر تحميلها من قاعدة البيانات المحلية.');
    }
    if (items.length > 0 && (savedItems || []).length === 0) {
      throw new Error('تم حفظ الفاتورة لكن تعذر تحميل بنودها من قاعدة البيانات المحلية.');
    }

    navigation.replace('InvoiceDetail', {
      id: invoiceId,
      invoice_id: invoiceId,
      invoiceId,
      refresh_at: Date.now(),
      source: 'new_invoice',
    });
  };

  const confirmAndSaveInvoice = async () => {
    if (saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    setIsSaving(true);
    setSaveError('');
    showLoading('جاري حفظ الفاتورة وتحديث المخزن...');
    console.log('[InvoiceSave] save start');

    try {
      const operationGroupId = uuidv4();
      const sub = items.reduce((s, i) => s + i.total, 0);
      const { id } = await createLocalInvoice({
        ...form,
        total_amount: sub,
        discount_requested_value: discountAmount,
        discount_requested_reason: String(form.discount_reason || '').trim(),
        discount_requested_by: form.agent_id,
        project_id: projectId,
        phase_id: selectedPhase?.id || null,
        agent_id: form.agent_id || user?.id || null,
        operation_group_id: operationGroupId,
      });
      console.log('[InvoiceSave] invoice saved', id);

      try {
        for (const item of items) {
          await addInvoiceItem({
            invoice_id: id,
            category_id: item.category_id,
            batch_id: item.batch_id || '',
            wallet_id: item.wallet_id || '',
            unit_price: item.unit_price,
            quantity: item.quantity,
            total_price: item.unit_price * item.quantity,
            operation_group_id: operationGroupId,
          });
        }
        console.log('[InvoiceSave] items saved');
        console.log('[InvoiceSave] inventory updated');
        console.log('[InvoiceSave] sync queued');
        console.log('[InvoiceSave] operation logged');
      } catch (itemsErr) {
        console.log('[InvoiceSave] items/inventory failed:', itemsErr?.message || itemsErr);
        throw new Error(itemsErr?.message || 'فشل تحديث المخزون أثناء حفظ بنود الفاتورة.');
      }

      await openSavedInvoiceDetails(id);
    } catch (e) {
      const message = e?.message || 'حدث خطأ أثناء الحفظ';
      setSaveError(message);
      Alert.alert('خطأ', message);
    } finally {
      console.log('[InvoiceSave] save finished/finally');
      saveInFlightRef.current = false;
      setIsSaving(false);
      hideLoading();
    }
  };

  const performSave = async () => {
    if (!form.pos_id || !form.agent_id) { Alert.alert('تنبيه', 'اختر نقطة البيع والمندوب'); return; }
    if (items.length === 0) { Alert.alert('تنبيه', 'أضف بنداً واحداً على الأقل'); return; }
    const disc = Math.max(0, parseFloat(form.discount) || 0);
    const discountReason = String(form.discount_reason || '').trim();
    if (disc > 0 && !discountReason) { Alert.alert('تنبيه', 'سبب الخصم مطلوب عند إدخال خصم.'); return; }
    if (isSaving || savePromptOpenRef.current || saveInFlightRef.current) return;

    setSaveError('');
    savePromptOpenRef.current = true;
    Alert.alert('تأكيد الحفظ', 'هل أنت متأكد من مراجعة البنود وحفظ الفاتورة؟', [
      { text: 'إلغاء', style: 'cancel', onPress: () => { savePromptOpenRef.current = false; } },
      {
        text: 'تأكيد وحفظ', onPress: async () => {
          if (saveInFlightRef.current) return;
          savePromptOpenRef.current = false;
          await confirmAndSaveInvoice();
        }
      }
    ]);
  };

  if (dataLoading) return <Loading />;

  const isWalletEmpty = user?.role === 'agent' && wallets.length === 0;
  const selectedPOS = pos.find(p => p.id === form.pos_id);
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discountAmount = Math.max(0, parseFloat(form.discount) || 0);
  const netAmount = Math.max(0, subtotal - discountAmount);
  // Live credit figures from SQLite (excludes fully paid invoices, includes draft)
  const creditLimit   = posCredit?.creditLimit   ?? Number(selectedPOS?.credit_limit  || 0);
  const usedCredit    = posCredit?.usedCredit    ?? Number(selectedPOS?.credit_used   || 0);
  const remainingAfterDraft = posCredit != null
    ? posCredit.remainingCredit - netAmount   // live: existing debt already excluded
    : creditLimit - (usedCredit + netAmount); // fallback when posCredit not yet loaded
  const isCreditExceeded = creditLimit > 0 && remainingAfterDraft < -0.01;
  const isSaveDisabled = isWalletEmpty || isCreditExceeded || isSaving;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView pointerEvents={isSaving ? 'none' : 'auto'} style={s.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}>
        <View style={s.invoiceHeader}><Text style={s.invoiceTitle}>🧾 مبيعات</Text><Text style={s.invoiceDate}>{form.invoice_date}</Text></View>
        <View style={s.section}>
          <Picker label="نقطة البيع *" options={pos.map(p => ({ value: p.id, label: p.name }))} value={form.pos_id} onChange={v => setForm({ ...form, pos_id: v })} placeholder="اختر العميل..." searchable={true} />
          {selectedPOS && (
            pendingInvoices.filter(i => i.pos_id === form.pos_id).length > 0 ? (
              <View style={{ backgroundColor: colors.orange + '15', padding: 12, borderRadius: radius.sm, marginTop: -8, marginBottom: 15, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.orange }}>
                <Text style={{ fontSize: 13, color: colors.orange, marginBottom: 5 }}>
                  ⚠️ تنبيه: توجد فواتير معلقة للعميل، يرجى تحصيل الفاتورة السابقة.
                </Text>
                {pendingInvoices.filter(i => i.pos_id === form.pos_id).map(inv => (
                  <View key={inv.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg, padding: 8, borderRadius: 5, marginTop: 5 }}>
                    <Text style={{ fontSize: 12, color: colors.orange }}>رقم: {inv.invoice_number} ({inv.invoice_date})</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('NewCollection', { pos_id: form.pos_id, invoice_id: inv.id })} style={{ backgroundColor: colors.orange, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4 }}>
                      <Text style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>💰 إضافة تحصيل</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ backgroundColor: colors.green + '15', padding: 12, borderRadius: radius.sm, marginTop: -8, marginBottom: 15, borderWidth: 1, borderColor: colors.green + '40' }}>
                <Text style={{ fontSize: 13, color: colors.green, fontWeight: 'bold', textAlign: 'center' }}>
                  ✅ نقطة البيع هذه ليست عليها أي ديون.
                </Text>
              </View>
            )
          )}

          {user?.role !== 'agent' && <Picker label="المندوب *" options={agents.map(a => ({ value: a.id, label: a.name }))} value={form.agent_id} onChange={v => setForm({ ...form, agent_id: v })} searchable={true} />}
          <Row style={{ gap: spacing.md }}><View style={{ flex: 1 }}><Picker label="النوع" options={[{ value: 'credit', label: 'آجل' }, { value: 'cash', label: 'نقدي' }]} value={form.type} onChange={v => setForm({ ...form, type: v })} /></View><View style={{ flex: 1 }}><Input label="التاريخ" value={form.invoice_date} onChangeText={v => setForm({ ...form, invoice_date: v })} /></View></Row>
          <Input label="ملاحظات" value={form.notes} onChangeText={v => setForm({ ...form, notes: v })} multiline />
        </View>

        {isWalletEmpty ? (
          <View style={[s.section, { padding: 20, alignItems: 'center', backgroundColor: colors.orange + '10', borderColor: colors.orange, borderWidth: 1 }]}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🪫</Text>
            <Text style={{ fontSize: 18, color: colors.orange, fontWeight: 'bold', textAlign: 'center' }}>محفظتك من الأوراق فارغة!</Text>
            <Text style={{ color: colors.t2, textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 20 }}>لا يمكنك إضافة بنود لأن رصيدك الحالي من الكروت صفر. يرجى مراجعة مسؤول المخزن لتزويدك بالأوراق.</Text>
          </View>
        ) : (
          <View style={s.section}>
            <Text style={s.sectionTitle}>📋 البنود</Text>
            {items.length > 0 && (
              <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                {items.map((it, idx) => (
                  <View key={idx} style={{ backgroundColor: colors.bg2, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: spacing.xs }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ backgroundColor: colors.primary + '15', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="box" size={16} color={colors.primary} />
                        </View>
                        <View>
                          <Text style={{ color: colors.t1, fontSize: fontSize.md, fontWeight: '800' }}>{it.cat_name}</Text>
                          <Text style={{ color: colors.t3, fontSize: fontSize.xs }}>{it.batch_number ? `دفعة: ${it.batch_number}` : 'بدون دفعة'}</Text>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => setItems(prev => prev.filter(i => i.id !== it.id))} style={{ backgroundColor: colors.danger + '15', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="trash-2" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </Row>
                    <Row style={{ justifyContent: 'space-between', marginLeft: 40, marginTop: 4 }}>
                      <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>الكمية: <Text style={{ color: colors.t1, fontWeight: '700' }}>{it.quantity}</Text></Text>
                      <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>سعر المفرد: <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(parseFloat(it.unit_price))}</Text></Text>
                      <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>الإجمالي: <Text style={{ color: colors.green, fontWeight: '800' }}>{formatCurrency(it.total)}</Text></Text>
                    </Row>
                  </View>
                ))}
              </View>
            )}
            <View style={{ backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary + '30', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3, marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: 10 }}>
                <View style={{ backgroundColor: colors.primary + '15', width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="plus-circle" size={20} color={colors.primary} />
                </View>
                <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.t1 }}>إضافة بند للفاتورة</Text>
              </View>

              <Picker label="الفئة (الصنف) *" options={availableCategories.map(c => ({ value: c.id, label: `${c.name} — ${formatCurrency(c.price)}` }))} value={newItem.category_id} onChange={onSelectCategory} searchable={true} />
              <View style={{ height: spacing.sm }} />
              <Picker label="من المحفظة / الدفعة *" options={dynamicWallets.filter(w => !newItem.category_id || w.category_id === newItem.category_id).map(w => ({ value: w.id, label: `${w.batches?.serial_number || '—'} • رصيد: ${w.remaining_cards}` }))} value={newItem.wallet_id} onChange={v => { const sel = dynamicWallets.find(x => x.id === v); const cat = categories.find(c => c.id === sel?.category_id); setNewItem({ ...newItem, wallet_id: v, batch_id: sel?.batch_id || '', category_id: sel?.category_id || newItem.category_id, unit_price: cat ? String(cat.price) : newItem.unit_price }); }} searchable={true} />
              <View style={{ height: spacing.sm }} />
              <Row style={{ gap: spacing.md }}>
                <View style={{ flex: 1 }}><Input label="العدد المطلوب *" value={newItem.quantity} onChangeText={v => setNewItem({ ...newItem, quantity: v })} keyboardType="numeric" /></View>
                <View style={{ flex: 1 }}><Input label="سعر بيع الورقة *" value={newItem.unit_price} onChangeText={v => setNewItem({ ...newItem, unit_price: v })} keyboardType="numeric" /></View>
              </Row>
              <View style={{ height: spacing.sm }} />
              <Btn label="إضافة البند" icon="plus" variant="primary" style={{ marginTop: spacing.xs }} size="lg" onPress={addItem} />
            </View>
            {items.length > 0 && (
              <View style={s.totalsBox}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 5 }}><Text style={{ color: colors.t2 }}>المجموع:</Text><Text style={{ color: colors.t1, fontWeight: 'bold' }}>{formatCurrency(subtotal)}</Text></Row>
                <Input label="مبلغ الخصم" value={form.discount} onChangeText={v => setForm({ ...form, discount: v })} placeholder="0" keyboardType="numeric" />
                {discountAmount > 0 && (
                  <Input
                    label="سبب الخصم *"
                    value={form.discount_reason}
                    onChangeText={v => setForm({ ...form, discount_reason: v })}
                    placeholder="اكتب سبب الخصم"
                    multiline
                  />
                )}
                {discountAmount > 0 && (
                  <View style={{ marginTop: 8, backgroundColor: colors.orange + '15', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.orange + '55' }}>
                    <Text style={{ color: colors.orange, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
                      ⚠️ هذا الخصم يتطلب اعتماد المدير قبل تأثيره على التحصيل.
                    </Text>
                  </View>
                )}
                <View style={s.divider} />
                <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontSize: 18, color: colors.cyan, fontWeight: 'bold' }}>الصافي:</Text><Text style={{ fontSize: 24, color: colors.green, fontWeight: '900' }}>{formatCurrency(netAmount)}</Text></Row>
                {!!selectedPOS && (
                  <View style={{ marginTop: 8 }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ color: colors.t2, fontSize: 12 }}>الحد الائتماني:</Text>
                      <Text style={{ color: colors.t1, fontSize: 12, fontWeight: '700' }}>{formatCurrency(creditLimit)}</Text>
                    </Row>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ color: colors.t2, fontSize: 12 }}>الديون القائمة:</Text>
                      <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>{formatCurrency(usedCredit)}</Text>
                    </Row>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.t2, fontSize: 12 }}>المتبقي بعد الفاتورة:</Text>
                      <Text style={{ color: isCreditExceeded ? colors.red : colors.green, fontSize: 12, fontWeight: '800' }}>
                        {formatCurrency(remainingAfterDraft)}
                      </Text>
                    </Row>
                    {isCreditExceeded && (
                      <View style={{ marginTop: 8, backgroundColor: colors.red + '15', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.red + '50' }}>
                        <Text style={{ color: colors.red, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
                          🚫 تجاوزت الفاتورة الحد الائتماني المتبقي لنقطة البيع
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
        {!!saveError && (
          <View style={{ backgroundColor: colors.danger + '12', borderWidth: 1, borderColor: colors.danger + '35', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.danger, textAlign: 'center', fontWeight: '700' }}>{saveError}</Text>
          </View>
        )}
        <Row style={s.actions}>
          <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} disabled={isSaving} />
          <Btn label="حفظ الفاتورة" icon="save" variant="primary" style={{ flex: 2 }} onPress={performSave} disabled={isSaveDisabled} loading={isSaving} />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
