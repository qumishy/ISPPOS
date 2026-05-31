import React, { useState, useEffect } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { useTheme } from '../theme';
import { getLocalPosDB, getLocalUsers, updateLocalPOS } from '../services/database';
import { Input, Btn, Loading, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';

export default function EditPOSScreen({ route, navigation }) {
  const { id } = route.params;
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [posAll, aR] = await Promise.all([getLocalPosDB(), getLocalUsers()]);
      const p = posAll.find(x => x.id === id);
      if (p) setForm({ ...p, credit_limit: String(p.credit_limit) });
      setAgents(aR.filter(a => a.role === 'agent' && a.active));
    }
    load();
  }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      Alert.alert('تأكيد التعديل', 'هل تريد حفظ التغييرات على نقطة البيع؟', [
        { text: 'إلغاء', style: 'cancel', onPress: () => setSaving(false) },
        {
          text: 'حفظ التعديلات', onPress: async () => {
            await updateLocalPOS(id, { ...form, credit_limit: parseFloat(form.credit_limit) });
            setSaving(false);
            Alert.alert('✅ تم', 'تم التحديث بنجاح', [{ text: 'موافق', onPress: () => navigation.goBack() }]);
          }
        }
      ]);
    } catch (e) { setSaving(false); Alert.alert('خطأ', e.message); }
  };

  if (!form) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={s.section}>
        <Input label="الاسم" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
        <Input label="الهاتف" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
        <Input label="العنوان" value={form.city} onChangeText={v => setForm({ ...form, city: v })} />
        <Input label="سقف الائتمان" value={form.credit_limit} onChangeText={v => setForm({ ...form, credit_limit: v })} keyboardType="numeric" />
        <Picker label="المندوب" options={agents.map(a => ({ value: a.id, label: a.name }))} value={form.assigned_agent_id} onChange={v => setForm({ ...form, assigned_agent_id: v })} searchable={true} />
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 10, alignSelf: 'flex-start' }} />
        <Btn label={saving ? '...' : 'حفظ'} icon="save" variant="primary" style={{ marginTop: 20 }} onPress={save} />
      </View>
    </ScrollView>
  );
}
