import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, Image, Linking
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme';
import {
  getLocalUsers, getLocalCategories,
  createLocalUser, createLocalCategory,
  updateCategory, updateUser, execSQL, getSetting, saveSetting,
  softDeleteCategory, softDeleteUser,
  exportTransactionsBackup, importTransactionsBackup, wipeTransactionsData,
  getProjectInfo, updateProjectInfo, getAllPhases, getActivePhase,
  createPhase, closePhase, updatePhase, getPhaseStats, canCreateNewPhase, resumePhase
} from '../services/database';
import { useAuth, ROLE_PERMISSIONS } from '../services/AuthContext';
import { formatCurrency } from '../utils/helpers';
import { Btn, Loading, Badge, Row, Input, Avatar } from '../components/UI';
import { Feather } from '@expo/vector-icons';
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
  { key: 'phases',     label: 'المراحل',       icon: 'layers' },
  { key: 'users',      label: 'المستخدمون',    icon: 'users' },
  { key: 'categories', label: 'الفئات',        icon: 'tag' },
  { key: 'network',    label: 'بيانات الشبكة', icon: 'globe' },
  { key: 'settings',   label: 'الإعدادات',    icon: 'settings' },
];

export default function AdminScreen({ navigation }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const [tab, setTab] = useState('phases');

  return (
    <View style={s.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tabBar}
        contentContainerStyle={{ paddingHorizontal: spacing.sm, flexDirection: 'row' }}
      >
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabAct]} onPress={() => setTab(t.key)}>
            <Feather name={t.icon} size={16} color={tab === t.key ? colors.primary : colors.t3} />
            <Text style={[s.tabTxt, tab === t.key && s.tabTxtAct]}>{t.label}</Text>
            {tab === t.key && <View style={s.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === 'phases'     && <PhasesTab s={s} />}
      {tab === 'users'      && <UsersTab s={s} />}
      {tab === 'categories' && <CategoriesTab s={s} />}
      {tab === 'network'    && <NetworkTab s={s} />}
      {tab === 'settings'   && <SettingsTab s={s} />}
    </View>
  );
}

// ── تبويب المراحل وبيانات المشروع
function PhasesTab({ s }) {
  const { user, projectId } = useAuth();
  const { colors, spacing, radius } = useTheme();
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [activePhase, setActivePhase] = useState(null);
  const [stats, setStats] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '', target_new_pos: '', expected_total_sales: '', expected_total_collections: '' });

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const [ph, active, cc] = await Promise.all([getAllPhases(projectId), getActivePhase(projectId), canCreateNewPhase(projectId)]);
      setPhases(ph || []);
      setActivePhase(active);
      setCanCreate(cc);
      if (active) { const st = await getPhaseStats(active.id); setStats(st); }
      else setStats(null);
    } catch (e) { console.log('PhasesTab error:', e); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);



  const handleCreatePhase = async () => {
    if (!form.name.trim()) { Alert.alert('تنبيه', 'اسم المرحلة مطلوب'); return; }
    setSaving(true);
    try {
      await createPhase({ ...form, project_id: projectId, target_new_pos: Number(form.target_new_pos || 0), expected_total_sales: Number(form.expected_total_sales || 0), expected_total_collections: Number(form.expected_total_collections || 0) }, user?.id);
      Alert.alert('✅', 'تم إنشاء المرحلة الجديدة بنجاح');
      setShowForm(false); setForm({ name: '', description: '', start_date: '', end_date: '', target_new_pos: '', expected_total_sales: '', expected_total_collections: '' });
      load();
    } catch (e) { Alert.alert('خطأ', e.message); }
    setSaving(false);
  };

  const handleClose = (phaseId, phaseName) => {
    Alert.alert('إغلاق المرحلة', `هل تريد إغلاق "${phaseName}"?\n\nعند إنشاء مرحلة جديدة سيتم نقل الفواتير المعلقة تلقائياً.`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إغلاق', style: 'destructive', onPress: async () => {
        try { await closePhase(phaseId); Alert.alert('✅', 'تم إغلاق المرحلة'); load(); }
        catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  const handleResume = (phaseId, phaseName) => {
    Alert.alert('استئناف المرحلة', `هل تريد استئناف "${phaseName}" وإعادة تفعيلها؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'استئناف', style: 'default', onPress: async () => {
        try { await resumePhase(phaseId); Alert.alert('✅', 'تم استئناف المرحلة بنجاح'); load(); }
        catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  const fc = n => Number(n || 0).toLocaleString();
  const pct = (actual, target) => target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const statusColors = { active: colors.success || '#16a34a', closed: colors.t3 || '#64748b', planning: colors.warning || '#d97706' };
  const statusLabels = { active: 'نشطة', closed: 'مغلقة', planning: 'تخطيط' };

  if (loading) return <Loading />;

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>



      {/* المرحلة النشطة + إحصائيات */}
      {activePhase && stats && (
        <View style={[s.settingsCard, { marginBottom: spacing.md, borderRightWidth: 4, borderRightColor: colors.success || '#16a34a' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success || '#16a34a' }} />
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.t1, flex: 1 }}>{activePhase.name}</Text>
            <TouchableOpacity onPress={() => handleClose(activePhase.id, activePhase.name)} style={{ backgroundColor: (colors.danger || '#dc2626') + '15', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.danger || '#dc2626' }}>إغلاق المرحلة</Text>
            </TouchableOpacity>
          </View>
          {activePhase.description ? <Text style={{ color: colors.t3, fontSize: 12, marginBottom: 8 }}>{activePhase.description}</Text> : null}
          <Text style={{ color: colors.t3, fontSize: 11, marginBottom: 12 }}>{activePhase.start_date || '—'} → {activePhase.end_date || 'مفتوحة'}</Text>

          {/* بطاقات الأهداف */}
          {[
            { label: 'المبيعات', actual: stats.sales.total, target: Number(activePhase.expected_total_sales || 0), color: colors.primary, icon: 'trending-up' },
            { label: 'التحصيلات المعتمدة', actual: stats.collections.total, target: Number(activePhase.expected_total_collections || 0), color: colors.success || '#16a34a', icon: 'dollar-sign' },
            { label: 'نقاط البيع الجديدة', actual: stats.newPOSCount, target: Number(activePhase.target_new_pos || 0), color: colors.purple || '#7c3aed', icon: 'map-pin', isCnt: true },
          ].map((item, idx) => {
            const p = pct(item.actual, item.target);
            const barColor = p >= 80 ? (colors.success || '#16a34a') : p >= 50 ? (colors.warning || '#d97706') : (colors.danger || '#dc2626');
            return (
              <View key={idx} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name={item.icon} size={13} color={item.color} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.t2 }}>{item.label}</Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: barColor }}>{p}%</Text>
                </View>
                <View style={{ height: 6, backgroundColor: colors.bg2, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.max(p, 2)}%`, height: 6, backgroundColor: barColor, borderRadius: 3 }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                  <Text style={{ fontSize: 10, color: colors.t3 }}>الفعلي: {item.isCnt ? item.actual : fc(item.actual)}</Text>
                  <Text style={{ fontSize: 10, color: colors.t3 }}>المستهدف: {item.isCnt ? item.target : fc(item.target)}</Text>
                </View>
              </View>
            );
          })}

          {/* ملخص سريع */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {[
              { l: 'فواتير', v: stats.sales.count, c: colors.primary },
              { l: 'معلقة', v: stats.pending.count, c: colors.warning || '#d97706' },
              { l: 'كفاءة', v: `${stats.collectionEfficiency}%`, c: stats.collectionEfficiency >= 80 ? (colors.success || '#16a34a') : (colors.danger || '#dc2626') },
            ].map((m, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: m.c + '10', borderRadius: 8, padding: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: m.c }}>{m.v}</Text>
                <Text style={{ fontSize: 9, color: colors.t3, fontWeight: '600' }}>{m.l}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* زر إنشاء مرحلة جديدة */}
      {canCreate && (
        <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(!showForm)}>
          <Feather name={showForm ? 'x' : 'plus'} size={18} color={colors.primary} />
          <Text style={s.addBtnTxt}>{showForm ? 'إلغاء' : 'إنشاء مرحلة جديدة'}</Text>
        </TouchableOpacity>
      )}
      {!canCreate && activePhase && (
        <View style={{ backgroundColor: (colors.warning || '#d97706') + '12', borderRadius: 10, padding: 12, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="info" size={14} color={colors.warning || '#d97706'} />
          <Text style={{ color: colors.warning || '#d97706', fontSize: 12, fontWeight: '600', flex: 1 }}>أغلق المرحلة الحالية أولاً لإنشاء مرحلة جديدة</Text>
        </View>
      )}

      {showForm && (
        <View style={[s.formCard, { marginBottom: spacing.md }]}>
          <Text style={s.formTitle}>مرحلة جديدة</Text>
          <Input label="اسم المرحلة *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="مثال: المرحلة الثانية" />
          <Input label="وصف المرحلة" value={form.description} onChangeText={v => setForm({ ...form, description: v })} placeholder="اختياري" />
          <Input label="تاريخ البداية (YYYY-MM-DD)" value={form.start_date} onChangeText={v => setForm({ ...form, start_date: v })} placeholder={new Date().toISOString().slice(0, 10)} />
          <Input label="تاريخ النهاية (YYYY-MM-DD)" value={form.end_date} onChangeText={v => setForm({ ...form, end_date: v })} placeholder="اختياري" />
          <Input label="العدد المستهدف لنقاط البيع الجديدة" value={form.target_new_pos} onChangeText={v => setForm({ ...form, target_new_pos: v })} keyboardType="numeric" />
          <Input label="إجمالي المبيعات المتوقع" value={form.expected_total_sales} onChangeText={v => setForm({ ...form, expected_total_sales: v })} keyboardType="numeric" />
          <Input label="إجمالي التحصيلات المتوقع" value={form.expected_total_collections} onChangeText={v => setForm({ ...form, expected_total_collections: v })} keyboardType="numeric" />
          <Btn label={saving ? 'جاري الإنشاء...' : 'إنشاء وتفعيل المرحلة'} icon="check" variant="primary" onPress={() => Alert.alert('تأكيد', 'سيتم إنشاء المرحلة وتفعيلها. الفواتير المعلقة سيتم نقلها تلقائياً.', [{ text: 'إلغاء' }, { text: 'نعم', onPress: handleCreatePhase }])} disabled={saving} />
        </View>
      )}

      {/* قائمة المراحل */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md, marginTop: spacing.sm }}>
        <Feather name="layers" size={18} color={colors.t2} />
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.t1 }}>جميع المراحل ({phases.length})</Text>
      </View>
      {phases.map((ph, idx) => {
        const stColor = statusColors[ph.status] || colors.t3;
        const stLabel = statusLabels[ph.status] || ph.status;
        const isLatest = idx === 0;
        return (
          <View key={ph.id} style={[s.listCard, { borderRightWidth: 4, borderRightColor: stColor }]}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={[s.userName, { fontSize: 15 }]}>{ph.name}</Text>
                <Text style={s.userMeta}>{ph.start_date || '—'} → {ph.end_date || 'مفتوحة'}</Text>
                {ph.description ? <Text style={{ fontSize: 11, color: colors.t3, marginTop: 2 }}>{ph.description}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[s.roleBadge, { backgroundColor: stColor + '18', borderColor: stColor + '40' }]}>
                  <Text style={[s.roleTxt, { color: stColor }]}>{stLabel}</Text>
                </View>
                {ph.status === 'active' && (
                  <Text style={{ fontSize: 10, color: colors.success || '#16a34a', fontWeight: '700' }}>● نشطة حالياً</Text>
                )}
                {ph.status === 'closed' && isLatest && (
                  <TouchableOpacity onPress={() => handleResume(ph.id, ph.name)} style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>استئناف المرحلة</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Row>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── تبويب المستخدمين
function UsersTab({ s }) {
  const { projectId } = useAuth();
  const { colors, spacing } = useTheme();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]   = useState(null);
  const [form, setForm]       = useState({ name: '', username: '', password_hash: '', role: 'agent', phone: '' });
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await getLocalUsers(projectId);
      setUsers((data || []).filter(u => u.active !== 0));
    } catch(e) { console.error('Users Exception:', e); }
    setLoading(false);
  }, [projectId]);

  const handleDelete = (id) => {
    Alert.alert('حذف مستخدم', 'هل أنت متأكد من حذف هذا المستخدم؟\nلن يتم الحذف إذا كانت لديه مبيعات أو تحصيلات أو عهده ورق.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد الحذف', style: 'destructive', onPress: async () => {
        try {
          await softDeleteUser(id);
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
        await updateUser(editId, ud);
      } else {
        if (!form.password_hash) { Alert.alert('تنبيه', 'كلمة المرور مطلوبة'); setSaving(false); return; }
        await createLocalUser({ ...form, active: 1, project_id: projectId });
      }
      setForm({ name: '', username: '', password_hash: '', role: 'agent', phone: '' });
      setShowForm(false); setEditId(null); load();
    } catch (e) {
      console.log('USER SAVE ERROR:', e);
    }
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
        <Feather name={showForm && !editId ? 'x' : 'plus'} size={18} color={colors.primary} />
        <Text style={s.addBtnTxt}>{showForm && !editId ? 'إلغاء الإضافة' : 'إضافة مستخدم جديد'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId ? 'تعديل مستخدم' : 'مستخدم جديد'}</Text>
          <Input label="الاسم الكامل *"    value={form.name}          onChangeText={v => setForm({ ...form, name: v })}          placeholder="..." />
          {!editId && <Input label="اسم الدخول *" value={form.username}  onChangeText={v => setForm({ ...form, username: v })}      placeholder="مثال: ahmed1" />}
          <Input label={editId ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور *'} value={form.password_hash} onChangeText={v => setForm({ ...form, password_hash: v })} placeholder="..." />
          <Input label="رقم الجوال"         value={form.phone}         onChangeText={v => setForm({ ...form, phone: v })}          keyboardType="phone-pad" placeholder="07XXXXXXXX" />
          <Picker label="الدور" s={s} colors={colors}
            options={[{ value: 'admin', label: 'مدير عام' }, { value: 'cashier', label: 'محاسب' }, { value: 'agent', label: 'مندوب' }]}
            value={form.role} onChange={v => setForm({ ...form, role: v })} />
          <Btn label={saving ? 'جاري الحفظ...' : editId ? 'حفظ التعديل' : 'حفظ'} icon={saving ? undefined : editId ? "save" : "check"} variant="primary" onPress={() => Alert.alert('تأكيد', 'حفظ؟', [{text:'إلغاء'}, {text:'نعم', onPress: performSave}])} disabled={saving} />
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
                    <Text style={s.editLinkTxt}>تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.editLink} onPress={() => handleDelete(u.id)}>
                    <Text style={[s.editLinkTxt, { color: colors.red }]}>حذف</Text>
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
  const { projectId } = useAuth();
  const { colors, spacing } = useTheme();
  const [cats, setCats]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]   = useState(null);
  const [form, setForm]       = useState({ name: '', price: '' });
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await getLocalCategories(projectId);
      setCats((data || []).filter(c => c.active !== 0));
    } catch(e) { console.error('Cats Exception:', e); }
    setLoading(false);
  }, [projectId]);

  const handleDelete = (id) => {
    Alert.alert('حذف الفئة', 'سيتم حذف الفئة نهائياً من القائمة.\nلا يمكن الحذف إذا وجد لها دفعات أو محافظ مرتبطة.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد الحذف', style: 'destructive', onPress: async () => {
        try {
          await softDeleteCategory(id);
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
        await updateCategory(editId, { name: form.name, price: parseFloat(form.price) });
      } else {
        await createLocalCategory({ name: form.name, price: parseFloat(form.price), project_id: projectId });
      }
      setForm({ name: '', price: '' }); setShowForm(false); setEditId(null); load();
    } catch (e) {
      console.log('CAT SAVE ERROR:', e);
    }
    setSaving(false);
  };

  const startEdit = (c) => { setEditId(c.id); setForm({ name: c.name, price: String(c.price) }); setShowForm(true); };
  const catColors = [colors.blue, colors.cyan, colors.purple, colors.green, colors.orange];

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', price: '' }); }}>
        <Feather name={showForm && !editId ? 'x' : 'plus'} size={18} color={colors.primary} />
        <Text style={s.addBtnTxt}>{showForm && !editId ? 'إلغاء' : 'إضافة فئة جديدة'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId ? 'تعديل الفئة' : 'فئة جديدة'}</Text>
          <Input label="اسم الفئة *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="مثال: كرت 5000 ر.ي" />
          <Input label="سعر الورقة (ر.ي) *" value={form.price} onChangeText={v => setForm({ ...form, price: v })} keyboardType="numeric" placeholder="5000" />
          <Btn label={saving ? 'جاري الحفظ...' : editId ? 'حفظ' : 'إضافة'} icon={saving ? undefined : editId ? "save" : "check"} variant="primary" onPress={() => Alert.alert('تأكيد', 'حفظ؟', [{text:'إلغاء'}, {text:'نعم', onPress: performSave}])} disabled={saving} />
        </View>
      )}

      {loading ? <Loading /> : cats.map((c, idx) => {
        const col = catColors[idx % catColors.length];
        return (
          <View key={c.id} style={[s.listCard, { borderRightWidth: 4, borderRightColor: col }]}>
            <Row>
              <View style={[s.catIconBig, { backgroundColor: col + '18' }]}>
                <Feather name="tag" size={20} color={col} />
              </View>
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={s.userName}>{c.name}</Text>
                <Text style={[s.userMeta, { color: colors.green }]}>{formatCurrency(c.price)} / ورقة</Text>
              </View>
              <Row style={{ gap: spacing.sm }}>
                <TouchableOpacity onPress={() => startEdit(c)} style={s.iconBtn}>
                  <Feather name="edit-2" size={14} color={col} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(c.id)} style={[s.iconBtn, { borderColor: colors.red + '40' }]}>
                  <Feather name="trash-2" size={14} color={colors.red} />
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
          <Feather name="globe" size={20} color={colors.primary} />
          <Text style={[s.settingsCardTitle, {marginLeft: 8}]}>بيانات الشبكة / الشركة</Text>
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
                <Feather name="camera" size={28} color={colors.t3} />
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
        <Btn label={saving ? 'جاري الحفظ...' : 'حفظ بيانات الشبكة'} icon={saving ? undefined : "save"} variant="primary" onPress={handleSave} disabled={saving} style={{ marginTop: 15 }} />
      </View>

      <View style={[s.settingsCard, { marginTop: 15 }]}>
        <View style={s.settingsCardHeader}>
          <Feather name="eye" size={20} color={colors.primary} />
          <Text style={[s.settingsCardTitle, {marginLeft: 8}]}>معاينة ترويسة الفاتورة</Text>
        </View>
        <View style={{ backgroundColor: colors.bg2, padding: 15, borderRadius: radius.md, alignItems: 'center', marginTop: 10 }}>
          {form.logo_uri ? (
            <Image source={{ uri: form.logo_uri }} style={{ width: 50, height: 50, borderRadius: 25, marginBottom: 8 }} />
          ) : (
            <Feather name="file-text" size={30} color={colors.t3} style={{ marginBottom: 5 }} />
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
        <View style={s.settingsCardHeader}><Feather name="settings" size={20} color={colors.primary} /><Text style={[s.settingsCardTitle, {marginLeft: 8}]}>إعدادات الفواتير</Text></View>
        <Input
          label="فترة اعتبار الفاتورة متأخرة (بالأيام) *"
          value={overdue}
          onChangeText={setOverdue}
          keyboardType="numeric"
          placeholder="مثال: 20"
        />
        <Btn label={saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'} icon="save" variant="primary" onPress={handleSave} disabled={saving} />
      </View>

      <View style={s.settingsCard}>
        <View style={s.settingsCardHeader}><Feather name="info" size={20} color={colors.primary} /><Text style={[s.settingsCardTitle, {marginLeft: 8}]}>معلومات النظام</Text></View>
        {[{ l: 'العملة', v: 'ريال يمني (ر.ي)' }, { l: 'الدولة', v: 'اليمن 🇾🇪' }, { l: 'الإصدار', v: '1.0.0' }].map((item, i) => (
          <Row key={i} style={[s.settingsRow, i < 2 && s.settingsRowBorder]}><Text style={s.settingsLabel}>{item.l}</Text><Text style={s.settingsValue}>{item.v}</Text></Row>
        ))}
      </View>

      <View style={s.settingsCard}>
        <View style={s.settingsCardHeader}><Feather name="user" size={20} color={colors.primary} /><Text style={[s.settingsCardTitle, {marginLeft: 8}]}>المستخدم الحالي</Text></View>
        <Row style={[s.settingsRow, s.settingsRowBorder]}><Text style={s.settingsLabel}>الاسم</Text><Text style={s.settingsValue}>{user?.name}</Text></Row>
        <Row style={s.settingsRow}><Text style={s.settingsLabel}>الدور</Text><Text style={s.settingsValue}>{ROLE_PERMISSIONS[user?.role]?.label || user?.role}</Text></Row>
      </View>
      <View style={s.settingsCard}>
        <View style={s.settingsCardHeader}><Feather name="database" size={20} color={colors.primary} /><Text style={[s.settingsCardTitle, {marginLeft: 8}]}>إدارة البيانات والنسخ الاحتياطي</Text></View>
        <Text style={{ fontSize: 13, color: colors.t3, marginBottom: spacing.md, lineHeight: 20 }}>
          هذه الأدوات مخصصة لتصدير أو استيراد أو تصفير حركة البيانات (المخزون والعمليات المالية) بالكامل.
        </Text>
        
        <Btn label={saving ? 'جاري التصدير...' : 'تصدير نسخة احتياطية كاملة'} 
          icon="upload-cloud"
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

        <Btn label={saving ? 'جاري الاستيراد...' : 'استيراد ومزامنة نسخة احتياطية'} 
          icon="download-cloud"
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
        
        <Btn label={saving ? 'جاري التفريغ...' : 'تصفير قاعدة بيانات المخزون والمالية'} 
          icon="alert-triangle"
          variant="danger" 
          onPress={async () => {
            try {
              const unsyncedR = await execSQL(`SELECT COUNT(*) as cnt FROM sync_queue WHERE table_name IN ('invoices', 'invoice_items')`);
              const unsyncedCount = unsyncedR.rows._array[0]?.cnt || 0;
              if (unsyncedCount > 0) {
                Alert.alert(
                  'حظر تصفير البيانات',
                  'لا يمكن تصفير البيانات لوجود فواتير أو بنود غير مرفوعة في طابور المزامنة. يرجى المزامنة أولاً لمنع فقدان البيانات.',
                  [{ text: 'حسنًا' }]
                );
                return;
              }
            } catch (e) {
              console.error(e);
            }
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

      <TouchableOpacity style={s.logoutBtn} onPress={async () => {
        try {
          const unsyncedR = await execSQL(`SELECT COUNT(*) as cnt FROM sync_queue WHERE table_name IN ('invoices', 'invoice_items')`);
          const unsyncedCount = unsyncedR.rows._array[0]?.cnt || 0;
          if (unsyncedCount > 0) {
            Alert.alert(
              'حظر تسجيل الخروج',
              'لا يمكن تسجيل الخروج لوجود فواتير أو بنود غير مرفوعة في طابور المزامنة. يرجى مزامنتها أولاً لمنع فقدان البيانات.',
              [{ text: 'حسنًا' }]
            );
            return;
          }
        } catch (e) {
          console.error(e);
        }
        Alert.alert('تسجيل الخروج', 'هل تريد الخروج؟', [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'الخروج', style: 'destructive', onPress: logout },
        ]);
      }}>
        <Feather name="log-out" size={16} color={colors.danger} />
        <Text style={[s.logoutTxt, {marginLeft: 8}]}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
