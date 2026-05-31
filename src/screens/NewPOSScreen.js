import React, { useState, useEffect } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { useTheme } from '../theme';
import { getLocalUsers, createLocalPOS } from '../services/database';
import { GOVERNORATES, getDistricts } from '../utils/helpers';
import { Input, Btn, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';
import { useLoading } from '../services/LoadingContext';

export default function NewPOSScreen({ navigation }) {
  const { showLoading, hideLoading } = useLoading();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ name: '', owner_name: '', phone: '', governorate: 'صنعاء', district: '', area: '', credit_limit: '500000', assigned_agent_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLocalUsers().then(u => setAgents(u.filter(x => x.role === 'agent' && x.active))); }, []);

  const save = async () => {
    if (saving) return;
    if (!form.name) { Alert.alert('تنبيه', 'الاسم مطلوب'); return; }
    const city = [form.governorate, form.district, form.area].filter(Boolean).join(' / ');
    try {
      Alert.alert('تأكيد الحفظ', 'هل تريد إضافة نقطة البيع الجديدة؟', [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد الإضافة', onPress: async () => {
            if (saving) return;
            setSaving(true);
            showLoading('جاري حفظ نقطة البيع محلياً...');
            try {
              await createLocalPOS({ ...form, city, credit_limit: parseFloat(form.credit_limit) });
              hideLoading();
              navigation.goBack();
              setTimeout(() => {
                Alert.alert('✅ تم', 'تمت الإضافة بنجاح');
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

  const dists = getDistricts(form.governorate);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={s.section}>
        <Input label="اسم المحل *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
        <Input label="اسم المالك" value={form.owner_name} onChangeText={v => setForm({ ...form, owner_name: v })} />
        <Input label="الهاتف" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
        <Picker label="المحافظة *" options={GOVERNORATES.map(g => ({ value: g, label: g }))} value={form.governorate} onChange={v => setForm({ ...form, governorate: v, district: '', area: '' })} searchable={true} />
        {dists.length > 0 && <Picker label="المديرية" options={[{ value: '', label: '— اختر —' }, ...dists.map(d => ({ value: d, label: d }))]} value={form.district} onChange={v => setForm({ ...form, district: v })} searchable={true} />}
        <Input label="الحارة / العزلة" value={form.area} onChangeText={v => setForm({ ...form, area: v })} />
        <Input label="سقف الائتمان" value={form.credit_limit} onChangeText={v => setForm({ ...form, credit_limit: v })} keyboardType="numeric" />
        <Picker label="المندوب المسؤول" options={[{ value: '', label: '— بدون —' }, ...agents.map(a => ({ value: a.id, label: a.name }))]} value={form.assigned_agent_id} onChange={v => setForm({ ...form, assigned_agent_id: v })} searchable={true} />
        <Btn label={saving ? 'جاري الحفظ...' : 'حفظ'} icon={saving ? undefined : "save"} variant="primary" style={{ marginTop: 20 }} onPress={save} disabled={saving} />
      </View>
    </ScrollView>
  );
}
