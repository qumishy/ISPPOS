import React, { useState, useEffect } from 'react';
import {
  KeyboardAvoidingView, ScrollView, View, Text,
  TouchableOpacity, Alert, Platform
} from 'react-native';
import * as Print from 'expo-print';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getLocalUsers, getCollectionsForSupply, createLocalSupply,
  getSupplyPrintDetails
} from '../services/database';
import { todayISO, formatCurrency, generateSupplyReceiptHTML } from '../utils/helpers';
import { Input, Btn, Row, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';

export default function NewSupplyScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [collections, setCollections] = useState([]);
  const [selectedCols, setSelectedCols] = useState({});
  const [dateFilter, setDateFilter] = useState(''); 

  const [form, setForm] = useState({ notes: '', type: 'voucher', created_at: todayISO() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLocalUsers().then(u => {
      const ags = [{ id: 'all', name: 'الكل (كافة المناديب)' }, ...u.filter(x => x.role === 'agent' && x.active)];
      setAgents(ags);
      if (ags.length > 0) setSelectedAgent('all');
    });
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      const cashierId = user?.role === 'cashier' ? user.id : null;
      getCollectionsForSupply(selectedAgent, dateFilter || null, cashierId).then(c => {
         setCollections(c);
         const initialSel = {};
         c.forEach(x => initialSel[x.id] = true);
         setSelectedCols(initialSel);
      });
    } else {
      setCollections([]);
      setSelectedCols({});
    }

    // Auto-generate Notes
    const agName = selectedAgent === 'all' ? '' : (agents.find(a => a.id === selectedAgent)?.name || '');
    let desc = '';
    if (agName && dateFilter) desc = `إيرادات المندوب ${agName} لتاريخ ${dateFilter}`;
    else if (agName && !dateFilter) desc = `إيرادات المندوب ${agName}`;
    else if (!agName && dateFilter) desc = `إيرادات تاريخ ${dateFilter}`;
    else desc = `إيرادات عامة لكافة المناديب`;
    
    setForm(prev => {
       if (!prev.notes || prev.notes.startsWith('إيرادات ')) {
         return { ...prev, notes: desc };
       }
       return prev;
    });

  }, [selectedAgent, dateFilter, agents]);

  const toggleCol = (id) => setSelectedCols(p => ({ ...p, [id]: !p[id] }));
  const totalAmount = collections.filter(c => selectedCols[c.id]).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const handleSave = async () => {
    const selIds = collections.filter(c => selectedCols[c.id]).map(c => c.id);
    if (selIds.length === 0 || totalAmount <= 0) {
      Alert.alert('تنبيه', 'يجب تحديد تحصيلات معتمدة وتأكيدها. لا يمكن توريد مبلغ صفري.');
      return;
    }

    Alert.alert('تأكيد التوريد', `سيتم رفع توريد بقيمة ${formatCurrency(totalAmount)} متعلق بـ ${selIds.length} سندات تحصيل.\nهل أنت متأكد؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد التوريد', onPress: async () => {
        setSaving(true);
        try {
          const supply = await createLocalSupply({
            user_id: user.id,
            agent_id: selectedAgent === 'all' ? null : selectedAgent,
            amount: totalAmount,
            notes: form.notes,
            type: form.type,
            created_at: form.created_at,
            status: 'pending'
          }, selIds);

          setSaving(false);
          // الرجوع للخلف أولاً حتى لا تبقى الشاشة مرئية خلف رسالة النجاح
          navigation.goBack();
          // ثم عرض رسالة النجاح مع خيار الطباعة فقط (بدون "موافق" للرجوع مجدداً)
          setTimeout(() => {
            Alert.alert(
              '✅ تم الحفظ',
              `تم تسجيل إشعار التوريد رقم: ${supply.supply_number}\nبانتظار اعتماد المدير.`,
              [
                { text: '🖨️ طباعة السند', onPress: () => printReceipt(supply) },
                { text: 'موافق', style: 'default' }
              ]
            );
          }, 300);
        } catch (e) {
          setSaving(false);
          Alert.alert('خطأ', e.message);
        }
      }}
    ]);
  };

  const printReceipt = async (supply) => {
    try {
      const details = await getSupplyPrintDetails(supply.id);
      const agentNames = selectedAgent === 'all' ? 'جهة عامة (أكثر من مندوب)' : (agents.find(a => a.id === selectedAgent)?.name || 'غير محدد');
      const html = generateSupplyReceiptHTML(supply, details, user.name, agentNames);
      await Print.printAsync({ html });
    } catch(e) {
      Alert.alert('خطأ', 'فشل في بناء سند الطباعة: ' + e.message);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.md }}>
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.blue }]}>1. المندوب المُورّد</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, paddingVertical: 5 }}>
            {agents.map(a => {
              const isSel = selectedAgent === a.id;
              return (
                <TouchableOpacity key={a.id} onPress={() => setSelectedAgent(a.id)} style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, backgroundColor: isSel ? colors.blue : colors.border2, marginRight: 8, ...shadow.blue }}>
                   <Text style={{ color: isSel ? '#fff' : colors.t2, fontWeight: isSel ? 'bold' : 'normal' }}>{a.name}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          
          <Row style={{ gap: spacing.md, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Input label="تاريخ التوريد" value={form.created_at} onChangeText={v => setForm({ ...form, created_at: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="فلترة تحصيلات بتأريخ" value={dateFilter} onChangeText={setDateFilter} placeholder="مثال 2026-04-04 أو اتركه فارغاً" />
            </View>
          </Row>
        </View>

        <View style={s.section}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={[s.sectionTitle, { color: colors.green, marginBottom: 0 }]}>2. التحصيلات المعتمدة للمندوب</Text>
          </Row>
          
          {collections.length === 0 ? (
            <Text style={{ color: colors.t3, textAlign: 'center', padding: 20 }}>لا توجد أي تحصيلات معتمدة وجاهزة للتوريد.</Text>
          ) : (
            <View>
              {collections.map(col => {
                const isSelected = !!selectedCols[col.id];
                return (
                  <TouchableOpacity key={col.id} activeOpacity={0.8} onPress={() => toggleCol(col.id)} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: isSelected ? colors.green+'15' : colors.bg2, borderRadius: radius.md, marginBottom: 8, borderWidth: 1, borderColor: isSelected ? colors.green : colors.border }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: isSelected ? colors.green : colors.border2, backgroundColor: isSelected ? colors.green : 'transparent', alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}>
                      {isSelected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', color: colors.t1 }}>سند {col.collection_number}</Text>
                      <Text style={{ fontSize: 11, color: colors.t3 }}>
                        {selectedAgent === 'all' && `المندوب: ${col.agent_name || 'غير محدد'}  |  `}
                        فاتورة: {col.invoice_number}  |  {col.collection_date}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.green }}>{formatCurrency(col.amount)}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.orange }]}>3. تفاصيل السند النهائي</Text>
          <View style={{ padding: 15, backgroundColor: colors.blue+'10', borderRadius: radius.md, marginBottom: 15 }}>
             <Text style={{ color: colors.t2, fontSize: 14 }}>إجمالي المبالغ المُحددة:</Text>
             <Text style={{ color: colors.blue, fontSize: 32, fontWeight: '900', marginTop: 5 }}>{formatCurrency(totalAmount)}</Text>
          </View>

          <Picker
            label="نوع الدفع أو التوريد"
            options={[{ value: 'voucher', label: 'سند قبض مباشر' }, { value: 'deposit', label: 'إيداع نقدي' }]}
            value={form.type} onChange={v => setForm({ ...form, type: v })}
          />

          <Input label="ملاحظات المُحاسب" value={form.notes} onChangeText={v => setForm({ ...form, notes: v })} multiline style={{ height: 80, textAlignVertical: 'top' }} placeholder="أضف تفاصيل..." />

          <Row style={[s.actions, { marginTop: 20 }]}>
            <Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
            <Btn label={saving ? 'جاري الحفظ...' : '✅ إنشاء التوريد'} variant="primary" style={{ flex: 2 }} onPress={handleSave} disabled={collections.length === 0 || saving} />
          </Row>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
