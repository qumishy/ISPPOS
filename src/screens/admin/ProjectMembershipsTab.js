import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Btn, Input, Picker } from '../../components/UI';
import { useTheme } from '../../theme';
import {
  fetchManagedProjects,
  fetchProjectMemberships,
  deactivateUserProjectAccess,
  linkUserToProject,
} from '../../services/systemAdminService';

const ASSIGNABLE_ROLES = [
  { value: 'cashier', label: 'محاسب' },
  { value: 'agent', label: 'مندوب' },
];

const ROLE_LABELS = {
  admin: 'مدير المشروع',
  cashier: 'محاسب',
  agent: 'مندوب',
  manager: 'مدير مشروع - قديم',
  viewer: 'مشاهدة فقط',
  SYSTEM_ADMIN: 'مدير النظام العام',
};

export const normalizePickerOptions = (items, valueFor, labelFor, fallbackLabel) =>
  (Array.isArray(items) ? items : []).reduce((options, item) => {
    if (!item) return options;
    const value = valueFor(item);
    if (value === null || value === undefined || String(value).trim() === '') return options;
    options.push({
      value: String(value),
      label: String(labelFor(item) || fallbackLabel),
    });
    return options;
  }, []);

export const membershipRoleLabel = role => {
  const value = role === null || role === undefined ? '' : String(role);
  return ROLE_LABELS[value] || value || 'دور غير محدد';
};

export default function ProjectMembershipsTab({ s }) {
  const { colors, spacing } = useTheme();
  const [projects, setProjects] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', project_id: '', role: '' });

  const projectOptions = useMemo(() => normalizePickerOptions(
    projects,
    project => project.id || project.project_id,
    project => project.name || project.project_name,
    'مشروع غير محدد'
  ), [projects]);
  const roleOptions = useMemo(() => normalizePickerOptions(
    ASSIGNABLE_ROLES,
    role => role.value,
    role => role.label,
    'دور غير محدد'
  ), []);

  const loadInitialData = useCallback(async () => {
    setError('');
    setProjectsLoading(true);
    try {
      setProjects(await fetchManagedProjects());
    } catch (loadError) {
      setProjects([]);
      setError(loadError.message || 'تعذر تحميل المشاريع المتاحة.');
    }
    setProjectsLoading(false);
  }, []);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  useEffect(() => {
    setForm(current => ({
      ...current,
      project_id: projectOptions.some(option => option.value === String(current.project_id || ''))
        ? String(current.project_id) : (projectOptions[0]?.value || ''),
      role: roleOptions.some(option => option.value === String(current.role || ''))
        ? String(current.role) : (roleOptions[0]?.value || ''),
    }));
  }, [projectOptions, roleOptions]);

  const loadMemberships = useCallback(async projectId => {
    if (!projectId) {
      setMemberships([]);
      return;
    }
    setMembershipsLoading(true);
    try {
      setMemberships(await fetchProjectMemberships(projectId));
    } catch (loadError) {
      setMemberships([]);
      setError(loadError.message || 'تعذر تحميل روابط المشروع.');
    } finally {
      setMembershipsLoading(false);
    }
  }, []);

  useEffect(() => { loadMemberships(form.project_id); }, [form.project_id, loadMemberships]);

  const canSubmit = !saving && !projectsLoading
    && !!form.username.trim()
    && projectOptions.some(option => option.value === form.project_id)
    && roleOptions.some(option => option.value === form.role);

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      await linkUserToProject({
        username: form.username.trim(),
        project_id: form.project_id,
        role: form.role,
      });
      await loadMemberships(form.project_id);
      setForm(current => ({ ...current, username: '' }));
      Alert.alert('تم', 'تم ربط المستخدم بالمشروع بنجاح.');
    } catch (saveError) {
      Alert.alert('خطأ', saveError.message || 'تعذر حفظ الربط.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = membership => {
    Alert.alert('تعطيل الربط', 'هل تريد تعطيل وصول هذا المستخدم إلى المشروع؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تعطيل',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deactivateUserProjectAccess({
              membership_id: membership.id,
              project_id: membership.project_id,
            });
            await loadMemberships(form.project_id);
          } catch (saveError) {
            Alert.alert('خطأ', saveError.message || 'تعذر تعطيل الربط.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (projectsLoading) {
    return <View style={{ padding: spacing.md }}><Text style={s.userMeta}>جاري تحميل البيانات...</Text></View>;
  }

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      {!!error && <Text style={{ color: colors.danger, marginBottom: spacing.sm, textAlign: 'right' }}>{error}</Text>}
      {!projectOptions.length && <Text style={s.userMeta}>لا توجد مشاريع متاحة.</Text>}
      {!roleOptions.length && <Text style={s.userMeta}>لا توجد أدوار متاحة.</Text>}

      <View style={s.formCard}>
        <Text style={s.formTitle}>إدارة مستخدمي المشروع</Text>
        <Input label="اسم المستخدم" value={form.username}
          onChangeText={value => setForm(current => ({ ...current, username: value }))}
          placeholder="أدخل اسم المستخدم بدقة" icon="user" />
        <Picker label="المشروع" options={projectOptions} value={form.project_id || ''}
          onChange={value => setForm(current => ({ ...current, project_id: value || '' }))}
          placeholder="مشروع غير محدد" loading={projectsLoading} />
        <Picker label="الدور" options={roleOptions} value={form.role || ''}
          onChange={value => setForm(current => ({ ...current, role: value || '' }))}
          placeholder="دور غير محدد" />
        <Btn label={saving ? 'جاري الحفظ...' : 'حفظ الربط'} icon="link"
          onPress={handleSave} disabled={!canSubmit} loading={saving} />
      </View>

      <Text style={[s.formTitle, { marginTop: spacing.md }]}>المستخدمون المرتبطون</Text>
      {membershipsLoading ? <Text style={s.userMeta}>جاري تحميل البيانات...</Text>
        : !memberships.length ? <Text style={s.userMeta}>لا توجد روابط حالياً.</Text>
          : memberships.filter(Boolean).map((membership, index) => (
            <View key={String(membership.id || `${membership.user_id || 'membership'}-${index}`)} style={s.listCard}>
              <Text style={s.userName}>
                {membership.user_name || membership.name || membership.username || 'مستخدم غير محدد'}
              </Text>
              <Text style={s.userMeta}>
                {membership.project_name || 'مشروع غير محدد'} · {membershipRoleLabel(membership.role)}
              </Text>
              {membership.active !== false && ['cashier', 'agent'].includes(membership.role) ? (
                <TouchableOpacity disabled={saving} onPress={() => confirmDeactivate(membership)}>
                  <Text style={{ color: colors.danger, fontWeight: '800', marginTop: spacing.xs }}>تعطيل الوصول</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
    </ScrollView>
  );
}
