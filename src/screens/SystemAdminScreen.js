import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal, StyleSheet, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../services/AuthContext';
import { useTheme } from '../theme';
import {
  isSystemAdminUser,
  fetchSystemProjects,
  fetchSystemUsers,
  fetchSystemPhases,
  fetchSystemMemberships,
  createSystemProject,
  updateSystemProject,
  createSystemPhase,
  updateSystemPhase,
  createSystemUser,
  updateSystemUser,
  linkUserToProject,
  deactivateUserProjectAccess,
} from '../services/systemAdminService';

const ROLE_LABELS = {
  admin: 'مدير عام',
  cashier: 'محاسب',
  agent: 'مندوب مبيعات',
};

const SECTIONS = [
  { id: 'projects', label: 'المشاريع', icon: 'grid' },
  { id: 'phases', label: 'المراحل', icon: 'layers' },
  { id: 'users', label: 'المستخدمون', icon: 'users' },
  { id: 'memberships', label: 'ربط المستخدمين بالمشاريع', icon: 'link' },
];

const isActiveValue = (value) => !(value === false || value === 0 || value === '0' || value === 'false');

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 40 },
    sectionTabs: {
      flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 16,
    },
    sectionTab: {
      flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    },
    sectionTabActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
    sectionTabText: { color: colors.t2, fontWeight: '700', fontSize: 13 },
    sectionTabTextActive: { color: colors.primary },
    card: {
      backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
      padding: 14, marginBottom: 10,
    },
    cardTitle: { color: colors.t1, fontWeight: '800', fontSize: 15, textAlign: 'right' },
    cardSub: { color: colors.t3, fontSize: 12, marginTop: 3, textAlign: 'right' },
    row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
    badgeText: { fontSize: 11, fontWeight: '800' },
    miniBtn: {
      flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
      paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2,
    },
    miniBtnText: { fontSize: 12, fontWeight: '700', color: colors.t1 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    dangerBtn: {
      flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: colors.danger + '14', borderRadius: 12, paddingVertical: 11,
      borderWidth: 1, borderColor: colors.danger + '44',
    },
    dangerBtnText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
    label: { color: colors.t2, fontWeight: '700', fontSize: 13, marginBottom: 6, textAlign: 'right' },
    input: {
      backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      color: colors.t1, textAlign: 'right', marginBottom: 12, fontSize: 14,
    },
    inputDisabled: { opacity: 0.55 },
    selectBtn: {
      flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12,
    },
    selectBtnText: { color: colors.t1, fontSize: 14, flex: 1, textAlign: 'right' },
    errorBox: {
      backgroundColor: colors.danger + '14', borderColor: colors.danger + '55', borderWidth: 1,
      borderRadius: 12, padding: 12, marginBottom: 12,
    },
    errorText: { color: colors.danger, fontSize: 13, fontWeight: '700', textAlign: 'right' },
    emptyBox: { alignItems: 'center', padding: 28, gap: 8 },
    emptyText: { color: colors.t3, fontSize: 13, textAlign: 'center' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '85%', borderWidth: 1, borderColor: colors.border,
    },
    sheetHeader: {
      flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
      padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    sheetTitle: { color: colors.t1, fontWeight: '800', fontSize: 16 },
    sheetBody: { padding: 16 },
    optionRow: {
      flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    optionTitle: { color: colors.t1, fontSize: 14, fontWeight: '700', textAlign: 'right' },
    optionSub: { color: colors.t3, fontSize: 12, textAlign: 'right' },
    toggleRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 12 },
    toggleBtn: {
      flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2,
    },
    toggleBtnActive: { backgroundColor: colors.success + '18', borderColor: colors.success },
    toggleBtnDanger: { backgroundColor: colors.danger + '14', borderColor: colors.danger },
    toggleBtnText: { color: colors.t2, fontWeight: '800', fontSize: 13 },
    toggleBtnTextActive: { color: colors.success },
    toggleBtnTextDanger: { color: colors.danger },
    headerActions: { flexDirection: 'row-reverse', gap: 8, marginBottom: 14 },
  });
}

function Field({ label, style, ...inputProps }) {
  return (
    <View>
      <Text style={style.label}>{label}</Text>
      <TextInput style={[style.input, inputProps.editable === false && style.inputDisabled]} {...inputProps} />
    </View>
  );
}

function SelectField({ label, value, options, onSelect, placeholder, style, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = (options || []).find((option) => String(option.value) === String(value));
  return (
    <View>
      {label ? <Text style={style.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[style.selectBtn, disabled && style.inputDisabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <Feather name="chevron-down" size={16} color={style.selectBtnText.color} />
        <Text style={style.selectBtnText} numberOfLines={1}>
          {selected ? selected.label : (placeholder || 'اختر...')}
        </Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={style.modalBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={style.sheet}>
            <View style={style.sheetHeader}>
              <Text style={style.sheetTitle}>{placeholder || 'اختر'}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Feather name="x" size={20} color={style.sheetTitle.color} />
              </TouchableOpacity>
            </View>
            <ScrollView nestedScrollEnabled>
              {(options || []).map((option) => {
                const isSelected = String(option.value) === String(value);
                return (
                  <TouchableOpacity
                    key={String(option.value)}
                    style={style.optionRow}
                    onPress={() => { onSelect(option.value); setOpen(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={style.optionTitle}>{option.label}</Text>
                      {option.sub ? <Text style={style.optionSub}>{option.sub}</Text> : null}
                    </View>
                    {isSelected ? <Feather name="check" size={17} color={style.sectionTabTextActive.color} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function StatusBadge({ active, activeText, inactiveText, colors }) {
  const on = isActiveValue(active);
  return (
    <View style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: on ? colors.success + '18' : colors.danger + '14' }]}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: on ? colors.success : colors.danger }}>
        {on ? activeText : inactiveText}
      </Text>
    </View>
  );
}

function FormSheet({ visible, title, onClose, style, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={style.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={style.sheet}>
          <View style={style.sheetHeader}>
            <Text style={style.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={style.sheetTitle.color} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={style.sheetBody}>{children}</View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function SystemAdminScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [section, setSection] = useState('projects');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [phases, setPhases] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [scopeProjectId, setScopeProjectId] = useState(null);

  const [projectForm, setProjectForm] = useState(null);
  const [phaseForm, setPhaseForm] = useState(null);
  const [userForm, setUserForm] = useState(null);
  const [memberForm, setMemberForm] = useState(null);

  const handleError = useCallback((err) => {
    setError(err?.message || 'حدث خطأ غير متوقع.');
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const rows = await fetchSystemProjects();
      setProjects(rows || []);
      return rows || [];
    } catch (err) { handleError(err); return []; }
  }, [handleError]);

  const loadUsers = useCallback(async () => {
    try {
      const rows = await fetchSystemUsers();
      setUsers(rows || []);
      return rows || [];
    } catch (err) { handleError(err); return []; }
  }, [handleError]);

  const loadScopedData = useCallback(async (projectId) => {
    if (!projectId) { setPhases([]); setMemberships([]); return; }
    setLoading(true);
    try {
      const [phaseRows, memberRows] = await Promise.all([
        fetchSystemPhases(projectId),
        fetchSystemMemberships(projectId),
      ]);
      setPhases(phaseRows || []);
      setMemberships(memberRows || []);
    } catch (err) { handleError(err); } finally { setLoading(false); }
  }, [handleError]);

  useEffect(() => {
    if (!isSystemAdminUser(user)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await loadProjects();
      if (!cancelled) {
        if (rows.length) setScopeProjectId(rows[0].id);
        await loadUsers();
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const openSection = async (next) => {
    setSection(next);
    setError('');
    if ((next === 'phases' || next === 'memberships') && scopeProjectId) {
      await loadScopedData(scopeProjectId);
    }
  };

  const changeScopeProject = async (projectId) => {
    setScopeProjectId(projectId);
    await loadScopedData(projectId);
  };

  // ── Projects ──────────────────────────────────────────────────────────
  const saveProject = async () => {
    if (!projectForm) return;
    if (!String(projectForm.name || '').trim()) { setError('اسم المشروع مطلوب.'); return; }
    setSaving(true); setError('');
    try {
      if (projectForm.id) {
        await updateSystemProject({
          id: projectForm.id,
          name: projectForm.name.trim(),
          license_number: projectForm.license_number,
          notes: projectForm.notes,
          active: isActiveValue(projectForm.active),
        });
      } else {
        await createSystemProject({
          name: projectForm.name.trim(),
          license_number: projectForm.license_number,
          notes: projectForm.notes,
        });
      }
      setProjectForm(null);
      setProjects(await fetchSystemProjects());
      Alert.alert('تم', 'تم حفظ المشروع بنجاح.');
    } catch (err) { handleError(err); } finally { setSaving(false); }
  };

  const confirmDeactivateProject = (project) => {
    Alert.alert(
      'تعطيل المشروع',
      `هل تريد تعطيل مشروع "${project.name}"؟ لن يتم حذف أي بيانات ويمكن إعادة التفعيل لاحقاً.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تعطيل',
          style: 'destructive',
          onPress: async () => {
            setSaving(true); setError('');
            try {
              await updateSystemProject({ id: project.id, name: project.name, license_number: project.license_number, notes: project.notes, active: false });
              setProjects(await fetchSystemProjects());
            } catch (err) { handleError(err); } finally { setSaving(false); }
          },
        },
      ]
    );
  };

  // ── Phases ────────────────────────────────────────────────────────────
  const savePhase = async () => {
    if (!phaseForm) return;
    if (!phaseForm.project_id) { setError('لا يمكن إنشاء مرحلة بدون مشروع.'); return; }
    if (!String(phaseForm.name || '').trim()) { setError('اسم المرحلة مطلوب.'); return; }
    setSaving(true); setError('');
    try {
      if (phaseForm.id) {
        await updateSystemPhase({
          id: phaseForm.id,
          project_id: phaseForm.project_id,
          name: phaseForm.name.trim(),
          start_date: phaseForm.start_date,
          end_date: phaseForm.end_date,
          description: phaseForm.description,
          status: phaseForm.status || 'active',
        });
      } else {
        await createSystemPhase({
          project_id: phaseForm.project_id,
          name: phaseForm.name.trim(),
          start_date: phaseForm.start_date,
          end_date: phaseForm.end_date,
          description: phaseForm.description,
          status: phaseForm.status || 'active',
        });
      }
      setPhaseForm(null);
      setPhases(await fetchSystemPhases(phaseForm.project_id));
      Alert.alert('تم', 'تم حفظ المرحلة بنجاح.');
    } catch (err) { handleError(err); } finally { setSaving(false); }
  };

  const confirmSetPhaseStatus = (phase, status) => {
    const closing = status === 'closed';
    Alert.alert(
      closing ? 'إغلاق المرحلة' : 'إعادة تفعيل المرحلة',
      closing
        ? 'ستصبح المرحلة للقراءة فقط ولا يمكن إجراء عمليات جديدة عليها.'
        : 'سيتم إعادة تفعيل هذه المرحلة إذا لم توجد مرحلة نشطة أخرى في المشروع.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: closing ? 'إغلاق' : 'تفعيل',
          style: closing ? 'destructive' : 'default',
          onPress: async () => {
            setSaving(true); setError('');
            try {
              await updateSystemPhase({
                id: phase.id,
                project_id: phase.project_id,
                name: phase.name,
                start_date: phase.start_date,
                end_date: phase.end_date,
                description: phase.description,
                status,
              });
              setPhases(await fetchSystemPhases(phase.project_id));
            } catch (err) { handleError(err); } finally { setSaving(false); }
          },
        },
      ]
    );
  };

  // ── Users ─────────────────────────────────────────────────────────────
  const saveUser = async () => {
    if (!userForm) return;
    if (!String(userForm.name || '').trim()) { setError('الاسم الكامل مطلوب.'); return; }
    if (!String(userForm.username || '').trim()) { setError('اسم المستخدم مطلوب.'); return; }

    const password = String(userForm.password || '');
    const confirmPassword = String(userForm.confirm_password || '');
    if (!userForm.id && !password) { setError('كلمة المرور مطلوبة.'); return; }
    if (password || confirmPassword) {
      if (password !== confirmPassword) { setError('كلمتا المرور غير متطابقتين.'); return; }
    }

    setSaving(true); setError('');
    try {
      if (userForm.id) {
        await updateSystemUser({
          id: userForm.id,
          name: userForm.name.trim(),
          phone: userForm.phone,
          is_active: isActiveValue(userForm.active),
          new_password: password,
        });
      } else {
        await createSystemUser({
          name: userForm.name.trim(),
          username: userForm.username.trim(),
          password,
          phone: userForm.phone,
          role: userForm.role || 'agent',
        });
      }
      setUserForm(null);
      setUsers(await fetchSystemUsers());
      Alert.alert('تم', 'تم حفظ المستخدم بنجاح.');
    } catch (err) { handleError(err); } finally { setSaving(false); }
  };

  const confirmToggleUser = (targetUser) => {
    const activating = !isActiveValue(targetUser.is_active);
    Alert.alert(
      activating ? 'تفعيل المستخدم' : 'تعطيل المستخدم',
      activating
        ? `هل تريد تفعيل المستخدم "${targetUser.name}"؟`
        : `هل تريد تعطيل المستخدم "${targetUser.name}"؟ لن يتم حذف حسابه أو سجلاته.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: activating ? 'تفعيل' : 'تعطيل',
          style: activating ? 'default' : 'destructive',
          onPress: async () => {
            setSaving(true); setError('');
            try {
              await updateSystemUser({
                id: targetUser.id,
                name: targetUser.name,
                phone: targetUser.phone,
                is_active: activating,
                new_password: null,
              });
              setUsers(await fetchSystemUsers());
            } catch (err) { handleError(err); } finally { setSaving(false); }
          },
        },
      ]
    );
  };

  // ── Memberships ───────────────────────────────────────────────────────
  const saveMembership = async () => {
    if (!memberForm) return;
    if (!memberForm.user_id) { setError('يجب اختيار المستخدم.'); return; }
    if (!scopeProjectId) { setError('يجب اختيار المشروع.'); return; }
    if (!memberForm.role) { setError('يجب تحديد دور المستخدم في المشروع.'); return; }

    const duplicate = (memberships || []).some((item) => String(item.user_id) === String(memberForm.user_id));
    if (duplicate) { setError('هذا المستخدم مرتبط بهذا المشروع مسبقاً'); return; }

    setSaving(true); setError('');
    try {
      await linkUserToProject({
        user_id: memberForm.user_id,
        project_id: scopeProjectId,
        role: memberForm.role,
        active: true,
      });
      setMemberForm(null);
      setMemberships(await fetchSystemMemberships(scopeProjectId));
      Alert.alert('تم', 'تم ربط المستخدم بالمشروع بنجاح.');
    } catch (err) { handleError(err); } finally { setSaving(false); }
  };

  const confirmDeactivateMembership = (membership) => {
    Alert.alert(
      'إلغاء تفعيل الربط',
      'لن يتمكن المستخدم من الدخول إلى هذا المشروع حتى إعادة الربط. هل تريد المتابعة؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إلغاء التفعيل',
          style: 'destructive',
          onPress: async () => {
            setSaving(true); setError('');
            try {
              await deactivateUserProjectAccess({ membership_id: membership.id, project_id: membership.project_id });
              setMemberships(await fetchSystemMemberships(membership.project_id));
            } catch (err) { handleError(err); } finally { setSaving(false); }
          },
        },
      ]
    );
  };

  // ── Render helpers ────────────────────────────────────────────────────
  const projectOptions = (projects || []).map((project) => ({
    value: project.id,
    label: project.name,
    sub: project.license_number ? `رقم الترخيص: ${project.license_number}` : '',
  }));

  const linkableUserOptions = (users || [])
    .filter((item) => isActiveValue(item.is_active))
    .map((item) => ({ value: item.id, label: item.name, sub: item.username }));

  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

  const renderEmpty = (text) => (
    <View style={s.emptyBox}>
      <Feather name="inbox" size={26} color={colors.t3} />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );

  const renderLoading = () => (
    <View style={s.emptyBox}><ActivityIndicator size="small" color={colors.primary} /></View>
  );

  if (!isSystemAdminUser(user)) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', padding: 30 }]}>
        <Feather name="shield-off" size={40} color={colors.danger} />
        <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 16, marginTop: 14, textAlign: 'center' }}>
          لا تملك صلاحية الوصول إلى إدارة النظام.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Section tabs */}
        <View style={s.sectionTabs}>
          {SECTIONS.map((item) => {
            const activeTab = section === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[s.sectionTab, activeTab && s.sectionTabActive]}
                onPress={() => openSection(item.id)}
              >
                <Feather name={item.icon} size={15} color={activeTab ? colors.primary : colors.t3} />
                <Text style={[s.sectionTabText, activeTab && s.sectionTabTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? renderLoading() : null}

        {/* ── المشاريع ── */}
        {section === 'projects' && !loading ? (
          <>
            <View style={s.headerActions}>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1, flexDirection: 'row-reverse', gap: 6 }]}
                onPress={() => { setError(''); setProjectForm({ id: null, name: '', license_number: '', notes: '', active: true }); }}
              >
                <Feather name="plus" size={17} color="#FFFFFF" />
                <Text style={s.primaryBtnText}>إضافة مشروع</Text>
              </TouchableOpacity>
            </View>
            {(projects || []).length === 0
              ? renderEmpty('لا توجد مشاريع بعد.')
              : (projects || []).map((project) => (
                <View key={String(project.id)} style={s.card}>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[s.cardTitle, { flex: 1 }]}>{project.name}</Text>
                    <StatusBadge active={project.active} activeText="نشط" inactiveText="غير نشط" colors={colors} />
                  </View>
                  {project.license_number ? (
                    <Text style={s.cardSub}>رقم الترخيص: {project.license_number}</Text>
                  ) : null}
                  {project.notes ? <Text style={s.cardSub}>ملاحظات: {project.notes}</Text> : null}
                  <View style={s.row}>
                    <TouchableOpacity
                      style={s.miniBtn}
                      onPress={() => {
                        setError('');
                        setProjectForm({
                          id: project.id,
                          name: project.name || '',
                          license_number: project.license_number || '',
                          notes: project.notes || '',
                          active: isActiveValue(project.active),
                        });
                      }}
                    >
                      <Feather name="edit-2" size={13} color={colors.t2} />
                      <Text style={s.miniBtnText}>تعديل</Text>
                    </TouchableOpacity>
                    {isActiveValue(project.active) ? (
                      <TouchableOpacity style={[s.miniBtn, { borderColor: colors.danger + '55' }]} onPress={() => confirmDeactivateProject(project)} disabled={saving}>
                        <Feather name="slash" size={13} color={colors.danger} />
                        <Text style={[s.miniBtnText, { color: colors.danger }]}>تعطيل المشروع</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}
          </>
        ) : null}

        {/* ── المراحل ── */}
        {section === 'phases' && !loading ? (
          <>
            <SelectField
              placeholder="اختيار المشروع"
              value={scopeProjectId}
              options={projectOptions}
              onSelect={(value) => changeScopeProject(value)}
              style={s}
            />
            <View style={s.headerActions}>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1, flexDirection: 'row-reverse', gap: 6 }]}
                onPress={() => {
                  setError('');
                  if (!scopeProjectId) { setError('لا يمكن إنشاء مرحلة بدون مشروع.'); return; }
                  setPhaseForm({
                    id: null,
                    project_id: scopeProjectId,
                    name: '',
                    start_date: '',
                    end_date: '',
                    description: '',
                    status: 'active',
                  });
                }}
              >
                <Feather name="plus" size={17} color="#FFFFFF" />
                <Text style={s.primaryBtnText}>إضافة مرحلة</Text>
              </TouchableOpacity>
            </View>
            {!scopeProjectId
              ? renderEmpty('اختر مشروعاً لعرض مراحله.')
              : (phases || []).length === 0
                ? renderEmpty('لا توجد مراحل لهذا المشروع بعد.')
                : (phases || []).map((phase) => {
                  const closed = String(phase.status) === 'closed';
                  return (
                    <View key={String(phase.id)} style={s.card}>
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[s.cardTitle, { flex: 1 }]}>{phase.name}</Text>
                        <StatusBadge
                          active={!closed}
                          activeText="مرحلة نشطة"
                          inactiveText="مرحلة مغلقة"
                          colors={colors}
                        />
                      </View>
                      <Text style={s.cardSub}>
                        من {phase.start_date || '—'} إلى {phase.end_date || '—'}
                      </Text>
                      <View style={s.row}>
                        <TouchableOpacity
                          style={s.miniBtn}
                          onPress={() => {
                            setError('');
                            setPhaseForm({
                              id: phase.id,
                              project_id: phase.project_id,
                              name: phase.name || '',
                              start_date: phase.start_date || '',
                              end_date: phase.end_date || '',
                              description: phase.description || '',
                              status: phase.status || 'active',
                            });
                          }}
                        >
                          <Feather name="edit-2" size={13} color={colors.t2} />
                          <Text style={s.miniBtnText}>تعديل</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={closed ? s.miniBtn : [s.miniBtn, { borderColor: colors.danger + '55' }]}
                          onPress={() => confirmSetPhaseStatus(phase, closed ? 'active' : 'closed')}
                          disabled={saving}
                        >
                          <Feather name={closed ? 'refresh-cw' : 'lock'} size={13} color={closed ? colors.success : colors.danger} />
                          <Text style={[s.miniBtnText, { color: closed ? colors.success : colors.danger }]}>
                            {closed ? 'إعادة تفعيل' : 'إغلاق المرحلة'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
          </>
        ) : null}

        {/* ── المستخدمون ── */}
        {section === 'users' && !loading ? (
          <>
            <View style={s.headerActions}>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1, flexDirection: 'row-reverse', gap: 6 }]}
                onPress={() => { setError(''); setUserForm({ id: null, name: '', username: '', password: '', confirm_password: '', phone: '', role: 'agent', active: true }); }}
              >
                <Feather name="plus" size={17} color="#FFFFFF" />
                <Text style={s.primaryBtnText}>إضافة مستخدم</Text>
              </TouchableOpacity>
            </View>
            {(users || []).length === 0
              ? renderEmpty('لا يوجد مستخدمون بعد.')
              : (users || []).map((item) => (
                <View key={String(item.id)} style={s.card}>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[s.cardTitle, { flex: 1 }]}>{item.name}</Text>
                    <StatusBadge active={item.is_active} activeText="مفعل" inactiveText="معطل" colors={colors} />
                  </View>
                  <Text style={s.cardSub}>اسم المستخدم: {item.username}</Text>
                  {item.role ? <Text style={s.cardSub}>الدور العام: {ROLE_LABELS[item.role] || item.role}</Text> : null}
                  <View style={s.row}>
                    <TouchableOpacity
                      style={s.miniBtn}
                      onPress={() => {
                        setError('');
                        setUserForm({
                          id: item.id,
                          name: item.name || '',
                          username: item.username || '',
                          password: '',
                          confirm_password: '',
                          phone: item.phone || '',
                          role: item.role || 'agent',
                          active: isActiveValue(item.is_active),
                        });
                      }}
                    >
                      <Feather name="edit-2" size={13} color={colors.t2} />
                      <Text style={s.miniBtnText}>تعديل</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.miniBtn} onPress={() => confirmToggleUser(item)} disabled={saving}>
                      <Feather name={isActiveValue(item.is_active) ? 'user-x' : 'user-check'} size={13} color={isActiveValue(item.is_active) ? colors.danger : colors.success} />
                      <Text style={[s.miniBtnText, { color: isActiveValue(item.is_active) ? colors.danger : colors.success }]}>
                        {isActiveValue(item.is_active) ? 'تعطيل المستخدم' : 'تفعيل المستخدم'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
          </>
        ) : null}

        {/* ── ربط المستخدمين بالمشاريع ── */}
        {section === 'memberships' && !loading ? (
          <>
            <SelectField
              placeholder="اختيار المشروع"
              value={scopeProjectId}
              options={projectOptions}
              onSelect={(value) => changeScopeProject(value)}
              style={s}
            />
            <TouchableOpacity
              style={[s.primaryBtn, { flexDirection: 'row-reverse', gap: 6, marginBottom: 14 }]}
              onPress={() => {
                setError('');
                if (!scopeProjectId) { setError('يجب اختيار المشروع.'); return; }
                setMemberForm({ user_id: null, role: 'agent' });
              }}
            >
              <Feather name="link" size={16} color="#FFFFFF" />
              <Text style={s.primaryBtnText}>إضافة صلاحية مشروع</Text>
            </TouchableOpacity>

            {!scopeProjectId
              ? renderEmpty('اختر مشروعاً لإدارة روابطه.')
              : (memberships || []).length === 0
                ? renderEmpty('لا توجد روابط لهذا المشروع بعد.')
                : (memberships || []).map((membership) => (
                  <View key={String(membership.id)} style={s.card}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[s.cardTitle, { flex: 1 }]}>{membership.user_name}</Text>
                      <StatusBadge active={membership.active} activeText="مرتبط" inactiveText="ملغي" colors={colors} />
                    </View>
                    <Text style={s.cardSub}>اسم المستخدم: {membership.username}</Text>
                    <Text style={s.cardSub}>دور المستخدم في المشروع: {ROLE_LABELS[membership.role] || membership.role}</Text>
                    {isActiveValue(membership.active) ? (
                      <View style={s.row}>
                        <TouchableOpacity
                          style={[s.miniBtn, { borderColor: colors.danger + '55' }]}
                          onPress={() => confirmDeactivateMembership(membership)}
                          disabled={saving}
                        >
                          <Feather name="unlink" size={13} color={colors.danger} />
                          <Text style={[s.miniBtnText, { color: colors.danger }]}>إلغاء تفعيل الربط</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))}
          </>
        ) : null}
      </ScrollView>

      {/* ── نماذج الإدخال ── */}

      <FormSheet visible={!!projectForm} title={projectForm?.id ? 'تعديل مشروع' : 'إضافة مشروع'} onClose={() => setProjectForm(null)} style={s}>
        <Field label="اسم المشروع *" style={s} value={projectForm?.name || ''} onChangeText={(text) => setProjectForm((prev) => ({ ...prev, name: text }))} placeholder="اسم المشروع" />
        <Field label="رقم الترخيص" style={s} value={projectForm?.license_number || ''} onChangeText={(text) => setProjectForm((prev) => ({ ...prev, license_number: text }))} placeholder="رقم الترخيص" autoCapitalize="none" />
        <Field label="ملاحظات" style={s} value={projectForm?.notes || ''} onChangeText={(text) => setProjectForm((prev) => ({ ...prev, notes: text }))} placeholder="ملاحظات (اختياري)" multiline />
        <Text style={s.label}>حالة المشروع</Text>
        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, isActiveValue(projectForm?.active) && s.toggleBtnActive]}
            onPress={() => setProjectForm((prev) => ({ ...prev, active: true }))}
          >
            <Text style={[s.toggleBtnText, isActiveValue(projectForm?.active) && s.toggleBtnTextActive]}>نشط</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, !isActiveValue(projectForm?.active) && s.toggleBtnDanger]}
            onPress={() => setProjectForm((prev) => ({ ...prev, active: false }))}
          >
            <Text style={[s.toggleBtnText, !isActiveValue(projectForm?.active) && s.toggleBtnTextDanger]}>غير نشط</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.primaryBtn} onPress={saveProject} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={s.primaryBtnText}>حفظ المشروع</Text>}
        </TouchableOpacity>
      </FormSheet>

      <FormSheet visible={!!phaseForm} title={phaseForm?.id ? 'تعديل مرحلة' : 'إضافة مرحلة'} onClose={() => setPhaseForm(null)} style={s}>
        <SelectField
          label="المشروع التابع *"
          placeholder="اختيار المشروع"
          value={phaseForm?.project_id}
          options={projectOptions}
          onSelect={(value) => setPhaseForm((prev) => ({ ...prev, project_id: value }))}
          style={s}
          disabled={!!phaseForm?.id}
        />
        <Field label="اسم المرحلة *" style={s} value={phaseForm?.name || ''} onChangeText={(text) => setPhaseForm((prev) => ({ ...prev, name: text }))} placeholder="اسم المرحلة" />
        <Field label="تاريخ البداية" style={s} value={phaseForm?.start_date || ''} onChangeText={(text) => setPhaseForm((prev) => ({ ...prev, start_date: text }))} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <Field label="تاريخ النهاية" style={s} value={phaseForm?.end_date || ''} onChangeText={(text) => setPhaseForm((prev) => ({ ...prev, end_date: text }))} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <Text style={s.label}>الحالة</Text>
        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, (phaseForm?.status || 'active') === 'active' && s.toggleBtnActive]}
            onPress={() => setPhaseForm((prev) => ({ ...prev, status: 'active' }))}
          >
            <Text style={[s.toggleBtnText, (phaseForm?.status || 'active') === 'active' && s.toggleBtnTextActive]}>مرحلة نشطة</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, phaseForm?.status === 'closed' && s.toggleBtnDanger]}
            onPress={() => setPhaseForm((prev) => ({ ...prev, status: 'closed' }))}
          >
            <Text style={[s.toggleBtnText, phaseForm?.status === 'closed' && s.toggleBtnTextDanger]}>مرحلة مغلقة</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.primaryBtn} onPress={savePhase} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={s.primaryBtnText}>حفظ المرحلة</Text>}
        </TouchableOpacity>
      </FormSheet>

      <FormSheet visible={!!userForm} title={userForm?.id ? 'تعديل مستخدم' : 'إضافة مستخدم'} onClose={() => setUserForm(null)} style={s}>
        <Field label="الاسم الكامل *" style={s} value={userForm?.name || ''} onChangeText={(text) => setUserForm((prev) => ({ ...prev, name: text }))} placeholder="الاسم الكامل" />
        <Field
          label="اسم المستخدم *"
          style={s}
          value={userForm?.username || ''}
          onChangeText={(text) => setUserForm((prev) => ({ ...prev, username: text }))}
          placeholder="اسم المستخدم"
          autoCapitalize="none"
          editable={!userForm?.id}
        />
        <Field
          label={userForm?.id ? 'كلمة المرور الجديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور *'}
          style={s}
          value={userForm?.password || ''}
          onChangeText={(text) => setUserForm((prev) => ({ ...prev, password: text }))}
          placeholder="كلمة المرور"
          secureTextEntry
          autoCapitalize="none"
        />
        <Field
          label="تأكيد كلمة المرور"
          style={s}
          value={userForm?.confirm_password || ''}
          onChangeText={(text) => setUserForm((prev) => ({ ...prev, confirm_password: text }))}
          placeholder="تأكيد كلمة المرور"
          secureTextEntry
          autoCapitalize="none"
        />
        <Field label="رقم الهاتف" style={s} value={userForm?.phone || ''} onChangeText={(text) => setUserForm((prev) => ({ ...prev, phone: text }))} placeholder="رقم الهاتف (اختياري)" keyboardType="phone-pad" />
        {!userForm?.id ? (
          <SelectField
            label="الدور العام للحساب الجديد"
            placeholder="اختر الدور"
            value={userForm?.role || 'agent'}
            options={roleOptions}
            onSelect={(value) => setUserForm((prev) => ({ ...prev, role: value }))}
            style={s}
          />
        ) : null}
        <Text style={s.label}>الحالة</Text>
        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, isActiveValue(userForm?.active) && s.toggleBtnActive]}
            onPress={() => setUserForm((prev) => ({ ...prev, active: true }))}
          >
            <Text style={[s.toggleBtnText, isActiveValue(userForm?.active) && s.toggleBtnTextActive]}>تفعيل المستخدم</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, !isActiveValue(userForm?.active) && s.toggleBtnDanger]}
            onPress={() => setUserForm((prev) => ({ ...prev, active: false }))}
          >
            <Text style={[s.toggleBtnText, !isActiveValue(userForm?.active) && s.toggleBtnTextDanger]}>تعطيل المستخدم</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.primaryBtn} onPress={saveUser} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={s.primaryBtnText}>حفظ المستخدم</Text>}
        </TouchableOpacity>
      </FormSheet>

      <FormSheet visible={!!memberForm} title="إضافة صلاحية مشروع" onClose={() => setMemberForm(null)} style={s}>
        <SelectField
          label="اختيار المستخدم"
          placeholder="اختيار المستخدم"
          value={memberForm?.user_id}
          options={linkableUserOptions}
          onSelect={(value) => setMemberForm((prev) => ({ ...prev, user_id: value }))}
          style={s}
        />
        <SelectField
          label="اختيار المشروع"
          placeholder="اختيار المشروع"
          value={scopeProjectId}
          options={projectOptions}
          onSelect={(value) => changeScopeProject(value)}
          style={s}
        />
        <SelectField
          label="دور المستخدم في المشروع"
          placeholder="اختر الدور"
          value={memberForm?.role}
          options={roleOptions}
          onSelect={(value) => setMemberForm((prev) => ({ ...prev, role: value }))}
          style={s}
        />
        <TouchableOpacity style={s.primaryBtn} onPress={saveMembership} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={s.primaryBtnText}>تم ربط المستخدم بالمشروع</Text>}
        </TouchableOpacity>
      </FormSheet>
    </View>
  );
}
