import {
  getLocalInvoices, createLocalAgentWallet, createLocalBatch, createLocalPOS,
  getBatchesByAgent, createLocalInvoice, addInvoiceItem,
  createLocalCollection, createAgentWallet, softDeleteInvoice, getLocalInvoiceItems, getInvoicePaidSum,
  getLocalUsers, getLocalCategories, getLocalBatches, getLocalPOS as getLocalPosDB, getLocalWallets, updateLocalWalletCards, updateLocalPOS
} from '../services/database';
import React, { useState, useEffect } from 'react';
import * as Print from 'expo-print';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { supabase } from '../services/supabase';
import { todayISO, GOVERNORATES, getDistricts, formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Row, Badge } from '../components/UI';
import { useAuth } from '../services/AuthContext';

// ── Picker بسيط ──────────────────────────────────
function Picker({ label, options, value, onChange, placeholder, loading: pLoading }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => String(o.value) === String(value));
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={st.label}>{label}</Text>}
      <TouchableOpacity style={st.picker} onPress={() => !pLoading && setOpen(!open)} activeOpacity={0.8}>
        {pLoading
          ? <ActivityIndicator size="small" color={colors.blue} style={{ flex: 1 }} />
          : <Text style={[st.pickerTxt, !selected && { color: colors.t3 }]}>
            {selected ? selected.label : (placeholder || 'اختر...')}
          </Text>
        }
        <Text style={{ color: colors.t3 }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={st.dropdown}>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
            {options.length === 0
              ? <Text style={{ color: colors.t3, textAlign: 'center', padding: spacing.md }}>لا توجد خيارات</Text>
              : options.map(opt => (
                <TouchableOpacity key={String(opt.value)}
                  style={[st.dropItem, String(value) === String(opt.value) && st.dropItemAct]}
                  onPress={() => { onChange(opt.value); setOpen(false); }}>
                  <Text style={[st.dropTxt, String(value) === String(opt.value) && { color: colors.blue, fontWeight: '700' }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))
            }
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════
// فاتورة جديدة — القوائم من Supabase، الحفظ في SQLite
// ══════════════════════════════════════════════════
export function NewInvoiceScreen({ navigation }) {
  const { user } = useAuth();
  const [pos, setPos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [batches, setBatches] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({
    pos_id: '', agent_id: user?.role === 'agent' ? user.id : '',
    type: 'credit', invoice_date: todayISO(), notes: '', discount: '0',
  });
  const [items, setItems] = useState([]);

  // ✅ إضافة batch_id فقط
  const [newItem, setNewItem] = useState({ category_id: '', wallet_id: '', batch_id: '', unit_price: '', quantity: '' });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const agentId = user?.role === 'agent' ? user.id : null;
        const [posR, agentR, catR, walR] = await Promise.all([
          getLocalPosDB(),
          getLocalUsers(),
          getLocalCategories(),
          getLocalWallets(agentId || undefined)
        ]);
        setPos(posR.filter(p => !p.is_blocked));
        setAgents(agentR.filter(a => a.role === 'agent' && a.active));
        setCategories(catR.filter(c => c.active));
        const w = walR.map(x => ({ ...x, remaining_cards: (x.total_cards || 0) - (x.sold_cards || 0) }));
        setWallets(w.filter(x => x.remaining_cards > 0));

        // 🔥 تحميل الدفعات حسب المندوب
        if (agentId) {
          const b = await getBatchesByAgent(agentId);
          setBatches(b);
        }

      } catch (e) { console.log('Load error:', e.message); }
      setDataLoading(false);
    }
    load();
  }, [user]);

  const dynamicWallets = wallets.map(w => {
    const usedInForm = items.filter(i => i.wallet_id === w.id).reduce((s, i) => s + i.quantity, 0);
    return { ...w, remaining_cards: w.remaining_cards - usedInForm };
  }).filter(w => w.remaining_cards > 0 && (!form.agent_id || w.agent_id === form.agent_id));

  const validCategoryIds = new Set(dynamicWallets.map(w => w.category_id));
  const availableCategories = categories.filter(c => validCategoryIds.has(c.id));

  const onSelectCategory = (catId) => {
    const cat = categories.find(c => c.id === catId);
    const catWallets = dynamicWallets.filter(w => w.category_id === catId);
    const catBatches = batches.filter(b => {
      const w = dynamicWallets.find(x => x.batch_id === b.id);
      return w && w.category_id === catId;
    });
    setNewItem(f => ({
      ...f, category_id: catId,
      unit_price: String(cat?.price || ''),
      wallet_id: catWallets?.length === 1 ? catWallets[0].id : '',
      batch_id: '' // ✅ مهم
    }));
  };

  const filteredWallets = dynamicWallets.filter(w =>
    !newItem.category_id || w.category_id === newItem.category_id
  );
  const filteredBatches = batches.filter(b => dynamicWallets.some(w => w.batch_id === b.id && (!newItem.category_id || w.category_id === newItem.category_id)));

  const totalBalance = dynamicWallets.reduce((s, w) => s + w.remaining_cards, 0);
  const hasBalance = !form.agent_id || totalBalance > 0;

  const itemTotal = () => (parseInt(newItem.quantity) || 0) * (parseFloat(newItem.unit_price) || 0);
  const subtotal = () => items.reduce((s, i) => s + i.total, 0);
  const discount = () => Math.max(0, parseFloat(form.discount) || 0);
  const grandTotal = () => Math.max(0, subtotal() - discount());

  const addItem = () => {
    if (!newItem.category_id || !newItem.quantity || !newItem.unit_price) {
      Alert.alert('تنبيه', 'اختر الفئة وأدخل الكمية والسعر'); return;
    }
    const qty = parseInt(newItem.quantity) || 0;
    if (qty <= 0) { Alert.alert('خطأ', 'الكمية يجب أن تكون أكبر من صفر'); return; }

    const wallet = dynamicWallets.find(w => w.id === newItem.wallet_id);

    if (wallet && qty > wallet.remaining_cards) {
      Alert.alert('خطأ', `المتاح المتبقي في المحفظة هو: ${wallet.remaining_cards} ورقة فقط`); return;
    }

    const cat = categories.find(c => c.id === newItem.category_id);

    setItems(prev => [...prev, {
      ...newItem,
      cat_name: cat?.name || '—',
      batch_number: wallet?.batches?.serial_number || '', // ✅ جديد
      quantity: qty,
      unit_price: parseFloat(newItem.unit_price),
      total: itemTotal(),
      id: Date.now().toString(),
      batch_id: newItem.batch_id,
    }]);

    setNewItem({ category_id: '', wallet_id: '', batch_id: '', unit_price: '', quantity: '' });
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const save = () => Alert.alert('تأكيد الحفظ', 'هل أنت متأكد من حفظ هذه البيانات؟', [
    { text: 'إلغاء', style: 'cancel' },
    { text: '✅ تأكيد', onPress: performSave }
  ]);
  const performSave = async () => {
    if (!form.pos_id || !form.agent_id) { Alert.alert('تنبيه', 'اختر نقطة البيع والمندوب'); return; }
    if (items.length === 0) { Alert.alert('تنبيه', 'أضف بنداً واحداً على الأقل'); return; }
    if (!hasBalance) { Alert.alert('خطأ', 'لا يمكن حفظ الفاتورة لأن المندوب لا يملك رصيد كروت'); return; }
    setSaving(true);
    try {
      const total = subtotal();
      const disc = discount();
      const { id, invoice_number } = await createLocalInvoice({ ...form, total_amount: total, discount: disc });

      for (const item of items) {
        const wallet = wallets.find(w => w.id === item.wallet_id);
        const usedCards = wallet ? (Number(wallet.from_card) + Number(wallet.sold_cards) - 1) : 0;
        const fromCard = usedCards + 1;
        const toCard = fromCard + item.quantity - 1;

        await addInvoiceItem({
          invoice_id: id,
          category_id: item.category_id,
          batch_id: wallet?.batch_id || '', // ✅ محفوظ
          wallet_id: item.wallet_id || '',
          from_card: fromCard,
          to_card: toCard,
          unit_price: item.unit_price,
          quantity: item.quantity,
          total_price: item.unit_price * item.quantity
        });

        if (item.wallet_id && wallet) {
          await updateLocalWalletCards(item.wallet_id, item.quantity);
        }
      }

      setSaving(false);

      Alert.alert('✅ تم', `الفاتورة: ${invoice_number}\nالإجمالي: ${formatCurrency(grandTotal())}`, [
        { text: 'موافق', onPress: () => navigation.goBack() }
      ]);

    } catch (e) {
      setSaving(false);
      Alert.alert('خطأ', e.message);
    }
  };

  if (dataLoading) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}>

        {/* رأس الفاتورة */}
        <View style={st.invoiceHeader}>
          <Text style={st.invoiceTitle}>🧾 فاتورة مبيعات</Text>
          <Text style={st.invoiceDate}>{form.invoice_date}</Text>
        </View>

        <View style={st.section}>
          <Picker label="نقطة البيع *"
            options={pos.map(p => ({ value: p.id, label: p.name }))}
            value={form.pos_id} onChange={v => setForm({ ...form, pos_id: v })}
            placeholder="اختر العميل..." />

          {user?.role !== 'agent' && (
            <Picker label="المندوب *"
              options={agents.map(a => ({ value: a.id, label: a.name }))}
              value={form.agent_id} onChange={v => setForm({ ...form, agent_id: v })} />
          )}

          <Row style={{ gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Picker label="النوع"
                options={[{ value: 'credit', label: 'آجل' }, { value: 'cash', label: 'نقدي' }]}
                value={form.type} onChange={v => setForm({ ...form, type: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="التاريخ" value={form.invoice_date}
                onChangeText={v => setForm({ ...form, invoice_date: v })} />
            </View>
          </Row>

          <Input label="ملاحظات" value={form.notes}
            onChangeText={v => setForm({ ...form, notes: v })} multiline />
        </View>

        {/* البنود */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>📋 البنود</Text>

          {/* البنود المضافة كجدول */}
          {items.length > 0 && (
            <View style={{ marginBottom: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', backgroundColor: colors.border + '55', padding: spacing.sm }}>
                <Text style={{ flex: 2, color: colors.t2, fontWeight: 'bold' }}>الفئة</Text>
                <Text style={{ flex: 1, color: colors.t2, fontWeight: 'bold', textAlign: 'center' }}>الكمية</Text>
                <Text style={{ flex: 1.5, color: colors.t2, fontWeight: 'bold', textAlign: 'center' }}>السعر</Text>
                <Text style={{ flex: 1.5, color: colors.t2, fontWeight: 'bold', textAlign: 'center' }}>الإجمالي</Text>
                <View style={{ width: 30 }} />
              </View>
              {items.map((it, idx) => (
                <View key={idx} style={{ flexDirection: 'row', padding: spacing.sm, borderBottomWidth: idx === items.length - 1 ? 0 : 1, borderBottomColor: colors.border, alignItems: 'center' }}>
                  <View style={{ flex: 2 }}>
                    <Text style={{ color: colors.t1, fontWeight: '700', fontSize: fontSize.sm }}>{it.cat_name}</Text>
                    <Text style={{ color: colors.t3, fontSize: fontSize.xs }}>{it.batch_number ? `د: ${it.batch_number}` : '—'}</Text>
                  </View>
                  <Text style={{ flex: 1, color: colors.t1, textAlign: 'center', fontWeight: 'bold' }}>{it.quantity}</Text>
                  <Text style={{ flex: 1.5, color: colors.t2, textAlign: 'center' }}>{it.unit_price}</Text>
                  <Text style={{ flex: 1.5, color: colors.green, textAlign: 'center', fontWeight: 'bold' }}>{formatCurrency(it.total)}</Text>
                  <TouchableOpacity onPress={() => removeItem(it.id)} style={{ width: 30, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 16 }}>❌</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {!hasBalance && form.agent_id ? (
            <View style={{ backgroundColor: colors.red + '22', padding: spacing.md, borderRadius: radius.md, alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ color: colors.red, fontWeight: '700', fontSize: fontSize.lg }}>ممنوع الإضافة!</Text>
              <Text style={{ color: colors.t2, fontSize: fontSize.sm, textAlign: 'center', marginTop: 4 }}>المندوب ليس لديه رصيد كروت في المحفظة حالياً.</Text>
            </View>
          ) : (
            <View style={st.addItemBox}>
              <Text style={st.addItemTitle}>+ إضافة بند</Text>

              <Picker label="الفئة *"
                options={availableCategories.map(c => ({ value: c.id, label: `${c.name} — ${formatCurrency(c.price)}` }))}
                value={newItem.category_id} onChange={onSelectCategory} />

              {/* ✅ الدفعة */}
              {filteredBatches.length > 0 && (
                <Picker
                  label="الدفعة"
                  options={filteredBatches.map(b => ({
                    value: b.id,
                    label: `${b.serial_number} • متاح: ${b.available}`
                  }))}
                  value={newItem.batch_id || ''}
                  onChange={v => setNewItem({ ...newItem, batch_id: v })}
                />
              )}

              <Picker label="المحفظة *"
                options={filteredWallets.map(w => ({
                  value: w.id,
                  label: `${w.batches?.serial_number || '—'} • متبقي: ${w.remaining_cards}`
                }))}
                value={newItem.wallet_id}
                onChange={v => {
                  const selected = filteredWallets.find(x => x.id === v);
                  const cat = categories.find(c => c.id === selected?.category_id);
                  setNewItem({
                    ...newItem,
                    wallet_id: v,
                    batch_id: selected?.batch_id || '',
                    category_id: selected?.category_id || newItem.category_id,
                    unit_price: cat ? String(cat.price) : newItem.unit_price,
                  });
                }}
              />

              <Row style={{ gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Input label="عدد الأوراق *" value={newItem.quantity}
                    onChangeText={v => setNewItem({ ...newItem, quantity: v })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="سعر الورقة *" value={newItem.unit_price}
                    onChangeText={v => setNewItem({ ...newItem, unit_price: v })} />
                </View>
              </Row>

              <Btn label="✅ إضافة البند" onPress={addItem} />
            </View>
          )}

          {/* المجاميع بارزة وكبيرة */}
          {items.length > 0 && (
            <View style={{ backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Text style={{ fontSize: fontSize.lg, color: colors.t2 }}>المجموع الفرعي:</Text>
                <Text style={{ fontSize: fontSize.xl, color: colors.t1, fontWeight: 'bold' }}>{formatCurrency(subtotal())}</Text>
              </Row>

              <Input value={form.discount}
                onChangeText={v => setForm({ ...form, discount: v })}
                placeholder="مبلغ الخصم (إن وجد)" style={{ marginBottom: spacing.sm }} keyboardType="numeric" />

              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />

              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize.xl, color: colors.cyan, fontWeight: 'bold' }}>الإجمالي المطلوب:</Text>
                <Text style={{ fontSize: 26, color: colors.green, fontWeight: '900' }}>{formatCurrency(grandTotal())}</Text>
              </Row>
            </View>
          )}
        </View>

        <Row style={st.actions}>
          <Btn label="إلغاء" onPress={() => navigation.goBack()} />
          <Btn label="💾 حفظ الفاتورة" onPress={save} />
        </Row>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════
// تفاصيل الفاتورة
// ══════════════════════════════════════════════════
export function InvoiceDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { can } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const invs = await getLocalInvoices({ id });
        if (invs.length > 0) {
          setInvoice(invs[0]);
        }

        const localItems = await getLocalInvoiceItems(id);
        setItems(localItems);
      } catch (e) { }
      setLoading(false);
    }
    load();
  }, [id]);

  const handleDelete = () => Alert.alert('حذف الفاتورة', 'هل تريد حذف هذه الفاتورة؟', [
    { text: 'إلغاء', style: 'cancel' },
    {
      text: 'حذف', style: 'destructive', onPress: async () => {
        await softDeleteInvoice(id);
        navigation.goBack();
      }
    },
  ]);

  const handlePrint = async () => {
    try {
      const html = `
        <html dir="rtl" lang="ar">
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; font-size: 14px; color: #333; }
            h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .info { margin-bottom: 20px; }
            .info div { margin-bottom: 8px; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
            th { background-color: #f4f4f4; color: #333; font-weight: bold; }
            .totals { text-align: left; font-size: 18px; font-weight: bold; margin-top: 20px; padding-top: 10px; border-top: 2px solid #333; }
            .discount { color: #e67e22; font-size: 16px; font-weight: normal; }
          </style>
        </head>
        <body>
          <h1>فاتورة مبيعات</h1>
          <div class="info">
            <div><strong>رقم الفاتورة:</strong> ${invoice.invoice_number}</div>
            <div><strong>نقطة البيع:</strong> ${invoice.pos_name || '—'}</div>
            <div><strong>المندوب:</strong> ${invoice.agent_name || '—'}</div>
            <div><strong>التاريخ:</strong> ${invoice.invoice_date}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>الفئة</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.cat_name || '—'}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit_price}</td>
                  <td>${item.total_price}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="totals totals-txt">
            المجموع: ${invoice.total_amount}<br/>
            ${invoice.discount > 0 ? `<span class="discount">الخصم: ${invoice.discount}</span><br/>` : ''}
            الصافي: ${invoice.net_amount || invoice.total_amount}
          </div>
          <div style="text-align: center; margin-top: 40px; font-size: 12px; color: #666;">تم إصدارها من نظام بيع الكروت</div>
        </body>
        </html>
      `;
      await Print.printAsync({ html });
    } catch (error) {
      Alert.alert('خطأ في الطباعة', error.message);
    }
  };

  if (loading) return <Loading />;
  if (!invoice) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.t3 }}>الفاتورة غير موجودة</Text></View>;

  return (
    <ScrollView style={st.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: 60 }}>
      <View style={st.invoiceHeader}>
        <Text style={st.invoiceTitle}>{invoice.invoice_number}</Text>
        <Badge status={invoice.status} />
      </View>
      <View style={st.section}>
        {[
          { l: 'نقطة البيع', v: invoice.pos_name || '—' },
          { l: 'المندوب', v: invoice.agent_name || '—' },
          { l: 'التاريخ', v: invoice.invoice_date || '—' },
        ].map((item, i) => (
          <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.t3 }}>{item.l}</Text>
            <Text style={{ color: colors.t1, fontWeight: '700' }}>{item.v}</Text>
          </Row>
        ))}
        <Row style={{ justifyContent: 'space-between', paddingVertical: spacing.sm }}>
          <Text style={{ color: colors.t3 }}>النوع</Text>
          <Badge status={invoice.type} />
        </Row>
      </View>

      <View style={st.section}>
        <Text style={st.sectionTitle}>📋 البنود</Text>
        {items.length === 0
          ? <Text style={{ textAlign: 'center', color: colors.t3, padding: spacing.lg }}>لا توجد بنود</Text>
          : (<>
            <View style={st.tableHeader}>
              <Text style={[st.thCell, { flex: 2 }]}>الفئة</Text>
              <Text style={[st.thCell, { flex: 1 }]}>الكمية</Text>
              <Text style={[st.thCell, { flex: 1 }]}>سعر</Text>
              <Text style={[st.thCell, { flex: 1 }]}>إجمالي</Text>
            </View>
            {items.map((item, i) => (
              <View key={item.id} style={[st.tableRow, i % 2 === 0 && { backgroundColor: colors.card2 }]}>
                <Text style={[st.tdCell, { flex: 2, color: colors.cyan }]}>{item.cat_name || '—'}</Text>
                <Text style={[st.tdCell, { flex: 1 }]}>{item.quantity}</Text>
                <Text style={[st.tdCell, { flex: 1 }]}>{formatCurrency(item.unit_price)}</Text>
                <Text style={[st.tdCell, { flex: 1, color: colors.green, fontWeight: '700' }]}>{formatCurrency(item.total_price)}</Text>
              </View>
            ))}
          </>)
        }
        <View style={st.totalsBox}>
          <Row style={{ justifyContent: 'space-between', marginBottom: spacing.xs }}>
            <Text style={{ color: colors.t3 }}>المجموع الفرعي</Text>
            <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(invoice.total_amount)}</Text>
          </Row>
          {invoice.discount > 0 && (
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <Text style={{ color: colors.t3 }}>الخصم</Text>
              <Text style={{ color: colors.orange, fontWeight: '700' }}>- {formatCurrency(invoice.discount)}</Text>
            </Row>
          )}
          <Row style={{ justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border2 }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.t1 }}>الإجمالي الصافي</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.green }}>{formatCurrency(invoice.net_amount || invoice.total_amount)}</Text>
          </Row>
        </View>
      </View>

      <Row style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Btn label="⬅️ عودة" variant="outline" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
        <Btn label="🖨️ طباعة الفاتورة" variant="primary" onPress={handlePrint} style={{ flex: 2 }} />
        {can('canDeleteInvoice') && invoice.status === 'pending' && (
          <Btn label="🗑️ حذف" variant="danger" onPress={handleDelete} style={{ flex: 1 }} />
        )}
      </Row>
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════
// إشعار قبض — القوائم من Supabase، الحفظ في SQLite
// ══════════════════════════════════════════════════
export function NewCollectionScreen({ navigation }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [pos, setPos] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({
    agent_id: user?.role === 'agent' ? user.id : '',
    pos_id: '', invoice_id: '', amount: '',
    method: 'cash', reference_number: '', collection_date: todayISO(),
    note: ''   // ✅ تمت الإضافة بدون تأثير
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [agentR, posR] = await Promise.all([
          getLocalUsers(),
          getLocalPosDB(),
        ]);

        // ✅ تحميل الفواتير التي عليها مستحقات فقط لعرضها في السندات
        const invRows = await getLocalInvoices({ onlyWithBalance: true });

        setAgents(agentR.filter(a => a.role === 'agent' && a.active));
        setPos(posR);
        setInvoices(invRows || []);
        setAllInvoices(invRows || []);
      } catch (e) { }
      setDataLoading(false);
    }
    load();
  }, [user]);

  const onSelectInvoice = async (invId) => {
    console.log("🔍 [onSelectInvoice] ID:", invId);
    const inv = invoices.find(i => i.id === invId);
    if (!inv) { setSelectedInvoice(null); return; }

    const paidSum = await getInvoicePaidSum(invId);
    console.log(`📊 [onSelectInvoice] ${inv.invoice_number} → Paid: ${paidSum}`);

    const updatedInv = { ...inv, paid_sum: paidSum };

    setSelectedInvoice(updatedInv);
    const remaining = Math.max(0, (inv.net_amount || inv.total_amount || 0) - paidSum);
    setForm(f => ({ ...f, invoice_id: invId, amount: String(remaining) }));
  };

  const save = () => Alert.alert('تأكيد الحفظ', 'هل أنت متأكد من حفظ هذه البيانات؟', [
    { text: 'إلغاء', style: 'cancel' },
    { text: '✅ تأكيد', onPress: performSave }
  ]);
  const performSave = async () => {
    if (!form.agent_id || !form.pos_id || !form.amount) { Alert.alert('تنبيه', 'يرجى إكمال البيانات'); return; }
    const amt = parseFloat(form.amount) || 0;
    if (amt <= 0) { Alert.alert('خطأ', 'المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (selectedInvoice) {
      const maxAmt = Math.max(0, (selectedInvoice.net_amount || selectedInvoice.total_amount || 0) - (selectedInvoice.paid_sum || 0));
      if (amt > maxAmt) { Alert.alert('خطأ', `المبلغ يتجاوز المستحق\nأقصى مبلغ: ${formatCurrency(maxAmt)}`); return; }
    }
    setSaving(true);
    const { collection_number } = await createLocalCollection({ ...form, amount: amt, note: form.note });
    setSaving(false);
    Alert.alert('✅ تم', `تم رفع الإشعار: ${collection_number}`, [{ text: 'موافق', onPress: () => navigation.goBack() }]);
  };

  if (dataLoading) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {user?.role !== 'agent' && (
          <Picker label="المندوب *" options={agents.map(a => ({ value: a.id, label: a.name }))}
            value={form.agent_id} onChange={v => setForm({ ...form, agent_id: v })} />
        )}
        <Picker label="نقطة البيع *" options={pos.map(p => ({ value: p.id, label: p.name }))}
          value={form.pos_id} onChange={v => {
            setForm({ ...form, pos_id: v });

            if (!v) {
              setInvoices(allInvoices);
              return;
            }

            const filtered = allInvoices.filter(i =>
              String(i.pos_id) === String(v)
            );
            setInvoices(filtered);
          }} />
        <Picker label="الفاتورة المرتبطة"
          options={[{ value: '', label: '— بدون فاتورة —' }, ...invoices.map(i => ({
            value: i.id,
            label: i.invoice_number
          }))]}
          value={form.invoice_id} onChange={onSelectInvoice} />
        {selectedInvoice && (
          <View style={st.infoBox}>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>تاريخ إصدار الفاتورة</Text>
              <Text style={{ color: colors.t2, fontSize: fontSize.sm }}>{selectedInvoice.invoice_date?.slice(0, 10) || '—'}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>إجمالي المستحق من الفاتورة</Text>
              <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatCurrency(selectedInvoice.net_amount || selectedInvoice.total_amount)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>التحصيل السابق للفاتورة</Text>
              <Text style={{ color: colors.green, fontWeight: '700' }}>{formatCurrency(selectedInvoice.paid_sum || 0)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border2 }}>
              <Text style={{ color: colors.t1, fontSize: fontSize.md, fontWeight: '700' }}>المتبقي من الفاتورة</Text>
              <Text style={{ color: colors.orange, fontWeight: '800', fontSize: fontSize.lg }}>
                {formatCurrency(Math.max(0, (selectedInvoice.net_amount || selectedInvoice.total_amount || 0) - (selectedInvoice.paid_sum || 0)))}
              </Text>
            </Row>
          </View>
        )}
        <Input label="المبلغ (ر.ي) *" value={form.amount}
          onChangeText={v => setForm({ ...form, amount: v })} keyboardType="numeric" placeholder="0" />
        <Picker label="طريقة القبض"
          options={[{ value: 'cash', label: 'نقدي' }, { value: 'transfer', label: 'تحويل بنكي' }, { value: 'check', label: 'شيك' }]}
          value={form.method} onChange={v => setForm({ ...form, method: v })} />
        {form.method !== 'cash' && (
          <Input label="رقم المرجع" value={form.reference_number}
            onChangeText={v => setForm({ ...form, reference_number: v })} placeholder="REF-..." />
        )}
        <Input label="ملاحظات" value={form.note}
          onChangeText={v => setForm({ ...form, note: v })}
          placeholder="اختياري..."
          multiline
        />
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
          <Btn label={saving ? 'جاري الرفع...' : '💾 رفع الإشعار'} variant="primary" style={{ flex: 2 }} onPress={save} disabled={saving} />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════
// توزيع أوراق — من Supabase، الحفظ في Supabase
// ══════════════════════════════════════════════════
export function AssignWalletScreen({ navigation }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [cats, setCats] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ agent_id: '', category_id: '', batch_id: '', quantity: '', notes: '' });
  const [batchInfo, setBatchInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [aR, bR, cR] = await Promise.all([
          getLocalUsers(),
          getLocalBatches(),
          getLocalCategories(),
        ]);
        setAgents(aR.filter(a => a.role === 'agent' && a.active));
        setBatches(bR.filter(b => b.available_cards > 0));
        setCats(cR.filter(c => c.active));
      } catch (e) { }
      setDataLoading(false);
    }
    load();
  }, []);

  const onSelectCategory = (catId) => {
    const catBatches = batches.filter(b => b.category_id === catId);
    setForm(f => ({ ...f, category_id: catId, batch_id: catBatches.length === 1 ? catBatches[0].id : '' }));
    if (catBatches.length === 1) setBatchInfo(catBatches[0]); else setBatchInfo(null);
  };
  const onSelectBatch = (batchId) => {
    setBatchInfo(batches.find(b => b.id === batchId) || null);
    setForm(f => ({ ...f, batch_id: batchId }));
  };
  const filteredBatches = batches.filter(b => b.category_id === form.category_id);

  const save = () => Alert.alert('تأكيد الحفظ', 'هل أنت متأكد من حفظ هذه البيانات؟', [
    { text: 'إلغاء', style: 'cancel' },
    { text: '✅ تأكيد', onPress: performSave }
  ]);
  const performSave = async () => {
    if (!form.agent_id || !form.category_id || !form.batch_id || !form.quantity) {
      Alert.alert('تنبيه', 'يرجى إكمال جميع البيانات'); return;
    }
    const qty = parseInt(form.quantity);
    if (!batchInfo || qty > batchInfo.available_cards) {
      Alert.alert('خطأ', `المتاح في الدفعة: ${batchInfo?.available_cards || 0} ورقة`); return;
    }
    setSaving(true);
    try {
      await createLocalAgentWallet({
        agent_id: form.agent_id,
        batch_id: form.batch_id,
        category_id: form.category_id,
        total_cards: qty,
        issued_by: user?.id,
        notes: form.notes || null,
      });

      setSaving(false);
      Alert.alert('✅ تم', `تم توزيع ${qty} ورقة`, [
        { text: 'توزيع آخر', onPress: () => { setForm({ agent_id: '', category_id: '', batch_id: '', quantity: '', notes: '' }); setBatchInfo(null); } },
        { text: 'موافق', onPress: () => navigation.goBack() },
      ]);
    } catch (e) { setSaving(false); Alert.alert('خطأ', e.message); }
  };

  if (dataLoading) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <View style={st.section}>
          <Text style={st.sectionTitle}>بيانات التوزيع</Text>
          <Picker label="المندوب *" options={agents.map(a => ({ value: a.id, label: a.name }))}
            value={form.agent_id} onChange={v => setForm({ ...form, agent_id: v })} />
          <Picker label="الفئة *"
            options={cats.map(c => ({ value: c.id, label: `${c.name} — ${formatCurrency(c.price)}` }))}
            value={form.category_id} onChange={onSelectCategory} placeholder="اختر فئة الكرت..." />
          {filteredBatches.length > 0 && (
            <Picker label="الدفعة *"
              options={filteredBatches.map(b => ({ value: b.id, label: `${b.serial_number} • متاح: ${b.available_cards}` }))}
              value={form.batch_id} onChange={onSelectBatch} />
          )}
          {batchInfo && (
            <View style={st.infoBox}>
              <Row style={{ justifyContent: 'space-between', marginBottom: spacing.xs }}>
                <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>الرقم التسلسلي</Text>
                <Text style={{ color: colors.cyan, fontWeight: '700' }}>{batchInfo.serial_number}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.t3, fontSize: fontSize.sm }}>المتاح للتوزيع</Text>
                <Text style={{ color: colors.green, fontWeight: '800', fontSize: fontSize.lg }}>{batchInfo.available_cards} ورقة</Text>
              </Row>
            </View>
          )}
          <Input label="عدد الأوراق *" value={form.quantity}
            onChangeText={v => setForm({ ...form, quantity: v })} keyboardType="numeric"
            placeholder={batchInfo ? `من 1 إلى ${batchInfo.available_cards}` : 'أدخل العدد'} />
          {form.quantity && batchInfo && parseInt(form.quantity) > 0 && (
            <View style={st.preview}>
              <Text style={{ color: colors.t3, fontSize: fontSize.xs }}>سيتم توزيع</Text>
              <Text style={{ color: colors.green, fontWeight: '800', fontSize: fontSize.xl }}>{parseInt(form.quantity)} ورقة</Text>
            </View>
          )}
          <Input label="ملاحظات" value={form.notes}
            onChangeText={v => setForm({ ...form, notes: v })} placeholder="اختياري..." multiline />
        </View>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
          <Btn label={saving ? '...' : '💾 حفظ التوزيع'} variant="success" style={{ flex: 2 }} onPress={save} disabled={saving} />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════
// إضافة دفعة + نقطة بيع جديدة + تعديل
// ══════════════════════════════════════════════════
export function AddBatchScreen({ navigation }) {
  const [cats, setCats] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ category_id: '', batch_text: '', total_cards: '39', received_date: todayISO() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLocalCategories().then((res) => { setCats(res.filter(c => c.active)); setDataLoading(false); });
  }, []);

  const save = () => Alert.alert('تأكيد الحفظ', 'هل أنت متأكد من إتمام العملية وحفظ الدفعة؟', [
    { text: 'إلغاء', style: 'cancel' },
    { text: '✅ تأكيد', onPress: performSave }
  ]);
  const performSave = async () => {
    if (!form.category_id) { Alert.alert('تنبيه', 'يجب تحديد الفئة أولاً'); return; }
    if (!form.batch_text || form.batch_text.trim().length === 0 || form.batch_text.length > 6) {
      Alert.alert('تنبيه', 'حقل الدفعة يجب ألا يزيد عن 6 أحرف أو أرقام، ولا يكون فارغاً'); return;
    }
    const qty = parseInt(form.total_cards) || 0;
    if (qty <= 0) { Alert.alert('خطأ', 'أدخل عدد الأوراق بشكل صحيح'); return; }

    setSaving(true);
    try {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      const ddmmyy = `${dd}${mm}${yy}`;
      const randomSerial = Math.floor(Math.random() * 90000) + 10000;
      const formattedBatchNumber = `${ddmmyy}-${form.batch_text.trim().toUpperCase()}-${randomSerial}`;

      await createLocalBatch({
        batch_number: formattedBatchNumber,
        category_id: form.category_id,
        serial_number: formattedBatchNumber, // Used everywhere as identifier
        total_cards: qty,
        received_date: form.received_date,
      });

      setSaving(false);
      Alert.alert('✅ تم', `تم إضافة الدفعة بنجاح للمخزون\n${formattedBatchNumber}`, [{ text: 'موافق', onPress: () => navigation.goBack() }]);
    } catch (e) {
      setSaving(false);
      Alert.alert('خطأ', e.message);
    }
  };

  if (dataLoading) return <Loading />;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>

        {/* بيانات الدفعة */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>معلومات إضافة الدفعة</Text>

          <Picker label="تحديد الفئة *"
            options={cats.map(c => ({ value: c.id, label: c.name }))}
            value={form.category_id} onChange={v => setForm({ ...form, category_id: v })} placeholder="اختر الفئة..." />

          <Row style={{ gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input label="رقم الخانة (بحد أقصى 6) *" value={form.batch_text} maxLength={6} autoCapitalize="characters" onChangeText={v => setForm({ ...form, batch_text: v })} placeholder="مثال: A12" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="عدد الأوراق *" value={form.total_cards} keyboardType="numeric" onChangeText={v => setForm({ ...form, total_cards: v })} />
            </View>
          </Row>

          <Input label="تاريخ الإضافة" value={form.received_date} onChangeText={v => setForm({ ...form, received_date: v })} placeholder="YYYY-MM-DD" />
        </View>

        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
          <Btn label={saving ? '...' : '💾 حفظ الدفعة للمخزون'} variant="success" style={{ flex: 2 }} onPress={save} disabled={saving} />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function NewPOSScreen({ navigation }) {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ name: '', owner_name: '', phone: '', governorate: 'صنعاء', district: '', area: '', credit_limit: '500000', assigned_agent_id: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { getLocalUsers().then((res) => setAgents(res.filter(a => a.role === 'agent' && a.active))); }, []);
  const save = () => Alert.alert('تأكيد الحفظ', 'هل أنت متأكد من حفظ هذه البيانات؟', [
    { text: 'إلغاء', style: 'cancel' },
    { text: '✅ تأكيد', onPress: performSave }
  ]);
  const performSave = async () => {
    if (!form.name) { Alert.alert('تنبيه', 'يرجى إدخال اسم نقطة البيع'); return; }
    setSaving(true);
    const city = [form.governorate, form.district, form.area].filter(Boolean).join(' / ');
    try {
      await createLocalPOS({
        name: form.name,
        owner_name: form.owner_name,
        phone: form.phone,
        city,
        credit_limit: parseFloat(form.credit_limit) || 500000,
        assigned_agent_id: form.assigned_agent_id || null,
      });
      setSaving(false);
      Alert.alert('✅ تم', 'تم إضافة نقطة البيع محلياً', [{ text: 'موافق', onPress: () => navigation.goBack() }]);
    } catch (e) {
      setSaving(false);
      Alert.alert('خطأ', e.message);
    }
  };
  const districts = getDistricts(form.governorate);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <View style={st.section}>
          <Text style={st.sectionTitle}>بيانات نقطة البيع</Text>
          <Input label="اسم المحل *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="..." />
          <Input label="اسم المالك" value={form.owner_name} onChangeText={v => setForm({ ...form, owner_name: v })} placeholder="..." />
          <Input label="رقم الجوال" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
          <Picker label="المحافظة *" options={GOVERNORATES.map(g => ({ value: g, label: g }))} value={form.governorate} onChange={v => setForm({ ...form, governorate: v, district: '', area: '' })} />
          {districts.length > 0 && <Picker label="المديرية" options={[{ value: '', label: '— اختر —' }, ...districts.map(d => ({ value: d, label: d }))]} value={form.district} onChange={v => setForm({ ...form, district: v })} />}
          <Input label="العزلة / الحارة" value={form.area} onChangeText={v => setForm({ ...form, area: v })} placeholder="اختياري" />
          <Input label="الحد الائتماني (ر.ي)" value={form.credit_limit} onChangeText={v => setForm({ ...form, credit_limit: v })} keyboardType="numeric" />
          <Picker label="المندوب المسؤول" options={[{ value: '', label: '— بدون —' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} value={form.assigned_agent_id} onChange={v => setForm({ ...form, assigned_agent_id: v })} />
        </View>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
          <Btn label={saving ? '...' : '💾 حفظ نقطة البيع'} variant="success" style={{ flex: 2 }} onPress={save} disabled={saving} />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function EditPOSScreen({ route, navigation }) {
  const { id } = route.params;
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    async function load() {
      const [posAll, aR] = await Promise.all([
        getLocalPosDB(),
        getLocalUsers(),
      ]);
      const p = posAll.find(x => x.id === id);
      if (p) setForm({ name: p.name || '', owner_name: p.owner_name || '', phone: p.phone || '', city: p.city || '', credit_limit: String(p.credit_limit || 500000), assigned_agent_id: p.assigned_agent_id || '' });
      setAgents(aR.filter(a => a.role === 'agent' && a.active));
    }
    load();
  }, [id]);
  const save = async () => {
    if (!form?.name) { Alert.alert('تنبيه', 'الاسم مطلوب'); return; }
    setSaving(true);
    await updateLocalPOS(id, { name: form.name, owner_name: form.owner_name, phone: form.phone, city: form.city, credit_limit: parseFloat(form.credit_limit) || 500000, assigned_agent_id: form.assigned_agent_id || null });
    setSaving(false);
    Alert.alert('✅ تم', 'تم التعديل', [{ text: 'موافق', onPress: () => navigation.goBack() }]);
  };
  if (!form) return <Loading />;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <View style={st.section}>
          <Text style={st.sectionTitle}>تعديل بيانات نقطة البيع</Text>
          <Input label="اسم المحل *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
          <Input label="اسم المالك" value={form.owner_name} onChangeText={v => setForm({ ...form, owner_name: v })} />
          <Input label="رقم الجوال" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
          <Input label="المدينة / المنطقة" value={form.city} onChangeText={v => setForm({ ...form, city: v })} />
          <Input label="الحد الائتماني (ر.ي)" value={form.credit_limit} onChangeText={v => setForm({ ...form, credit_limit: v })} keyboardType="numeric" />
          <Picker label="المندوب المسؤول" options={[{ value: '', label: '— بدون —' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} value={form.assigned_agent_id} onChange={v => setForm({ ...form, assigned_agent_id: v })} />
        </View>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
          <Btn label={saving ? '...' : '💾 حفظ التعديل'} variant="success" style={{ flex: 2 }} onPress={save} disabled={saving} />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: 5 },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border2, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  pickerTxt: { fontSize: fontSize.md, color: colors.t1, flex: 1, marginLeft: 8 },
  dropdown: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border2, borderRadius: radius.sm, marginTop: -spacing.md, marginBottom: spacing.md, zIndex: 999, elevation: 5 },
  dropItem: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropItemAct: { backgroundColor: colors.blue + '11' },
  dropTxt: { fontSize: fontSize.md, color: colors.t1 },
  invoiceHeader: { backgroundColor: colors.card2, borderTopWidth: 3, borderTopColor: colors.blue, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.t1 },
  invoiceDate: { fontSize: fontSize.sm, color: colors.t3 },
  section: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.t1, marginBottom: spacing.md },
  tableHeader: { flexDirection: 'row', backgroundColor: colors.bg2, padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.xs },
  thCell: { fontSize: fontSize.xs, fontWeight: '700', color: colors.t3, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: 4, marginBottom: 2 },
  tdCell: { fontSize: fontSize.sm, color: colors.t1, textAlign: 'center' },
  addItemBox: { backgroundColor: colors.bg2, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border2, borderStyle: 'dashed' },
  addItemTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.blue, marginBottom: spacing.md },
  preview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  totalsBox: { marginTop: spacing.md, backgroundColor: colors.bg2, borderRadius: radius.md, padding: spacing.md },
  infoBox: { backgroundColor: colors.blue + '11', borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.blue + '33' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
