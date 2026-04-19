import React, { useState, useEffect } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { useTheme } from '../theme';
import { getLocalCategories, createLocalBatch } from '../services/database';
import { todayISO } from '../utils/helpers';
import { Input, Btn, Loading, Row, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';

export default function AddBatchScreen({ navigation }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [cats, setCats] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ category_id: '', batch_text: '', total_cards: '39', received_date: todayISO() });
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLocalCategories().then(c => { setCats(c.filter(x => x.active)); setDataLoading(false); }); }, []);

  const save = async () => {
    if (!form.category_id || !form.batch_text) { Alert.alert('تنبيه', 'أكمل البيانات'); return; }
    setSaving(true);
    try {
      Alert.alert('تأكيد الحفظ', 'هل تريد إضافة هذه الدفعة للمخزون؟', [
        { text: 'إلغاء', style: 'cancel', onPress: () => setSaving(false) },
        {
          text: 'حفظ للمخزون', onPress: async () => {
            const serial = `${form.batch_text.toUpperCase()}-${form.received_date}`;
            await createLocalBatch({ batch_number: serial, category_id: form.category_id, serial_number: serial, total_cards: parseInt(form.total_cards), received_date: form.received_date });
            setSaving(false);
            Alert.alert('✅ تم', `تمت الإضافة بنجاح\n${serial}`, [{ text: 'موافق', onPress: () => navigation.goBack() }]);
          }
        }
      ]);
    } catch (e) { setSaving(false); Alert.alert('خطأ', e.message); }
  };

  if (dataLoading) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={s.section}>
        <Picker label="الفئة *" options={cats.map(c => ({ value: c.id, label: c.name }))} value={form.category_id} onChange={v => setForm({ ...form, category_id: v })} />
        <Row style={{ gap: spacing.md }}><View style={{ flex: 1 }}><Input label="رمز الخانة *" value={form.batch_text} maxLength={6} onChangeText={v => setForm({ ...form, batch_text: v })} placeholder="مثال: A12" /></View><View style={{ flex: 1 }}><Input label="عدد الأوراق *" value={form.total_cards} keyboardType="numeric" onChangeText={v => setForm({ ...form, total_cards: v })} /></View></Row>
        <Input label="تاريخ الاستلام" value={form.received_date} onChangeText={v => setForm({ ...form, received_date: v })} />
        <Btn label={saving ? '...' : '📥 حفظ للمخزون'} variant="success" style={{ marginTop: 20 }} onPress={save} />
      </View>
    </ScrollView>
  );
}
