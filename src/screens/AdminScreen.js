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
import ProjectMembershipsTab from './admin/ProjectMembershipsTab';

// ── Premium Picker
function Picker({ label, options, value, onChange, placeholder, s, colors, disabled = false }) {
  const [open, setOpen] = useState(false);
  const safeOptions = (Array.isArray(options) ? options : [])
    .filter(option => option && option.value !== null && option.value !== undefined)
    .map(option => ({ value: String(option.value), label: String(option.label || 'غير محدد') }));
  const safeValue = value === null || value === undefined ? '' : String(value);
  const selected = safeOptions.find(option => option.value === safeValue);
  return (
    <View style={{ marginBottom: 12 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <TouchableOpacity style={[s.picker, open && s.pickerOpen, disabled && { opacity: 0.55 }]} onPress={() => !disabled && setOpen(!open)} disabled={disabled} activeOpacity={0.8}>
        <Text style={[s.pickerTxt, !selected && { color: colors.t3 }]}>{selected ? selected.label : placeholder || 'اختر...'}</Text>
        <Text style={{ color: open ? colors.blue : colors.t3, fontSize: 12 }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.dropdown}>
          <ScrollView style={{ maxHeight: 210 }}>
            {safeOptions.map(opt => (
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
  { key: 'memberships', label: 'إدارة مستخدمي المشروع', icon: 'users' },
  { key: 'users',      label: 'المستخدمون',    icon: 'users' },
  { key: 'categories', label: 'الفئات',        icon: 'tag' },
  { key: 'network',    label: 'بيانات الشبكة', icon: 'globe' },
  { key: 'settings',   label: 'الإعدادات',    icon: 'settings' },
];

export default function AdminScreen({ navigation }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const { user } = useAuth();
  const [tab, setTab] = useState('phases');

  if (user?.role !== 'admin') {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: spacing.lg }]}>
        <Text style={{ color: colors.danger, fontWeight: '800', textAlign: 'center' }}>
          لا تملك صلاحية الوصول إلى إدارة مستخدمي المشروع.
        </Text>
      </View>
    );
  }

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

      {tab === 'phases'     && <PhasesTab s={s} navigation={navigation} />}
      {tab === 'memberships' && <ProjectMembershipsTab s={s} />}
      {tab === 'users'      && <UsersTab s={s} />}
      {tab === 'categories' && <CategoriesTab s={s} />}
      {tab === 'network'    && <NetworkTab s={s} />}
      {tab === 'settings'   && <SettingsTab s={s} />}
    </View>
  );
}

// ── تبويب المراحل وبيانات المشروع
function PhasesTab({ s, navigation }) {
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
          <TouchableOpacity
            onPress={() => navigation.navigate('PhaseReport', { phaseId: activePhase.id, phaseName: activePhase.name })}
            style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>تقرير المرحلة</Text>
          </TouchableOpacity>
        </View>
      )}
      {canCreate && (
        <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(!showForm)}>
          <Feather name={showForm ? 'x' : 'plus'} size={18} color={colors.primary} />
          <Text style={s.addBtnTxt}>{showForm ? 'إلغاء' : 'إنشاء مرحلة جديدة'}</Text>
        </TouchableOpacity>
      )}
      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>مرحلة جديدة</Text>
          <Input label="اسم المرحلة *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="مثال: المرحلة الثانية" />
          <Input label="الوصف" value={form.description} onChangeText={v => setForm({ ...form, description: v })} placeholder="وصف اختياري" multiline />
          <Input label="تاريخ البداية" value={form.start_date} onChangeText={v => setForm({ ...form, start_date: v })} placeholder="YYYY-MM-DD" />
          <Input label="تاريخ النهاية المتوقع" value={form.end_date} onChangeText={v => setForm({ ...form, end_date: v })} placeholder="YYYY-MM-DD" />
          <Input label="الهدف - نقاط بيع جديدة" value={form.target_new_pos} onChangeText={v => setForm({ ...form, target_new_pos: v })} keyboardType="numeric" placeholder="0" />
          <Input label="الهدف - إجمالي المبيعات" value={form.expected_total_sales} onChangeText={v => setForm({ ...form, expected_total_sales: v })} keyboardType="numeric" placeholder="0" />
          <Input label="الهدف - إجمالي التحصيلات" value={form.expected_total_collections} onChangeText={v => setForm({ ...form, expected_total_collections: v })} keyboardType="numeric" placeholder="0" />
          <Btn label={saving ? 'جاري الإنشاء...' : 'إنشاء المرحلة'} icon="plus" variant="primary" onPress={handleCreatePhase} disabled={saving} />
        </View>
      )}
      {phases.map((ph, idx) => {
        const isLatest = idx === 0;
        return (
          <View key={ph.id} style={s.listCard}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={s.userName}>{ph.name}</Text>
                <Text style={s.userMeta}>{ph.start_date || '—'} → {ph.end_date || 'مفتوحة'}</Text>
                {ph.description ? <Text style={s.userMeta}>{ph.description}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Badge status={ph.status === 'active' ? 'active' : 'cancelled'} label={statusLabels[ph.status] || ph.status} />
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
        await updateUser(editId, ud, projectId);
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
          <Input label="الاسم الكامل *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="..." />
          {!editId && <Input label="اسم الدخول *" value={form.username} onChangeText={v => setForm({ ...form, username: v })} placeholder="مثال: ahmed1" />}
          <Input label={editId ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور *'} value={form.password_hash} onChangeText={v => setForm({ ...form, password_hash: v })} placeholder="..." />
          <Input label="رقم الجوال" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" placeholder="07XXXXXXXX" />
          <Picker label="الدور" s={s} colors={colors}
            options={[{ value: 'admin', label: 'مدير عام' }, { value: 'cashier', label: 'محاسب' }, { value: 'agent', label: 'مندوب' }]}
            value={form.role} onChange={v => setForm({ ...form, role: v })} />
          <Btn label={saving ? 'جاري الحفظ...' : editId ? 'حفظ التعديل' : 'حفظ'} icon={saving ? undefined : editId ? 'save' : 'check'} variant="primary" onPress={() => Alert.alert('تأكيد', 'حفظ؟', [{text:'إلغاء'}, {text:'نعم', onPress: performSave}])} disabled={saving} />
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

function CategoriesTab({ s }) {
  const { projectId } = useAuth();
  const { colors, spacing } = useTheme();
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', price: '', card_value: '', cards_per_sheet: '1' });
  const [saving, setSaving] = useState(false);

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
    const cardsPerSheet = Math.max(1, parseInt(form.cards_per_sheet || '1', 10) || 1);
    const cardValue = Math.max(0, parseFloat(form.card_value || form.price || '0') || 0);
    setSaving(true);
    try {
      if (editId) {
        await updateCategory(editId, { name: form.name, price: parseFloat(form.price), card_value: cardValue, cards_per_sheet: cardsPerSheet });
      } else {
        await createLocalCategory({ name: form.name, price: parseFloat(form.price), card_value: cardValue, cards_per_sheet: cardsPerSheet, project_id: projectId });
      }
      setForm({ name: '', price: '', card_value: '', cards_per_sheet: '1' }); setShowForm(false); setEditId(null); load();
    } catch (e) {
      console.log('CAT SAVE ERROR:', e);
    }
    setSaving(false);
  };

  const startEdit = (c) => { setEditId(c.id); setForm({ name: c.name, price: String(c.price), card_value: String(c.card_value || c.price || 0), cards_per_sheet: String(c.cards_per_sheet || 1) }); setShowForm(true); };
  const catColors = [colors.blue, colors.cyan, colors.purple, colors.green, colors.orange];

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', price: '', card_value: '', cards_per_sheet: '1' }); }}>
        <Feather name={showForm && !editId ? 'x' : 'plus'} size={18} color={colors.primary} />
        <Text style={s.addBtnTxt}>{showForm && !editId ? 'إلغاء' : 'إضافة فئة جديدة'}</Text>
      </TouchableOpacity>
      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId ? 'تعديل الفئة' : 'فئة جديدة'}</Text>
          <Input label="اسم الفئة *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="مثال: كرت 5000 ر.ي" />
          <Input label="سعر الورقة (ر.ي) *" value={form.price} onChangeText={v => setForm({ ...form, price: v })} keyboardType="numeric" placeholder="5000" />
          <Input label="قيمة الكرت" value={form.card_value} onChangeText={v => setForm({ ...form, card_value: v })} keyboardType="numeric" placeholder={form.price || '5000'} />
          <Input label="عدد الكروت في الورقة" value={form.cards_per_sheet} onChangeText={v => setForm({ ...form, cards_per_sheet: v })} keyboardType="numeric" placeholder="1" />
          <Btn label={saving ? 'جاري الحفظ...' : editId ? 'حفظ' : 'إضافة'} icon={saving ? undefined : editId ? 'save' : 'check'} variant="primary" onPress={() => Alert.alert('تأكيد', 'حفظ؟', [{text:'إلغاء'}, {text:'نعم', onPress: performSave}])} disabled={saving} />
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
                <Text style={s.userMeta}>قيمة الكرت: {formatCurrency(c.card_value || c.price || 0)} • عدد الكروت في الورقة: {c.cards_per_sheet || 1}</Text>
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

// Remaining screen sections are unchanged from main.
