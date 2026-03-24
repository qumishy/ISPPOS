from pathlib import Path
import re

p = Path("src/screens/FormScreens.js")
text = p.read_text()

text = text.replace(
    "  createLocalInvoice, addInvoiceItem,\n  createLocalCollection, createAgentWallet,\n  softDeleteInvoice, getLocalInvoiceItems,\n} from '../services/database';",
    "  createLocalInvoice, addInvoiceItem,\n  createLocalCollection, createAgentWallet,\n  softDeleteInvoice, getLocalInvoiceItems, getLocalInvoices,\n} from '../services/database';"
)

new_invoice = r"""export function NewInvoiceScreen({ navigation }) {
  const { user } = useAuth();
  const [pos, setPos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({
    pos_id: '', agent_id: user?.role==='agent' ? user.id : '',
    type: 'credit', invoice_date: todayISO(), notes: '', discount: '0',
  });
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ category_id:'', wallet_id:'', unit_price:'', quantity:'' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const agentId = user?.role === 'agent' ? user.id : null;
        const [posR, agentR, catR, walR] = await Promise.all([
          supabase.from('pos_customers').select('id,name').eq('is_blocked', false).order('name'),
          supabase.from('users').select('id,name').eq('role','agent').eq('is_active',true).order('name'),
          supabase.from('card_categories').select('id,name,price').eq('is_active',true).order('price'),
          agentId
            ? supabase.from('agent_wallets').select('id,agent_id,category_id,batch_id,from_card,to_card,total_cards,sold_cards,batches(batch_number,serial_number)').eq('agent_id',agentId)
            : supabase.from('agent_wallets').select('id,agent_id,category_id,batch_id,from_card,to_card,total_cards,sold_cards,batches(batch_number,serial_number)'),
        ]);
        setPos(posR.data || []);
        setAgents(agentR.data || []);
        setCategories(catR.data || []);
        const w = (walR.data||[]).map(x=>({...x, remaining_cards:(x.total_cards||0)-(x.sold_cards||0)}));
        setWallets(w.filter(x=>x.remaining_cards>0));
      } catch(e) {
        console.log('Load error:', e.message);
      }
      setDataLoading(false);
    }
    load();
  }, [user]);

  const onSelectCategory = (catId) => {
    const cat = categories.find(c => c.id === catId);
    const catWallets = wallets.filter(w => w.category_id === catId);
    setNewItem(f => ({
      ...f,
      category_id: catId,
      unit_price: String(cat?.price || ''),
      wallet_id: catWallets.length === 1 ? catWallets[0].id : '',
    }));
  };

  const itemTotal = () => (parseInt(newItem.quantity)||0) * (parseFloat(newItem.unit_price)||0);
  const subtotal = () => items.reduce((s,i) => s + i.total, 0);
  const discount = () => Math.max(0, parseFloat(form.discount)||0);
  const grandTotal = () => Math.max(0, subtotal() - discount());

  const addItem = () => {
    if (!newItem.category_id || !newItem.quantity || !newItem.unit_price) {
      Alert.alert('تنبيه', 'اختر الفئة وأدخل الكمية والسعر');
      return;
    }

    const qty = parseInt(newItem.quantity) || 0;
    if (qty <= 0) {
      Alert.alert('خطأ', 'الكمية يجب أن تكون أكبر من صفر');
      return;
    }

    const wallet = wallets.find(w => w.id === newItem.wallet_id);
    if (wallet && qty > wallet.remaining_cards) {
      Alert.alert('خطأ', `المتاح في المحفظة: ${wallet.remaining_cards} ورقة فقط`);
      return;
    }

    const cat = categories.find(c => c.id === newItem.category_id);

    setItems(prev => [
      ...prev,
      {
        ...newItem,
        cat_name: cat?.name || '—',
        quantity: qty,
        unit_price: parseFloat(newItem.unit_price),
        total: qty * (parseFloat(newItem.unit_price) || 0),
        id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 7),
      }
    ]);

    setNewItem({ category_id:'', wallet_id:'', unit_price:'', quantity:'' });
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const save = async () => {
    if (!form.pos_id || !form.agent_id) {
      Alert.alert('تنبيه', 'اختر نقطة البيع والمندوب');
      return;
    }

    if (items.length === 0) {
      Alert.alert('تنبيه', 'أضف بنداً واحداً على الأقل');
      return;
    }

    setSaving(true);

    try {
      const total = subtotal();
      const disc = discount();
      const net = Math.max(0, total - disc);

      // 1) حفظ الفاتورة أولاً محليًا
      const createdInvoice = await createLocalInvoice({
        ...form,
        total_amount: total,
        net_amount: net,
        discount: disc,
        paid_amount: 0,
        status: form.type === 'cash' ? 'paid' : 'pending',
      });

      const invoiceId = createdInvoice?.id;
      const invoiceNumber = createdInvoice?.invoice_number;

      if (!invoiceId) {
        throw new Error('تعذر إنشاء الفاتورة');
      }

      // 2) تأخير جزئي بسيط لضمان ثبات الحفظ المحلي
      await sleep(150);

      // 3) حفظ البنود كلها بنفس invoice_id
      for (const item of items) {
        const wallet = wallets.find(w => w.id === item.wallet_id);
        const soldCards = wallet?.sold_cards || 0;
        const startCard = wallet?.from_card ? Number(wallet.from_card) + Number(soldCards) : null;
        const endCard = startCard !== null ? (startCard + Number(item.quantity) - 1) : null;

        await addInvoiceItem({
          invoice_id: invoiceId,
          category_id: item.category_id || null,
          batch_id: wallet?.batch_id || null,
          wallet_id: item.wallet_id || null,
          from_card: startCard,
          to_card: endCard,
          unit_price: Number(item.unit_price || 0),
          quantity: Number(item.quantity || 0),
          total_price: Number(item.quantity || 0) * Number(item.unit_price || 0),
        });
      }

      // 4) محاولة مزامنة لاحقًا إن وُجد إنترنت بدون كسر العمل أوفلاين
      try {
        const netInfo = await import('@react-native-community/netinfo');
        const syncSvc = await import('../services/SyncService');
        const state = await netInfo.default.fetch();
        const online = !!(state.isConnected && state.isInternetReachable !== false);
        if (online) {
          await syncSvc.syncNow();
        }
      } catch (e) {}

      setSaving(false);

      Alert.alert(
        '✅ تم',
        `الفاتورة: ${invoiceNumber}\nالإجمالي: ${formatCurrency(net)}`,
        [
          {
            text: 'موافق',
            onPress: () => navigation.replace('InvoiceDetail', { id: invoiceId })
          }
        ]
      );
    } catch (e) {
      setSaving(false);
      Alert.alert('خطأ', e.message || 'تعذر حفظ الفاتورة');
    }
  };

  if (dataLoading) return <Loading />;

  const filteredWallets = wallets.filter(w => w.category_id === newItem.category_id);

  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{ padding:spacing.md, paddingBottom:100 }}>

        <View style={st.invoiceHeader}>
          <Text style={st.invoiceTitle}>🧾 فاتورة مبيعات</Text>
          <Text style={st.invoiceDate}>{form.invoice_date}</Text>
        </View>

        <View style={st.section}>
          <Picker
            label="نقطة البيع *"
            options={pos.map(p => ({ value:p.id, label:p.name }))}
            value={form.pos_id}
            onChange={v => setForm({...form, pos_id:v})}
            placeholder="اختر العميل..."
          />
          {user?.role !== 'agent' && (
            <Picker
              label="المندوب *"
              options={agents.map(a => ({ value:a.id, label:a.name }))}
              value={form.agent_id}
              onChange={v => setForm({...form, agent_id:v})}
            />
          )}
          <Row style={{ gap:spacing.md }}>
            <View style={{ flex:1 }}>
              <Picker
                label="النوع"
                options={[{value:'credit',label:'آجل'},{value:'cash',label:'نقدي'}]}
                value={form.type}
                onChange={v => setForm({...form, type:v})}
              />
            </View>
            <View style={{ flex:1 }}>
              <Input
                label="التاريخ"
                value={form.invoice_date}
                onChangeText={v => setForm({...form, invoice_date:v})}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </Row>
          <Input
            label="ملاحظات"
            value={form.notes}
            onChangeText={v => setForm({...form, notes:v})}
            placeholder="اختياري..."
            multiline
          />
        </View>

        <View style={st.section}>
          <Text style={st.sectionTitle}>📋 البنود</Text>

          {items.length > 0 && (
            <View style={st.tableHeader}>
              <Text style={[st.thCell,{flex:2}]}>الفئة</Text>
              <Text style={[st.thCell,{flex:1}]}>الكمية</Text>
              <Text style={[st.thCell,{flex:1}]}>السعر</Text>
              <Text style={[st.thCell,{flex:1}]}>الإجمالي</Text>
              <Text style={[st.thCell,{width:28}]}> </Text>
            </View>
          )}

          {items.map((item, i) => (
            <View key={item.id} style={[st.tableRow, i%2===0 && {backgroundColor:colors.card2}]}>
              <Text style={[st.tdCell,{flex:2,color:colors.cyan,fontWeight:'600'}]}>{item.cat_name}</Text>
              <Text style={[st.tdCell,{flex:1}]}>{item.quantity}</Text>
              <Text style={[st.tdCell,{flex:1}]}>{formatCurrency(item.unit_price)}</Text>
              <Text style={[st.tdCell,{flex:1,color:colors.green,fontWeight:'700'}]}>{formatCurrency(item.total)}</Text>
              <TouchableOpacity style={{width:28,alignItems:'center'}} onPress={() => removeItem(item.id)}>
                <Text style={{color:colors.red,fontSize:15}}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={st.addItemBox}>
            <Text style={st.addItemTitle}>+ إضافة بند</Text>
            <Picker
              label="الفئة *"
              options={categories.map(c => ({ value:c.id, label:`${c.name} — ${formatCurrency(c.price)}` }))}
              value={newItem.category_id}
              onChange={onSelectCategory}
              placeholder="اختر الفئة..."
            />
            {filteredWallets.length > 0 && (
              <Picker
                label="المحفظة"
                options={filteredWallets.map(w => ({ value:w.id, label:`${w.batches?.batch_number||'—'} • متبقي: ${w.remaining_cards}` }))}
                value={newItem.wallet_id}
                onChange={v => setNewItem({...newItem, wallet_id:v})}
              />
            )}
            <Row style={{ gap:spacing.sm }}>
              <View style={{ flex:1 }}>
                <Input
                  label="عدد الأوراق *"
                  value={newItem.quantity}
                  onChangeText={v => setNewItem({...newItem, quantity:v})}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
              <View style={{ flex:1 }}>
                <Input
                  label="سعر الورقة *"
                  value={newItem.unit_price}
                  onChangeText={v => setNewItem({...newItem, unit_price:v})}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </Row>
            {newItem.quantity && newItem.unit_price && itemTotal() > 0 && (
              <View style={st.preview}>
                <Text style={{color:colors.t3,fontSize:fontSize.xs}}>إجمالي البند</Text>
                <Text style={{color:colors.green,fontWeight:'800',fontSize:fontSize.xl}}>{formatCurrency(itemTotal())}</Text>
              </View>
            )}
            <Btn label="✅ إضافة البند" variant="success" size="sm" onPress={addItem}/>
          </View>

          {items.length > 0 && (
            <View style={st.totalsBox}>
              <Row style={{justifyContent:'space-between',marginBottom:spacing.sm}}>
                <Text style={{color:colors.t2}}>المجموع الفرعي</Text>
                <Text style={{color:colors.t1,fontWeight:'700'}}>{formatCurrency(subtotal())}</Text>
              </Row>
              <Row style={{alignItems:'center',marginBottom:spacing.sm}}>
                <Text style={{color:colors.t2,flex:1}}>الخصم (ر.ي)</Text>
                <View style={{width:140}}>
                  <Input
                    value={form.discount}
                    onChangeText={v => setForm({...form,discount:v})}
                    keyboardType="numeric"
                    placeholder="0"
                    style={{marginBottom:0}}
                  />
                </View>
              </Row>
              <Row style={{justifyContent:'space-between',paddingTop:spacing.sm,borderTopWidth:1,borderTopColor:colors.border2}}>
                <Text style={{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1}}>الإجمالي الصافي</Text>
                <Text style={{fontSize:24,fontWeight:'800',color:colors.green}}>{formatCurrency(grandTotal())}</Text>
              </Row>
            </View>
          )}
        </View>

        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={() => navigation.goBack()}/>
          <Btn
            label={saving?'جاري الحفظ...':'💾 حفظ الفاتورة'}
            variant="primary"
            style={{flex:2}}
            onPress={save}
            disabled={saving || items.length===0}
          />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}"""

invoice_detail = r"""export function InvoiceDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { can } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // 1) قراءة محلية أولاً بسرعة
        const localInvoices = await getLocalInvoices({});
        const localInvoice = (localInvoices || []).find(x => String(x.id) === String(id));

        if (localInvoice) {
          setInvoice({
            ...localInvoice,
            pos_customers: localInvoice.pos_customers || {},
            users: localInvoice.users || {},
          });
        }

        const localItems = await getLocalInvoiceItems(id);
        if (localItems.length > 0) {
          setItems(localItems.map(i => ({
            ...i,
            cat_name: i.category_name || i.cat_name || '—'
          })));
        }

        // 2) محاولة الإثراء من Supabase إن توفر
        try {
          const { data } = await supabase
            .from('invoices')
            .select('*,pos_customers(name),users(name)')
            .eq('id', id)
            .single();

          if (data) {
            setInvoice(data);
          }

          if (!localItems.length) {
            const { data: sbItems } = await supabase
              .from('invoice_items')
              .select('*,card_categories(name)')
              .eq('invoice_id', id);

            setItems((sbItems || []).map(i => ({
              ...i,
              cat_name: i.card_categories?.name || '—'
            })));
          }
        } catch (e) {}
      } catch (e) {}
      setLoading(false);
    }
    load();
  }, [id]);

  const handleDelete = () => Alert.alert('حذف الفاتورة','هل تريد حذف هذه الفاتورة؟',[
    {text:'إلغاء',style:'cancel'},
    {text:'حذف',style:'destructive',onPress:async()=>{
      await softDeleteInvoice(id);
      navigation.goBack();
    }},
  ]);

  if (loading) return <Loading/>;
  if (!invoice) return <View style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center'}}><Text style={{color:colors.t3}}>الفاتورة غير موجودة</Text></View>;

  return (
    <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.md,paddingBottom:60}}>
      <View style={st.invoiceHeader}>
        <Text style={st.invoiceTitle}>{invoice.invoice_number}</Text>
        <Badge status={invoice.status}/>
      </View>
      <View style={st.section}>
        {[
          {l:'نقطة البيع', v:invoice.pos_customers?.name||'—'},
          {l:'المندوب', v:invoice.users?.name||invoice.agent_id||'—'},
          {l:'التاريخ', v:invoice.invoice_date||'—'},
        ].map((item,i)=>(
          <Row key={i} style={{justifyContent:'space-between',paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border}}>
            <Text style={{color:colors.t3}}>{item.l}</Text>
            <Text style={{color:colors.t1,fontWeight:'700'}}>{item.v}</Text>
          </Row>
        ))}
        <Row style={{justifyContent:'space-between',paddingVertical:spacing.sm}}>
          <Text style={{color:colors.t3}}>النوع</Text>
          <Badge status={invoice.type}/>
        </Row>
      </View>

      <View style={st.section}>
        <Text style={st.sectionTitle}>📋 البنود</Text>
        {items.length===0
          ? <Text style={{textAlign:'center',color:colors.t3,padding:spacing.lg}}>لا توجد بنود</Text>
          : (<>
            <View style={st.tableHeader}>
              <Text style={[st.thCell,{flex:2}]}>الفئة</Text>
              <Text style={[st.thCell,{flex:1}]}>الكمية</Text>
              <Text style={[st.thCell,{flex:1}]}>سعر</Text>
              <Text style={[st.thCell,{flex:1}]}>إجمالي</Text>
            </View>
            {items.map((item,i)=>(
              <View key={item.id} style={[st.tableRow,i%2===0&&{backgroundColor:colors.card2}]}>
                <Text style={[st.tdCell,{flex:2,color:colors.cyan}]}>{item.cat_name||item.category_name||'—'}</Text>
                <Text style={[st.tdCell,{flex:1}]}>{item.quantity}</Text>
                <Text style={[st.tdCell,{flex:1}]}>{formatCurrency(item.unit_price)}</Text>
                <Text style={[st.tdCell,{flex:1,color:colors.green,fontWeight:'700'}]}>{formatCurrency(item.total_price || (Number(item.quantity||0) * Number(item.unit_price||0)))}</Text>
              </View>
            ))}
          </>)
        }
        <View style={st.totalsBox}>
          <Row style={{justifyContent:'space-between',marginBottom:spacing.xs}}>
            <Text style={{color:colors.t3}}>المجموع الفرعي</Text>
            <Text style={{color:colors.t1,fontWeight:'700'}}>{formatCurrency(invoice.total_amount)}</Text>
          </Row>
          {invoice.discount>0&&(
            <Row style={{justifyContent:'space-between',marginBottom:spacing.xs}}>
              <Text style={{color:colors.t3}}>الخصم</Text>
              <Text style={{color:colors.orange,fontWeight:'700'}}>- {formatCurrency(invoice.discount)}</Text>
            </Row>
          )}
          <Row style={{justifyContent:'space-between',paddingTop:spacing.sm,borderTopWidth:1,borderTopColor:colors.border2}}>
            <Text style={{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1}}>الإجمالي الصافي</Text>
            <Text style={{fontSize:24,fontWeight:'800',color:colors.green}}>{formatCurrency(invoice.net_amount||invoice.total_amount)}</Text>
          </Row>
        </View>
      </View>

      {can('canDeleteInvoice') && invoice.status==='pending' && (
        <Btn label="🗑️ حذف الفاتورة" variant="danger" onPress={handleDelete} style={{marginTop:spacing.sm}}/>
      )}
    </ScrollView>
  );
}"""

text = re.sub(
    r"export function NewInvoiceScreen\(\{ navigation \}\) \{.*?\n\}\n\n// ══════════════════════════════════════════════════\n// تفاصيل الفاتورة",
    new_invoice + "\n\n// ══════════════════════════════════════════════════\n// تفاصيل الفاتورة",
    text,
    flags=re.S
)

text = re.sub(
    r"export function InvoiceDetailScreen\(\{ route, navigation \}\) \{.*?\n\}\n\n// ══════════════════════════════════════════════════\n// إشعار قبض",
    invoice_detail + "\n\n// ══════════════════════════════════════════════════\n// إشعار قبض",
    text,
    flags=re.S
)

p.write_text(text)
print("patched FormScreens.js")
