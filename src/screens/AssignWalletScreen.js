import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  getLocalUsers, getLocalBatches, getLocalCategories, createLocalAgentWallet
} from '../services/database';
import { formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Row, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';
import { useLoading } from '../services/LoadingContext';

export default function AssignWalletScreen({ navigation }) {
  const { user, projectId, selectedPhase } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [agents, setAgents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [cats, setCats] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ agent_id: '', category_id: '', batch_id: '', quantity: '', notes: '' });
  const [batchInfo, setBatchInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [a, b, c] = await Promise.all([getLocalUsers(projectId), getLocalBatches(projectId), getLocalCategories(projectId)]);
      setAgents(a.filter(u => u.role === 'agent' && u.active)); setBatches(b.filter(x => x.available_cards > 0)); setCats(c); setDataLoading(false);
    }
    load();
  }, []);

  const save = async () => {
    if (saving) return;
    if (!form.agent_id || !form.batch_id || !form.quantity) { Alert.alert('تنبيه', 'أكمل البيانات'); return; }
    if (batchInfo && parseInt(form.quantity) > batchInfo.available_cards) { Alert.alert('خطأ', `المتاح: ${batchInfo.available_cards}`); return; }
    try {
      Alert.alert('تأكيد التوزيع', `هل تريد توزيع ${form.quantity} ورقة للمندوب المختار؟`, [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد التوزيع', onPress: async () => {
            if (saving) return;
            setSaving(true);
            showLoading('جاري حفظ التوزيع محلياً...');
            try {
              await createLocalAgentWallet({ ...form, total_cards: parseInt(form.quantity), issued_by: user.id, project_id: projectId, phase_id: selectedPhase?.id });
              hideLoading();
              navigation.goBack();
              setTimeout(() => {
                Alert.alert('✅ تم', 'تم التوزيع بنجاح');
              }, 250);
            } catch (e) {
              hideLoading();
              Alert.alert('خطأ', e.message);
            } finally {
              setSaving(false);
            }
          }
        }
      ]);
    } catch (e) { Alert.alert('خطأ', e.message); }
  };

  if (dataLoading) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={s.section}>
        <Picker label="المندوب *" options={agents.map(a => ({ value: a.id, label: a.name }))} value={form.agent_id} onChange={v => setForm({ ...form, agent_id: v })} searchable={true} />
        <Picker label="الفئة *" options={cats.map(c => ({ value: c.id, label: c.name }))} value={form.category_id} onChange={v => setForm({ ...form, category_id: v, batch_id: '' })} searchable={true} />
        <Picker label="الدفعة *" options={batches.filter(b => b.category_id === form.category_id).map(b => ({ value: b.id, label: `${b.serial_number} (متاح: ${b.available_cards})` }))} value={form.batch_id} onChange={v => { setForm({ ...form, batch_id: v }); setBatchInfo(batches.find(x => x.id === v)); }} searchable={true} />
        {batchInfo && <View style={s.infoBox}><Text style={{ color: colors.t3 }}>المتاح للتوزيع:</Text><Text style={{ color: colors.green, fontSize: 18, fontWeight: '800' }}>{batchInfo.available_cards} ورقة</Text></View>}
        <Input label="الكمية *" value={form.quantity} onChangeText={v => setForm({ ...form, quantity: v })} keyboardType="numeric" />
        <Input label="ملاحظات" value={form.notes} onChangeText={v => setForm({ ...form, notes: v })} multiline />
        <Row style={s.actions}><Btn label="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} disabled={saving} /><Btn label={saving ? 'جاري الحفظ...' : 'حفظ'} icon={saving ? undefined : "save"} variant="primary" style={{ flex: 2 }} onPress={save} disabled={saving} /></Row>
      </View>
    </ScrollView>
  );
}
