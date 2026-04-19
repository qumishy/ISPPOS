import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, Image, Linking
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme';
import { supabase } from '../services/supabase';
import {
  getLocalUsers, getLocalCategories,
  updateCategory, updateUser, execSQL, getSetting, saveSetting,
  softDeleteCategory, softDeleteUser,
  exportTransactionsBackup, importTransactionsBackup, wipeTransactionsData
} from '../services/database';
import { useAuth, ROLE_PERMISSIONS } from '../services/AuthContext';
import { formatCurrency } from '../utils/helpers';
import { Btn, Loading, Badge, Row, Input, Avatar } from '../components/UI';
import { POSScreen } from './MainScreens';
import { makeStyles } from '../styles/admin.styles';

// ── Premium Picker
function Picker({ label, options, value, onChange, placeholder, s, colors }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <View style={{ marginBottom: 12 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <TouchableOpacity style={[s.picker, open && s.pickerOpen]} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <Text style={[s.pickerTxt, !selected && { color: colors.t3 }]}>{selected ? selected.label : placeholder || 'اختر...'}</Text>
        <Text style={{ color: open ? colors.blue : colors.t3, fontSize: 12 }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.dropdown}>
          <ScrollView style={{ maxHeight: 210 }}>
            {options.map(opt => (
              <TouchableOpacity
                key={String(opt.value)}
                style={[s.dropItem, value === opt.value && s.dropItemAct]}
                onPress={() => { onChange(opt.value); setOpen(false); }}
              >
                <Text style={[s.dropTxt, value === opt.value && { color: colors.blue, fontWeight: '700' }]}>{opt.label}</Text>
                {value === opt.value && <Text style={{ color: colors.blue, fontSize: 12 }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const TABS = [
  { key: 'users',      label: 'المستخدمون',    icon: '👥' },
  { key: 'pos',        label: 'نقاط البيع',    icon: '🏪' },
  { key: 'categories', label: 'الفئات',        icon: '🏷️' },
  { key: 'network',    label: 'بيانات الشبكة', icon: '🌐' },
  { key: 'settings',   label: 'الإعدادات',    icon: '⚙️' },
  { key: 'about',      label: 'اتصل بنا',      icon: '📞' },
];

export default function AdminScreen({ navigation }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const [tab, setTab] = useState('users');

  return (
    <View style={s.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tabBar}
        contentContainerStyle={{ paddingHorizontal: spacing.sm, flexDirection: 'row' }}
      >
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabAct]} onPress={() => setTab(t.key)}>
            <Text style={{ fontSize: 16 }}>{t.icon}</Text>
            <Text style={[s.tabTxt, tab === t.key && s.tabTxtAct]}>{t.label}</Text>
            {tab === t.key && <View style={s.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === 'users'      && <UsersTab s={s} />}
      {tab === 'pos'        && <POSScreen navigation={navigation} />}
      {tab === 'categories' && <CategoriesTab s={s} />}
      {tab === 'network'    && <NetworkTab s={s} />}
      {tab === 'settings'   && <SettingsTab s={s} />}
      {tab === 'about'      && <AboutTab s={s} />}
    </View>
  );
}

// ── تبويب المستخدمين
function UsersTab({ s }) {
  const { colors, spacing } = useTheme();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]   = useState(null);
  const [form, setForm]       = useState({ name: '', username: '', password_hash: '', role: 'agent', phone: '' });
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('users').select('*').or('is_active.eq.true,is_active.is.null').order('name');
      if (error) console.error('Users Load Error:', error);
      setUsers(data || []);
    } catch(e) { console.error('Users Exception:', e); }
    setLoading(false);
  }, []);

  const handleDelete = (id) => {
    Alert.alert('حذف مستخدم', 'هل أنت متأكد من حذف هذا المستخدم؟\nلن يتم الحذف إذا كانت لديه مبيعات أو تحصيلات أو عهده ورق.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد الحذف', style: 'destructive', onPress: async () => {
        try {
          await softDeleteUser(id);
          await supabase.from('users').update({ active: 0 }).eq('id', id);
          Alert.alert('✅ تم', 'تم حذف المستخدم بنجاح');
          load();
        } catch(e) { Alert.alert('خطأ', e.message); }
      }}
    ]);
  };
  useEffect(() => { load(); }, [load]);

  const performSave = async () => {
    if (!form.name || !form.username) { Alert.alert('تنبيه', 'الاسم واسم الدخول مطلوبان'); return; }
    setSaving(true);
    try {
      if (editId) {
        const ud = { name: form.name, phone: form.phone, role: form.role };
        if (form.password_hash) ud.password_hash = form.password_hash;
        await supabase.from('users').update(ud).eq('id', editId);
        await updateUser(editId, ud);
      } else {
        if (!form.password_hash) { Alert.alert('تنبيه', 'كلمة المرور مطلوبة'); setSaving(false); return; }
        await supabase.from('users').insert({ ...form, is_active: true });
      }
      setForm({ name: '', username: '', password_hash: '', role: 'agent', phone: '' });
      setShowForm(false); setEditId(null); load();
    } catch (e) {}
    setSaving(false);
  };

  const startEdit = (u) => {
    setEditId(u.id);
    setForm({ name: u.name || '', username: u.username || '', password_hash: '', role: u.role || 'agent', phone: u.phone || '' });
    setShowForm(true);
  };

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', username: '', password_hash: '', role: 'agent', phone: '' }); }}>
        <Text style={{ fontSize: 16 }}>{showForm && !editId ? '✕' : '＋'}</Text>
        <Text style={s.addBtnTxt}>{showForm && !editId ? 'إلغاء الإضافة' : 'إضافة مستخدم جديد'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId ? '✏️ تعديل مستخدم' : '＋ مستخدم جديد'}</Text>
          <Input label="الاسم الكامل *"    value={form.name}          onChangeText={v => setForm({ ...form, name: v })}          placeholder="..." />
          {!editId && <Input label="اسم الدخول *" value={form.username}  onChangeText={v => setForm({ ...form, username: v })}      placeholder="مثال: ahmed1" />}
          <Input label={editId ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور *'} value={form.password_hash} onChangeText={v => setForm({ ...form, password_hash: v })} placeholder="..." />
          <Input label="رقم الجوال"         value={form.phone}         onChangeText={v => setForm({ ...form, phone: v })}          keyboardType="phone-pad" placeholder="07XXXXXXXX" />
          <Picker label="الدور" s={s} colors={colors}
            options={[{ value: 'admin', label: '👑 مدير عام' }, { value: 'cashier', label: '💼 محاسب' }, { value: 'agent', label: '🚗 مندوب' }]}
            value={form.role} onChange={v => setForm({ ...form, role: v })} />
          <Btn label={saving ? 'جاري الحفظ...' : editId ? '💾 حفظ التعديل' : '✅ حفظ'} variant="primary" onPress={() => Alert.alert('تأكيد', 'حفظ؟', [{text:'إلغاء'}, {text:'نعم', onPress: performSave}])} disabled={saving} />
        </View>
      )}

      {loading ? <Loading /> : users.map(u => {
        const roleInfo = ROLE_PERMISSIONS[u.role] || { label: u.role, color: colors.blue };
        const col = roleInfo.color;
        return (
          <View key={u.id} style={s.listCard}>
            <Row>
              <Avatar name={u.name} color={col} size={46} />
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={s.userName}>{u.name}</Text>
                <Text style={s.userMeta}>@{u.username} · {u.phone || '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <View style={[s.roleBadge, { backgroundColor: col + '18', borderColor: col + '40' }]}>
                  <Text style={[s.roleTxt, { color: col }]}>{roleInfo.label}</Text>
                </View>
                <Row style={{ gap: 10 }}>
                  <TouchableOpacity style={s.editLink} onPress={() => startEdit(u)}>
                    <Text style={s.editLinkTxt}>✏️ تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.editLink} onPress={() => handleDelete(u.id)}>
                    <Text style={[s.editLinkTxt, { color: colors.red }]}>🗑️ حذف</Text>
                  </TouchableOpacity>
                </Row>
              </View>
            </Row>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── تبويب الفئات والأسعار
function CategoriesTab({ s }) {
  const { colors, spacing } = useTheme();
  const [cats, setCats]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]   = useState(null);
  const [form, setForm]       = useState({ name: '', price: '' });
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('card_categories').select('*').or('is_active.eq.true,is_active.is.null').order('price');
      if (error) console.error('Cats Load Error:', error);
      setCats(data || []);
    } catch(e) { console.error('Cats Exception:', e); }
    setLoading(false);
  }, []);

  const handleDelete = (id) => {
    Alert.alert('حذف الفئة', 'سيتم حذف الفئة نهائياً من القائمة.\nلا يمكن الحذف إذا وجد لها دفعات أو محافظ مرتبطة.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد الحذف', style: 'destructive', onPress: async () => {
        try {
          await softDeleteCategory(id);
          await supabase.from('card_categories').update({ active: 0 }).eq('id', id);
          Alert.alert('✅ تم', 'تم حذف الفئة بنجاح');
          load();
        } catch(e) { Alert.alert('خطأ', e.message); }
      }}
    ]);
  };
  useEffect(() => { load(); }, [load]);

  const performSave = async () => {
    if (!form.name || !form.price) { Alert.alert('تنبيه', 'الاسم والسعر مطلوبان'); return; }
    setSaving(true);
    try {
      if (editId) {
        await supabase.from('card_categories').update({ name: form.name, price: parseFloat(form.price) }).eq('id', editId);
        await updateCategory(editId, { name: form.name, price: parseFloat(form.price) });
      } else {
        await supabase.from('card_categories').insert({ name: form.name, price: parseFloat(form.price), is_active: true });
      }
      setForm({ name: '', price: '' }); setShowForm(false); setEditId(null); load();
    } catch (e) {}
    setSaving(false);
  };

  const startEdit = (c) => { setEditId(c.id); setForm({ name: c.name, price: String(c.price) }); setShowForm(true); };
  const catColors = [colors.blue, colors.cyan, colors.purple, colors.green, colors.orange];

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', price: '' }); }}>
        <Text style={{ fontSize: 16 }}>{showForm && !editId ? '✕' : '＋'}</Text>
        <Text style={s.addBtnTxt}>{showForm && !editId ? 'إلغاء' : 'إضافة فئة جديدة'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId ? '✏️ تعديل الفئة' : '＋ فئة جديدة'}</Text>
          <Input label="اسم الفئة *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="مثال: كرت 5000 ر.ي" />
          <Input label="سعر الورقة (ر.ي) *" value={form.price} onChangeText={v => setForm({ ...form, price: v })} keyboardType="numeric" placeholder="5000" />
          <Btn label={saving ? 'جاري الحفظ...' : editId ? '💾 حفظ' : '✅ إضافة'} variant="primary" onPress={() => Alert.alert('تأكيد', 'حفظ؟', [{text:'إلغاء'}, {text:'نعم', onPress: performSave}])} disabled={saving} />
        </View>
      )}

      {loading ? <Loading /> : cats.map((c, idx) => {
        const col = catColors[idx % catColors.length];
        return (
          <View key={c.id} style={[s.listCard, { borderRightWidth: 4, borderRightColor: col }]}>
            <Row>
              <View style={[s.catIconBig, { backgroundColor: col + '18' }]}>
                <Text style={{ fontSize: 20 }}>🏷️</Text>
              </View>
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={s.userName}>{c.name}</Text>
                <Text style={[s.userMeta, { color: colors.green }]}>{formatCurrency(c.price)} / ورقة</Text>
              </View>
              <Row style={{ gap: spacing.sm }}>
                <TouchableOpacity onPress={() => startEdit(c)} style={s.iconBtn}>
                  <Text style={{ fontSize: 14 }}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(c.id)} style={[s.iconBtn, { borderColor: colors.red + '40' }]}>
                  <Text style={{ fontSize: 14 }}>🗑️</Text>
                </TouchableOpacity>
                <Badge status={c.active ? 'active' : 'cancelled'} label={c.active ? 'نشط' : 'موقف'} />
              </Row>
            </Row>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════
// 🌐 تبويب بيانات الشبكة
// ══════════════════════════════════════════════════
function NetworkTab({ s }) {
  const { colors, spacing, radius } = useTheme();
  const [form, setForm] = useState({ network_name: '', owner_name: '', phone1: '', phone2: '', logo_uri: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const network_name = await getSetting('network_name', '');
      const owner_name = await getSetting('network_owner', '');
      const phone1 = await getSetting('network_phone1', '');
      const phone2 = await getSetting('network_phone2', '');
      const logo_uri = await getSetting('network_logo', '');
      setForm({ network_name, owner_name, phone1, phone2, logo_uri });
      setLoading(false);
    })();
  }, []);

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]) {
      setForm({ ...form, logo_uri: res.assets[0].uri });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await saveSetting('network_name', form.network_name);
    await saveSetting('network_owner', form.owner_name);
    await saveSetting('network_phone1', form.phone1);
    await saveSetting('network_phone2', form.phone2);
    await saveSetting('network_logo', form.logo_uri);
    setSaving(false);
    Alert.alert('✅ تم', 'تم حفظ بيانات الشبكة بنجاح.\nسيتم استخدامها في كافة الفواتير والإيصالات.');
  };

  if (loading) return <Loading />;

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      <View style={s.settingsCard}>
        <View style={s.settingsCardHeader}>
          <Text style={{ fontSize: 20 }}>🌐</Text>
          <Text style={s.settingsCardTitle}>بيانات الشبكة / الشركة</Text>
        </View>
        <Text style={{ color: colors.t3, fontSize: 12, marginBottom: 15, lineHeight: 20 }}>
          هذه البيانات ستظهر في ترويسة الفواتير والإيصالات المطبوعة والمرسلة للعملاء تلقائياً.
        </Text>

        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity
            onPress={pickLogo}
            style={{
              width: 100, height: 100, borderRadius: 50,
              backgroundColor: colors.bg2, borderWidth: 2,
              borderStyle: 'dashed', borderColor: colors.blue + '60',
              justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
            }}
          >
            {form.logo_uri ? (
              <Image source={{ uri: form.logo_uri }} style={{ width: 100, height: 100, borderRadius: 50 }} />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 30 }}>📷</Text>
                <Text style={{ fontSize: 10, color: colors.t3, marginTop: 4 }}>رفع الشعار</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={{ fontSize: 11, color: colors.t3, marginTop: 8 }}>اضغط لرفع شعار الشبكة</Text>
        </View>

        <Input label="اسم الشبكة / الشركة *" value={form.network_name} onChangeText={v => setForm({ ...form, network_name: v })} placeholder="مثال: شبكة يمن نت" />
        <Input label="اسم مالك الشبكة" value={form.owner_name} onChangeText={v => setForm({ ...form, owner_name: v })} placeholder="الاسم الكامل" />
        <Input label="رقم الهاتف 1" value={form.phone1} onChangeText={v => setForm({ ...form, phone1: v })} keyboardType="phone-pad" placeholder="07XXXXXXXX" />
        <Input label="رقم الهاتف 2" value={form.phone2} onChangeText={v => setForm({ ...form, phone2: v })} keyboardType="phone-pad" placeholder="07XXXXXXXX (اختياري)" />
        <Btn label={saving ? 'جاري الحفظ...' : '💾 حفظ بيانات الشبكة'} variant="primary" onPress={handleSave} disabled={saving} style={{ marginTop: 15 }} />
      </View>

      <View style={[s.settingsCard, { marginTop: 15 }]}>
        <View style={s.settingsCardHeader}>
          <Text style={{ fontSize: 20 }}>👁️</Text>
          <Text style={s.settingsCardTitle}>معاينة ترويسة الفاتورة</Text>
        </View>
        <View style={{ backgroundColor: colors.bg2, padding: 15, borderRadius: radius.md, alignItems: 'center', marginTop: 10 }}>
          {form.logo_uri ? (
            <Image source={{ uri: form.logo_uri }} style={{ width: 50, height: 50, borderRadius: 25, marginBottom: 8 }} />
          ) : (
            <Text style={{ fontSize: 30, marginBottom: 5 }}>🧾</Text>
          )}
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.t1 }}>{form.network_name || 'اسم الشبكة'}</Text>
          <Text style={{ fontSize: 12, color: colors.t3, marginTop: 4 }}>{form.owner_name ? `مالك: ${form.owner_name}` : ''}</Text>
          <Text style={{ fontSize: 11, color: colors.t3, marginTop: 2 }}>{[form.phone1, form.phone2].filter(Boolean).join(' | ') || 'أرقام الهاتف'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ── تبويب الإعدادات
function SettingsTab({ s }) {
  const { user, logout } = useAuth();
  const { colors, spacing } = useTheme();
  const [overdue, setOverdue] = useState('20');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSetting('overdue_days', '20').then(setOverdue);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveSetting('overdue_days', overdue);
    setSaving(false);
    Alert.alert('✅ تم', 'تم حفظ الإعدادات بنجاح');
  };

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      <View style={s.settingsCard}>
        <View style={s.settingsCardHeader}><Text style={{ fontSize: 20 }}>⚙️</Text><Text style={s.settingsCardTitle}>إعدادات الفواتير</Text></View>
        <Input
          label="فترة اعتبار الفاتورة متأخرة (بالأيام) *"
          value={overdue}
          onChangeText={setOverdue}
          keyboardType="numeric"
          placeholder="مثال: 20"
        />
        <Btn label={saving ? 'جاري الحفظ...' : '💾 حفظ الإعدادات'} variant="primary" onPress={handleSave} disabled={saving} />
      </View>

      <View style={s.settingsCard}>
        <View style={s.settingsCardHeader}><Text style={{ fontSize: 20 }}>ℹ️</Text><Text style={s.settingsCardTitle}>معلومات النظام</Text></View>
        {[{ l: 'العملة', v: 'ريال يمني (ر.ي)' }, { l: 'الدولة', v: 'اليمن 🇾🇪' }, { l: 'الإصدار', v: '1.0.0' }].map((item, i) => (
          <Row key={i} style={[s.settingsRow, i < 2 && s.settingsRowBorder]}><Text style={s.settingsLabel}>{item.l}</Text><Text style={s.settingsValue}>{item.v}</Text></Row>
        ))}
      </View>

      <View style={s.settingsCard}>
        <View style={s.settingsCardHeader}><Text style={{ fontSize: 20 }}>👤</Text><Text style={s.settingsCardTitle}>المستخدم الحالي</Text></View>
        <Row style={[s.settingsRow, s.settingsRowBorder]}><Text style={s.settingsLabel}>الاسم</Text><Text style={s.settingsValue}>{user?.name}</Text></Row>
        <Row style={s.settingsRow}><Text style={s.settingsLabel}>الدور</Text><Text style={s.settingsValue}>{ROLE_PERMISSIONS[user?.role]?.label || user?.role}</Text></Row>
      </View>
      <View style={s.settingsCard}>
        <View style={s.settingsCardHeader}><Text style={{ fontSize: 20 }}>💾</Text><Text style={s.settingsCardTitle}>إدارة البيانات والنسخ الاحتياطي</Text></View>
        <Text style={{ fontSize: 13, color: colors.t3, marginBottom: spacing.md, lineHeight: 20 }}>
          هذه الأدوات مخصصة لتصدير أو استيراد أو تصفير حركة البيانات (المخزون والعمليات المالية) بالكامل.
        </Text>
        
        <Btn label={saving ? 'جاري التصدير...' : '📤 تصدير نسخة احتياطية كاملة'} 
          variant="primary" 
          onPress={async () => {
             setSaving(true);
             const res = await exportTransactionsBackup();
             setSaving(false);
             if (res.success) {
                Alert.alert('✅ تم', 'تم تصدير النسخة الاحتياطية بنجاح.');
             } else if (!res.canceled) {
                Alert.alert('خطأ', res.error || 'فشل التصدير');
             }
          }} 
          disabled={saving} 
          style={{ marginBottom: spacing.sm, backgroundColor: colors.green }} 
        />

        <Btn label={saving ? 'جاري الاستيراد...' : '📥 استيراد ومزامنة نسخة احتياطية'} 
          variant="primary" 
          onPress={() => {
            Alert.alert('تحذير خطير!', 'استيراد نسخة احتياطية سيؤدي لمعالجة كافة البيانات السحابية (Supabase) والمحلية (الفواتير، المحافظ، التحصيلات) وقد يسبب الحذف! هل أنت متأكد؟', [
              { text: 'إلغاء', style: 'cancel' },
              { text: 'نعم، استيراد', style: 'destructive', onPress: async () => {
                 setSaving(true);
                 const res = await importTransactionsBackup();
                 setSaving(false);
                 if (res.success) {
                    Alert.alert('✅ نجاح بالغ!', 'تم استيراد النسخة ومزامنتها مع الخادم بنجاح.');
                 } else if (!res.canceled) {
                    Alert.alert('خطأ', res.error || 'فشل الاستيراد');
                 }
              }}
            ]);
          }} 
          disabled={saving} 
          style={{ marginBottom: spacing.md, backgroundColor: colors.blue }} 
        />

        <View style={{ height: 1, backgroundColor: colors.border2, marginVertical: spacing.md }} />
        
        <Btn label={saving ? 'جاري التفريغ...' : '⚠️ تصفير قاعدة بيانات المخزون والمالية'} 
          variant="danger" 
          onPress={() => {
            Alert.alert('محو كلي! ⛔', 'هذا الإجراء سيقوم بحذف جميع الفواتير، المحافظ، التحصيلات، والتوريدات من جهازك ومن السيرفر بشكل دائم. هل أنت متأكد مليون بالمئة؟', [
              { text: 'رجوع', style: 'cancel' },
              { text: 'نعم، مسح البيانات!', style: 'destructive', onPress: async () => {
                 setSaving(true);
                 const res = await wipeTransactionsData();
                 setSaving(false);
                 if (res.success) {
                    Alert.alert('✅ تم', 'تم محو البيانات من النظام بالكامل.');
                 } else {
                    Alert.alert('خطأ', res.error || 'فشل المسح');
                 }
              }}
            ]);
          }} 
          disabled={saving} 
        />
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={logout}><Text style={s.logoutTxt}>🚪 تسجيل الخروج</Text></TouchableOpacity>
    </ScrollView>
  );
}

// ── تبويب اتصل بنا
function AboutTab({ s }) {
  const { colors, spacing, radius } = useTheme();
  const handleLink = (url) => Linking.openURL(url).catch(() => Alert.alert('خطأ', 'لا يمكن فتح الرابط'));

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
       <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 30 }}>
         <View style={{ width: 100, height: 100, backgroundColor: colors.blue, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
           <Text style={{ fontSize: 50 }}>📱</Text>
         </View>
         <Text style={{ fontSize: 24, fontWeight: '900', color: colors.t1 }}>ISPCards V 3.0</Text>
         <Text style={{ fontSize: 14, color: colors.t3, marginTop: 5 }}>نظام إدارة شبكات الميكروتيك المتفوق</Text>
       </View>

       <View style={s.settingsCard}>
         <View style={s.settingsCardHeader}><Text style={{ fontSize: 20 }}>🛡️</Text><Text style={s.settingsCardTitle}>الدعم الفني والبرمجة</Text></View>
         <Text style={{ color: colors.t2, fontSize: 13, lineHeight: 22, marginBottom: 20 }}>
           تم تطوير هذا النظام بأحدث التقنيات لخدمة أصحاب الشبكات وتسهيل عمليات البيع والتحصيل والجرد المالي بدقة عالية.
         </Text>
         
         <Btn label="💬 تواصل عبر واتساب" variant="success" 
           onPress={() => handleLink('whatsapp://send?phone=967770000000')} 
           style={{ marginBottom: 10 }} />
           
         <Btn label="🌐 زيارة موقعنا" variant="outline" 
           onPress={() => handleLink('https://example.com')} 
           style={{ marginBottom: 10 }} />
       </View>

       <View style={{ marginTop: 20, alignItems: 'center' }}>
         <Text style={{ fontSize: 12, color: colors.t3 }}>جميع الحقوق محفوظة © 2026</Text>
       </View>
    </ScrollView>
  );
}
