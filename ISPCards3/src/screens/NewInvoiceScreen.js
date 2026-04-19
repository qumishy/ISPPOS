import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getLocalUsers, getLocalCategories, getLocalWallets, getLocalInvoices,
  getBatchesByAgent, createLocalInvoice, addInvoiceItem,
  updateLocalWalletCards, getLocalPosDB, subscribeDataChanges
} from '../services/database';
import { todayISO, formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Row, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';

export default function NewInvoiceScreen({ navigation }) {
  const { user } = useAuth();
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
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [newItem, setNewItem] = useState({ category_id: '', wallet_id: '', batch_id: '', unit_price: '', quantity: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const agentId = user?.role === 'agent' ? user.id : null;
        const [posR, agentR, catR, walR, invsR] = await Promise.all([
          getLocalPosDB(), getLocalUsers(), getLocalCategories(), getLocalWallets(agentId || undefined), getLocalInvoices({ onlyWithBalance: true })
        ]);
        setPos(posR.filter(p => !p.is_blocked));
        setAgents(agentR.filter(a => a.role === 'agent' && a.active));
        setCategories(catR.filter(c => c.active));
        setPendingInvoices(invsR || []);
        const w = walR.map(x => ({ ...x, remaining_cards: Number(x.total_cards || 0) - Number(x.sold_cards || 0) }));
        setWallets(w.filter(x => x.remaining_cards > 0));
        if (agentId) setBatches(await getBatchesByAgent(agentId));
      } catch (e) { console.error('[NewInvoiceScreen] load error:', e?.message || e); }

      setDataLoading(false);
    }
    load();

    // 🔄 إعادة تحميل المحافظ تلقائياً عند وصول تحديث من المزامنة
    const unsub = subscribeDataChanges((event) => {
      if (event.type !== 'agent_wallets' && event.type !== 'all') return;
      const agentId = user?.role === 'agent' ? user.id : null;
      getLocalWallets(agentId || undefined).then(walR => {
        const w = walR.map(x => ({ ...x, remaining_cards: Number(x.total_cards || 0) - Number(x.sold_cards || 0) }));
        setWallets(w.filter(x => x.remaining_cards > 0));
        setDataLoading(false);
      }).catch(() => {});
    });
    return () => unsub && unsub();
  }, [user]);

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
    const qty = parseInt(newItem.quantity) || 0;
    const wallet = dynamicWallets.find(w => w.id === newItem.wallet_id);
    if (wallet && qty > wallet.remaining_cards) { Alert.alert('خطأ', `المتاح المتبقي في المحفظة هو: ${wallet.remaining_cards} ورقة فقط`); return; }
    const cat = categories.find(c => c.id === newItem.category_id);
    setItems(prev => [...prev, { ...newItem, cat_name: cat?.name || '—', batch_number: wallet?.batches?.serial_number || '', quantity: qty, unit_price: parseFloat(newItem.unit_price), total: qty * parseFloat(newItem.unit_price), id: Date.now().toString() }]);
    setNewItem({ category_id: '', wallet_id: '', batch_id: '', unit_price: '', quantity: '' });
  };

  const performSave = async () => {
    if (!form.pos_id || !form.agent_id) { Alert.alert('تنبيه', 'اختر نقطة البيع والمندوب'); return; }
    if (items.length === 0) { Alert.alert('تنبيه', 'أضف بنداً واحداً على الأقل'); return; }

    Alert.alert('تأكيد الحفظ', 'هل أنت متأكد من مراجعة البنود وحفظ الفاتورة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تأكيد وحفظ', onPress: async () => {
          setSaving(true);
          try {
            const sub = items.reduce((s, i) => s + i.total, 0);
            const disc = Math.max(0, parseFloat(form.discount) || 0);
            const { id, invoice_number } = await createLocalInvoice({ ...form, total_amount: sub, discount: disc });
            for (const item of items) {
              const wallet = wallets.find(w => w.id === item.wallet_id);
              const fromCard = wallet ? (Number(wallet.from_card) + Number(wallet.sold_cards)) : 1;
              await addInvoiceItem({ invoice_id: id, category_id: item.category_id, batch_id: wallet?.batch_id || '', wallet_id: item.wallet_id || '', from_card: fromCard, to_card: fromCard + item.quantity - 1, unit_price: item.unit_price, quantity: item.quantity, total_price: item.unit_price * item.quantity });
              if (item.wallet_id) await updateLocalWalletCards(item.wallet_id, item.quantity);
            }
            setSaving(false);
            Alert.alert('✅ تم الحفظ بنجاح', `الفاتورة: ${invoice_number}\nالإجمالي الصافي: ${formatCurrency(sub - disc)}`, [
              { text: 'عرض تفاصيل الفاتورة', onPress: () => navigation.replace('InvoiceDetail', { id }) }
            ]);
          } catch (e) { setSaving(false); Alert.alert('خطأ', e.message); }
        }
      }
    ]);
  };

  if (dataLoading) return <Loading />;

  const isWalletEmpty = user?.role === 'agent' && wallets.length === 0;
  const selectedPOS = pos.find(p => p.id === form.pos_id);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}>
        <View style={s.invoiceHeader}><Text style={s.invoiceTitle}>🧾 مبيعات</Text><Text style={s.invoiceDate}>{form.invoice_date}</Text></View>
        <View style={s.section}>
          <Picker label="نقطة البيع *" options={pos.map(p => ({ value: p.id, label: p.name }))} value={form.pos_id} onChange={v => setForm({ ...form, pos_id: v })} placeholder="اختر العميل..." />
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

          {user?.role !== 'agent' && <Picker label="المندوب *" options={agents.map(a => ({ value: a.id, label: a.name }))} value={form.agent_id} onChange={v => setForm({ ...form, agent_id: v })} />}
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
              <View style={s.tableContainer}>
                <View style={s.tableHeader}><Text style={{ flex: 2, color: colors.t2, fontWeight: 'bold' }}>الفئة</Text><Text style={{ flex: 1, color: colors.t2, fontWeight: 'bold', textAlign: 'center' }}>الكمية</Text><Text style={{ flex: 1.5, color: colors.t2, fontWeight: 'bold', textAlign: 'center' }}>السعر</Text><Text style={{ flex: 1.5, color: colors.t2, fontWeight: 'bold', textAlign: 'center' }}>إجمالي</Text><View style={{ width: 30 }} /></View>
                {items.map((it, idx) => (
                  <View key={idx} style={s.tableRow}><View style={{ flex: 2 }}><Text style={{ color: colors.t1, fontWeight: '700' }}>{it.cat_name}</Text><Text style={{ color: colors.t3, fontSize: 10 }}>{it.batch_number ? `د: ${it.batch_number}` : '—'}</Text></View><Text style={{ flex: 1, color: colors.t1, textAlign: 'center', fontWeight: 'bold' }}>{it.quantity}</Text><Text style={{ flex: 1.5, color: colors.t2, textAlign: 'center' }}>{it.unit_price}</Text><Text style={{ flex: 1.5, color: colors.green, textAlign: 'center', fontWeight: 'bold' }}>{formatCurrency(it.total)}</Text><TouchableOpacity onPress={() => setItems(prev => prev.filter(i => i.id !== it.id))} style={s.deleteBtn}><Text>❌</Text></TouchableOpacity></View>
                ))}
              </View>
            )}
            <View style={s.addItemBox}>
              <Text style={s.addItemTitle}>+ إضافة بند</Text>
              <Picker label="الفئة *" options={availableCategories.map(c => ({ value: c.id, label: `${c.name} — ${formatCurrency(c.price)}` }))} value={newItem.category_id} onChange={onSelectCategory} />
              <Picker label="المحفظة *" options={dynamicWallets.filter(w => !newItem.category_id || w.category_id === newItem.category_id).map(w => ({ value: w.id, label: `${w.batches?.serial_number || '—'} • متبقي: ${w.remaining_cards}` }))} value={newItem.wallet_id} onChange={v => { const sel = dynamicWallets.find(x => x.id === v); const cat = categories.find(c => c.id === sel?.category_id); setNewItem({ ...newItem, wallet_id: v, batch_id: sel?.batch_id || '', category_id: sel?.category_id || newItem.category_id, unit_price: cat ? String(cat.price) : newItem.unit_price }); }} />
              <Row style={{ gap: spacing.sm }}><View style={{ flex: 1 }}><Input label="العدد *" value={newItem.quantity} onChangeText={v => setNewItem({ ...newItem, quantity: v })} /></View><View style={{ flex: 1 }}><Input label="سعر الورقة *" value={newItem.unit_price} onChangeText={v => setNewItem({ ...newItem, unit_price: v })} /></View></Row>
              <Btn label="✅ إضافة البند" onPress={addItem} />
            </View>
            {items.length > 0 && (
              <View style={s.totalsBox}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 5 }}><Text style={{ color: colors.t2 }}>المجموع:</Text><Text style={{ color: colors.t1, fontWeight: 'bold' }}>{formatCurrency(items.reduce((s, i) => s + i.total, 0))}</Text></Row>
                <Input value={form.discount} onChangeText={v => setForm({ ...form, discount: v })} placeholder="مبلغ الخصم" keyboardType="numeric" />
                <View style={s.divider} />
                <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontSize: 18, color: colors.cyan, fontWeight: 'bold' }}>الصافي:</Text><Text style={{ fontSize: 24, color: colors.green, fontWeight: '900' }}>{formatCurrency(Math.max(0, items.reduce((s, i) => s + i.total, 0) - (parseFloat(form.discount) || 0)))}</Text></Row>
              </View>
            )}
          </View>
        )}
        <Row style={s.actions}><Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} /><Btn label={saving ? '...' : '💾 حفظ الفاتورة'} variant="primary" style={{ flex: 2 }} onPress={performSave} disabled={isWalletEmpty} /></Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
