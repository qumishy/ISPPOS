import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { useTheme } from '../theme';
import { getLocalCategories, createOnlineAdminBatch } from '../services/database';
import { ADMIN_WALLET_ONLINE_NOTE, isAdminManagerRole } from '../services/supabase';
import { useAuth } from '../services/AuthContext';
import { todayISO } from '../utils/helpers';
import { Input, Btn, Loading, Row, Picker } from '../components/UI';
import { makeStyles } from '../styles/form.styles';
import { useLoading } from '../services/LoadingContext';

export default function AddBatchScreen({ navigation }) {
  const { user, projectId, selectedPhase, canAccess } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [cats, setCats] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ category_id: '', batch_text: '', total_cards: '39', received_date: todayISO() });
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLocalCategories(projectId).then(c => { setCats(c.filter(x => x.active)); setDataLoading(false); }); }, [projectId]);

  const save = async () => {
    if (saving) return;
    if (!isAdminManagerRole(user?.role) || !canAccess('Inventory', 'can_add')) { Alert.alert('تنبيه', 'ليس لديك صلاحية تنفيذ هذه الإضافة الإدارية.'); return; }
    if (!form.category_id || !form.batch_text) { Alert.alert('تنبيه', 'أكمل البيانات'); return; }
    try {
      Alert.alert('تأكيد الحفظ', 'هل تريد إضافة هذه الدفعة للمخزون؟', [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حفظ للمخزون', onPress: async () => {
            if (saving) return;
            setSaving(true);
            showLoading('جاري حفظ الدفعة على السيرفر...');
            try {
              const serial = `${form.batch_text.toUpperCase()}-${form.received_date}`;
              await createOnlineAdminBatch({ batch_number: serial, category_id: form.category_id, serial_number: serial, total_cards: parseInt(form.total_cards), received_date: form.received_date, project_id: projectId, phase_id: selectedPhase?.id, actor_role: user?.role });
              hideLoading();
              navigation.goBack();
              setTimeout(() => {
                Alert.alert('✅ تم', `تمت الإضافة بنجاح\n${serial}`);
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
        <Picker label="الفئة *" options={cats.map(c => ({ value: c.id, label: c.name }))} value={form.category_id} onChange={v => setForm({ ...form, category_id: v })} searchable={true} />
        <Row style={{ gap: spacing.md }}><View style={{ flex: 1 }}><Input label="رمز الخانة *" value={form.batch_text} maxLength={6} onChangeText={v => setForm({ ...form, batch_text: v })} placeholder="مثال: A12" /></View><View style={{ flex: 1 }}><Input label="عدد الأوراق *" value={form.total_cards} keyboardType="numeric" onChangeText={v => setForm({ ...form, total_cards: v })} /></View></Row>
        <Input label="تاريخ الاستلام" value={form.received_date} onChangeText={v => setForm({ ...form, received_date: v })} />
        <View style={{ backgroundColor: colors.blue + '12', borderWidth: 1, borderColor: colors.blue + '35', borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm }}>
          <Text style={{ color: colors.blue, fontSize: fontSize.xs, fontWeight: '700', textAlign: 'right', lineHeight: 20 }}>{ADMIN_WALLET_ONLINE_NOTE}</Text>
        </View>
        <Btn label={saving ? 'جاري الحفظ...' : 'حفظ للمخزون'} icon={saving ? undefined : "download"} variant="success" style={{ marginTop: 20 }} onPress={save} disabled={saving} />
      </View>
    </ScrollView>
  );
}
