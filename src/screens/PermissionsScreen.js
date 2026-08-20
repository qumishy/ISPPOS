import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth } from '../services/AuthContext';
import {
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  ROLE_DEFINITIONS,
  getLocalPermissions,
  getPermissionDefinition,
  getPermissionLockReason,
  isPermissionEditable,
  isSensitivePermission,
  resolvePermissionForRole,
  savePermissionChanges,
  validatePermissionChanges,
} from '../services/permissionsService';
import { getLocalUsers } from '../services/userService';
import { Avatar, Btn, Loading } from '../components/UI';
import { makeStyles } from '../styles/admin.styles';

const TABS = [
  { key: 'roles', label: 'صلاحيات الأدوار', icon: 'shield' },
  { key: 'users', label: 'تخصيص المستخدمين', icon: 'user' },
];

const mapRows = (rows = []) => {
  const mapped = {};
  rows.forEach((row) => {
    if (row?.screen_name) mapped[row.screen_name] = row;
  });
  return mapped;
};

const permissionMapsEqual = (left = {}, right = {}, comparePresence = false) => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (comparePresence && (!!left[key] !== !!right[key])) return false;
    if (!!left[key]?.can_view !== !!right[key]?.can_view) return false;
  }
  return true;
};

const buildGroupedDefinitions = (permissionMaps, search) => {
  const codes = new Set(PERMISSION_DEFINITIONS.map((definition) => definition.code));
  permissionMaps.forEach((permissions) => Object.keys(permissions || {}).forEach((code) => codes.add(code)));

  const normalizedSearch = String(search || '').trim().toLocaleLowerCase('ar');
  const definitions = Array.from(codes)
    .map(getPermissionDefinition)
    .filter((definition) => {
      if (!normalizedSearch) return true;
      return `${definition.label} ${definition.description}`.toLocaleLowerCase('ar').includes(normalizedSearch);
    });

  return PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: definitions.filter((definition) => definition.group === group.id),
  })).filter((group) => group.permissions.length > 0);
};

const alertLocked = () => Alert.alert('صلاحية مقيدة', 'لا يمكن تعديل هذه الصلاحية لأنها مقيدة من النظام.');

export default function PermissionsScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const styles = makeStyles(colors, spacing, radius, fontSize, shadow);
  const [tab, setTab] = useState('roles');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const allowNavigationRef = useRef(false);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (!hasUnsavedChanges || allowNavigationRef.current) return;
    event.preventDefault();
    Alert.alert('تغييرات غير محفوظة', 'لديك تغييرات لم تحفظ. هل تريد مغادرة الشاشة دون حفظها؟', [
      { text: 'البقاء', style: 'cancel' },
      {
        text: 'مغادرة',
        style: 'destructive',
        onPress: () => {
          allowNavigationRef.current = true;
          navigation.dispatch(event.data.action);
        },
      },
    ]);
  }), [navigation, hasUnsavedChanges]);

  if (user?.role !== 'admin') {
    return <UnauthorizedState navigation={navigation} />;
  }

  const changeTab = (nextTab) => {
    if (nextTab === tab) return;
    const apply = () => {
      setHasUnsavedChanges(false);
      setTab(nextTab);
    };
    if (!hasUnsavedChanges) {
      apply();
      return;
    }
    Alert.alert('تغييرات غير محفوظة', 'هل تريد تجاهل التغييرات والانتقال إلى القسم الآخر؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تجاهل', style: 'destructive', onPress: apply },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.tabBar, { flexDirection: 'row-reverse' }]}>
        {TABS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tab, { flex: 1, justifyContent: 'center' }, tab === item.key && styles.tabAct]}
            onPress={() => changeTab(item.key)}
          >
            <Feather name={item.icon} size={16} color={tab === item.key ? colors.primary : colors.t3} />
            <Text style={[styles.tabTxt, tab === item.key && styles.tabTxtAct]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'roles' ? (
        <RolePermissionsTab onDirtyChange={setHasUnsavedChanges} />
      ) : (
        <UserPermissionsTab onDirtyChange={setHasUnsavedChanges} />
      )}
    </View>
  );
}

function UnauthorizedState({ navigation }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.danger + '15', alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="lock" size={28} color={colors.danger} />
      </View>
      <Text style={{ color: colors.t1, fontSize: 20, fontWeight: '900', marginTop: 14, textAlign: 'center' }}>غير مصرح بإدارة الصلاحيات</Text>
      <Text style={{ color: colors.t3, fontSize: 13, lineHeight: 22, marginTop: 8, textAlign: 'center' }}>
        هذه الشاشة محمية ومتاحة للمدير العام فقط.
      </Text>
      <Btn label="العودة" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 20, width: '100%' }} />
    </View>
  );
}

function RolePermissionsTab({ onDirtyChange }) {
  const { user, projectId } = useAuth();
  const { colors, spacing, radius, fontSize } = useTheme();
  const [selectedRole, setSelectedRole] = useState('cashier');
  const [originalPermissions, setOriginalPermissions] = useState({});
  const [draftPermissions, setDraftPermissions] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasChanges = useMemo(
    () => !permissionMapsEqual(originalPermissions, draftPermissions),
    [originalPermissions, draftPermissions]
  );
  useEffect(() => onDirtyChange(hasChanges), [hasChanges, onDirtyChange]);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getLocalPermissions('ROLE', selectedRole, projectId);
      const mapped = mapRows(rows);
      setOriginalPermissions(mapped);
      setDraftPermissions(mapped);
    } catch (error) {
      Alert.alert('خطأ', error?.message || 'تعذر تحميل صلاحيات الدور.');
    } finally {
      setLoading(false);
    }
  }, [selectedRole, projectId]);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

  const selectRole = (roleId) => {
    if (roleId === selectedRole) return;
    const apply = () => {
      setSearch('');
      setSelectedRole(roleId);
    };
    if (!hasChanges) {
      apply();
      return;
    }
    Alert.alert('تغييرات غير محفوظة', 'هل تريد تجاهل تغييرات هذا الدور؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تجاهل', style: 'destructive', onPress: apply },
    ]);
  };

  const togglePermission = (permissionCode) => {
    try {
      if (!isPermissionEditable(selectedRole, permissionCode, user, 'can_view', 'ROLE')) {
        alertLocked();
        return;
      }
      const current = draftPermissions[permissionCode]
        || resolvePermissionForRole(selectedRole, permissionCode, null);
      const updated = resolvePermissionForRole(selectedRole, permissionCode, {
        ...current,
        can_view: !current.can_view,
      });
      setDraftPermissions((previous) => ({ ...previous, [permissionCode]: updated }));
    } catch (error) {
      Alert.alert('تعذر تحديث الصلاحية', error?.message || 'تعذر تحديث الصلاحية. حاول مرة أخرى.');
    }
  };

  const changedRows = useMemo(() => PERMISSION_DEFINITIONS
    .filter((definition) => isPermissionEditable(selectedRole, definition.code, user, 'can_view', 'ROLE'))
    .filter((definition) => !!originalPermissions[definition.code]?.can_view !== !!draftPermissions[definition.code]?.can_view)
    .map((definition) => ({
      screen_name: definition.code,
      can_view: !!draftPermissions[definition.code]?.can_view,
    })), [selectedRole, user, originalPermissions, draftPermissions]);

  const persist = async (confirmedSensitive) => {
    setSaving(true);
    try {
      const validation = validatePermissionChanges(selectedRole, draftPermissions, user);
      if (!validation.valid) {
        Alert.alert('تعذر الحفظ', validation.errors[0] || 'لا يمكن حفظ صلاحيات غير صالحة أو متعارضة.');
        return;
      }
      await savePermissionChanges({
        entityType: 'ROLE',
        entityId: selectedRole,
        changes: changedRows,
        currentUser: user,
        projectId,
        confirmedSensitive,
      });
      await loadPermissions();
      Alert.alert('تم', 'تم حفظ الصلاحيات بنجاح.');
    } catch (error) {
      Alert.alert('خطأ', error?.message || 'لا يمكن حفظ صلاحيات غير صالحة أو متعارضة.');
    } finally {
      setSaving(false);
    }
  };

  const safelyPersist = (confirmedSensitive) => {
    persist(confirmedSensitive).catch((error) => {
      Alert.alert('تعذر الحفظ', error?.message || 'تعذر حفظ الصلاحيات. حاول مرة أخرى.');
      setSaving(false);
    });
  };

  const save = () => {
    try {
      if (!hasChanges || saving) return;
      const hasSensitiveChanges = changedRows.some((row) => isSensitivePermission(row.screen_name));
      if (!hasSensitiveChanges) {
        safelyPersist(false);
        return;
      }
      Alert.alert(
        'تأكيد تغيير حساس',
        'سيؤثر هذا التغيير في الوصول إلى بيانات مالية أو تشغيلية حساسة. هل تريد تطبيقه؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'تطبيق التغيير', onPress: () => safelyPersist(true) },
        ]
      );
    } catch (error) {
      Alert.alert('تعذر الحفظ', error?.message || 'تعذر حفظ الصلاحيات. حاول مرة أخرى.');
    }
  };

  const groupedDefinitions = useMemo(
    () => buildGroupedDefinitions([draftPermissions], search),
    [draftPermissions, search]
  );

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
      <SectionIntro
        title="صلاحيات الأدوار الأساسية"
        description="يمكن تعديل ظهور الشاشات القابلة للتخصيص فقط. عمليات الإضافة والتعديل والحذف والاعتمادات الحساسة تبقى محكومة بدور المستخدم وحواجز الخدمات."
      />

      <Text style={{ color: colors.t2, fontSize: fontSize.sm, fontWeight: '800', textAlign: 'right', marginBottom: 8 }}>اختر الدور</Text>
      <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: spacing.md }}>
        {ROLE_DEFINITIONS.map((role) => {
          const selected = selectedRole === role.id;
          return (
            <TouchableOpacity
              key={role.id}
              onPress={() => selectRole(role.id)}
              style={{
                flex: 1,
                minHeight: 96,
                padding: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: selected ? role.color : colors.border,
                backgroundColor: selected ? role.color : colors.card,
              }}
            >
              <Feather name={role.icon} size={22} color={selected ? '#FFFFFF' : role.color} />
              <Text style={{ color: selected ? '#FFFFFF' : colors.t1, fontSize: 13, fontWeight: '900', marginTop: 6, textAlign: 'center' }}>{role.label}</Text>
              {role.id === 'admin' && <Feather name="lock" size={11} color={selected ? '#FFFFFF' : colors.warning} style={{ marginTop: 5 }} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <SearchAndSave
        search={search}
        onSearch={setSearch}
        hasChanges={hasChanges}
        changeCount={changedRows.length}
        saving={saving}
        onSave={save}
      />

      {loading ? <Loading /> : (
        <PermissionGroups
          groups={groupedDefinitions}
          role={selectedRole}
          currentUser={user}
          permissions={draftPermissions}
          entityType="ROLE"
          onToggle={togglePermission}
        />
      )}
    </ScrollView>
  );
}

function UserPermissionsTab({ onDirtyChange }) {
  const { user, projectId } = useAuth();
  const { colors, spacing, radius, fontSize } = useTheme();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [rolePermissions, setRolePermissions] = useState({});
  const [originalOverrides, setOriginalOverrides] = useState({});
  const [draftOverrides, setDraftOverrides] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedUser = users.find((item) => String(item.id) === String(selectedUserId)) || null;
  const selectedRole = selectedUser?.role || '';
  const hasChanges = useMemo(
    () => !permissionMapsEqual(originalOverrides, draftOverrides, true),
    [originalOverrides, draftOverrides]
  );
  useEffect(() => onDirtyChange(hasChanges), [hasChanges, onDirtyChange]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getLocalUsers(projectId);
      const activeUsers = (rows || [])
        .filter((item) => item.active !== 0 && item.active !== false && item.active !== 'false')
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ar'));
      setUsers(activeUsers);
      setSelectedUserId((current) => activeUsers.some((item) => String(item.id) === String(current)) ? current : activeUsers[0]?.id || null);
    } catch (error) {
      Alert.alert('خطأ', error?.message || 'تعذر تحميل المستخدمين.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadUserPermissions = useCallback(async () => {
    if (!selectedUserId || !selectedRole) {
      setRolePermissions({});
      setOriginalOverrides({});
      setDraftOverrides({});
      return;
    }
    setLoading(true);
    try {
      const [roleRows, overrideRows] = await Promise.all([
        getLocalPermissions('ROLE', selectedRole, projectId),
        getLocalPermissions('USER', selectedUserId, projectId),
      ]);
      const roleMap = mapRows(roleRows);
      const overrideMap = mapRows(overrideRows);
      setRolePermissions(roleMap);
      setOriginalOverrides(overrideMap);
      setDraftOverrides(overrideMap);
    } catch (error) {
      Alert.alert('خطأ', error?.message || 'تعذر تحميل صلاحيات المستخدم.');
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, selectedRole, projectId]);

  useEffect(() => { loadUserPermissions(); }, [loadUserPermissions]);

  const selectUser = (userId) => {
    if (String(userId) === String(selectedUserId)) return;
    const apply = () => {
      setSearch('');
      setSelectedUserId(userId);
    };
    if (!hasChanges) {
      apply();
      return;
    }
    Alert.alert('تغييرات غير محفوظة', 'هل تريد تجاهل تخصيصات هذا المستخدم؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تجاهل', style: 'destructive', onPress: apply },
    ]);
  };

  const effectivePermission = (permissionCode) => resolvePermissionForRole(
    selectedRole,
    permissionCode,
    draftOverrides[permissionCode] || rolePermissions[permissionCode] || null
  );

  const togglePermission = (permissionCode) => {
    try {
      if (!isPermissionEditable(selectedRole, permissionCode, user, 'can_view', 'USER')) {
        alertLocked();
        return;
      }
      const current = effectivePermission(permissionCode);
      const fallback = resolvePermissionForRole(selectedRole, permissionCode, rolePermissions[permissionCode] || null);
      const next = resolvePermissionForRole(selectedRole, permissionCode, {
        ...current,
        entity_type: 'USER',
        entity_id: selectedUserId,
        screen_name: permissionCode,
        can_view: !current.can_view,
      });

      setDraftOverrides((previous) => {
        const updated = { ...previous };
        if (!originalOverrides[permissionCode] && next.can_view === fallback.can_view) delete updated[permissionCode];
        else updated[permissionCode] = next;
        return updated;
      });
    } catch (error) {
      Alert.alert('تعذر تحديث الصلاحية', error?.message || 'تعذر تحديث الصلاحية. حاول مرة أخرى.');
    }
  };

  const removeOverride = (permissionCode) => {
    try {
      if (!isPermissionEditable(selectedRole, permissionCode, user, 'can_view', 'USER')) {
        alertLocked();
        return;
      }
      setDraftOverrides((previous) => {
        const updated = { ...previous };
        delete updated[permissionCode];
        return updated;
      });
    } catch (error) {
      Alert.alert('تعذر إلغاء التخصيص', error?.message || 'تعذر إلغاء تخصيص الصلاحية. حاول مرة أخرى.');
    }
  };

  const changedRows = useMemo(() => Object.keys(draftOverrides)
    .filter((code) => isPermissionEditable(selectedRole, code, user, 'can_view', 'USER'))
    .filter((code) => !originalOverrides[code] || !!originalOverrides[code].can_view !== !!draftOverrides[code].can_view)
    .map((code) => ({ screen_name: code, can_view: !!draftOverrides[code].can_view })),
  [draftOverrides, originalOverrides, selectedRole, user]);

  const removals = useMemo(() => Object.keys(originalOverrides)
    .filter((code) => isPermissionEditable(selectedRole, code, user, 'can_view', 'USER'))
    .filter((code) => !draftOverrides[code]),
  [draftOverrides, originalOverrides, selectedRole, user]);

  const effectiveDraft = useMemo(() => {
    const codes = new Set([...Object.keys(rolePermissions), ...Object.keys(draftOverrides)]);
    const result = {};
    codes.forEach((code) => {
      result[code] = resolvePermissionForRole(selectedRole, code, draftOverrides[code] || rolePermissions[code]);
    });
    return result;
  }, [rolePermissions, draftOverrides, selectedRole]);

  const persist = async (confirmedSensitive) => {
    setSaving(true);
    try {
      const validation = validatePermissionChanges(selectedRole, effectiveDraft, user);
      if (!validation.valid) {
        Alert.alert('تعذر الحفظ', validation.errors[0] || 'لا يمكن حفظ صلاحيات غير صالحة أو متعارضة.');
        return;
      }
      await savePermissionChanges({
        entityType: 'USER',
        entityId: selectedUserId,
        changes: changedRows,
        removals,
        currentUser: user,
        projectId,
        confirmedSensitive,
      });
      await loadUserPermissions();
      Alert.alert('تم', 'تم حفظ الصلاحيات بنجاح.');
    } catch (error) {
      Alert.alert('خطأ', error?.message || 'لا يمكن حفظ صلاحيات غير صالحة أو متعارضة.');
    } finally {
      setSaving(false);
    }
  };

  const safelyPersist = (confirmedSensitive) => {
    persist(confirmedSensitive).catch((error) => {
      Alert.alert('تعذر الحفظ', error?.message || 'تعذر حفظ صلاحيات المستخدم. حاول مرة أخرى.');
      setSaving(false);
    });
  };

  const save = () => {
    try {
      if (!hasChanges || saving) return;
      const changedCodes = [...changedRows.map((row) => row.screen_name), ...removals];
      const hasSensitiveChanges = changedCodes.some(isSensitivePermission);
      if (!hasSensitiveChanges) {
        safelyPersist(false);
        return;
      }
      Alert.alert(
        'تأكيد تغيير حساس',
        `سيغيّر هذا التخصيص وصول المستخدم ${selectedUser?.name || ''} إلى بيانات حساسة. هل تريد المتابعة؟`,
        [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'تطبيق التغيير', onPress: () => safelyPersist(true) },
        ]
      );
    } catch (error) {
      Alert.alert('تعذر الحفظ', error?.message || 'تعذر حفظ صلاحيات المستخدم. حاول مرة أخرى.');
    }
  };

  const groupedDefinitions = useMemo(
    () => buildGroupedDefinitions([rolePermissions, draftOverrides], search),
    [rolePermissions, draftOverrides, search]
  );

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
      <SectionIntro
        title="تخصيص صلاحيات مستخدم"
        description="التخصيص يخص مستخدماً واحداً فقط. اعتماد تحصيلات المندوب الذاتية يمنح هنا لمندوب محدد، بينما الاعتماد العام وبقية الإجراءات المحمية لا يمكن تجاوزها."
      />

      <Text style={{ color: colors.t2, fontSize: fontSize.sm, fontWeight: '800', textAlign: 'right', marginBottom: 8 }}>اختر المستخدم</Text>
      {users.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', paddingBottom: spacing.sm }}>
          {users.map((item) => {
            const selected = String(item.id) === String(selectedUserId);
            const role = ROLE_DEFINITIONS.find((definition) => definition.id === item.role) || ROLE_DEFINITIONS[2];
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => selectUser(item.id)}
                style={{
                  minWidth: 150,
                  flexDirection: 'row-reverse',
                  alignItems: 'center',
                  gap: 10,
                  padding: 10,
                  marginLeft: 8,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary + '12' : colors.card,
                }}
              >
                <Avatar name={item.name} size={34} color={role.color} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.t1, fontSize: 13, fontWeight: '900', textAlign: 'right' }}>{item.name}</Text>
                  <Text style={{ color: colors.t3, fontSize: 10, marginTop: 2, textAlign: 'right' }}>{role.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : !loading ? (
        <Text style={{ color: colors.t3, textAlign: 'center', padding: spacing.xl }}>لا يوجد مستخدمون نشطون في هذا المشروع.</Text>
      ) : null}

      {selectedUser && (
        <>
          <SearchAndSave
            search={search}
            onSearch={setSearch}
            hasChanges={hasChanges}
            changeCount={changedRows.length + removals.length}
            saving={saving}
            onSave={save}
          />
          {loading ? <Loading /> : (
            <PermissionGroups
              groups={groupedDefinitions}
              role={selectedRole}
              currentUser={user}
              permissions={effectiveDraft}
              overrides={draftOverrides}
              entityType="USER"
              onToggle={togglePermission}
              onRemoveOverride={removeOverride}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

function SectionIntro({ title, description }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ backgroundColor: colors.primary + '0D', borderColor: colors.primary + '30', borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
        <Feather name="shield" size={18} color={colors.primary} />
        <Text style={{ flex: 1, color: colors.t1, fontSize: 16, fontWeight: '900', textAlign: 'right' }}>{title}</Text>
      </View>
      <Text style={{ color: colors.t3, fontSize: 12, lineHeight: 21, textAlign: 'right', marginTop: 7 }}>{description}</Text>
    </View>
  );
}

function SearchAndSave({ search, onSearch, hasChanges, changeCount, saving, onSave }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12 }}>
        <Feather name="search" size={17} color={colors.t3} />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder="ابحث عن صلاحية..."
          placeholderTextColor={colors.t3}
          style={{ flex: 1, minHeight: 46, color: colors.t1, textAlign: 'right', writingDirection: 'rtl', paddingHorizontal: 10 }}
        />
        {!!search && (
          <TouchableOpacity onPress={() => onSearch('')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Feather name="x" size={17} color={colors.t3} />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <Text style={{ flex: 1, color: hasChanges ? colors.warning : colors.t3, fontSize: 11, textAlign: 'right' }}>
          {hasChanges ? `${changeCount} تغيير بانتظار الحفظ` : 'لا توجد تغييرات غير محفوظة'}
        </Text>
        <Btn
          label={saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          icon={saving ? undefined : 'save'}
          size="sm"
          onPress={onSave}
          disabled={!hasChanges || saving}
          loading={saving}
          style={{ minWidth: 145 }}
        />
      </View>
    </View>
  );
}

function PermissionGroups({ groups, role, currentUser, permissions, overrides = null, entityType = 'ROLE', onToggle, onRemoveOverride }) {
  const { colors, spacing } = useTheme();
  if (groups.length === 0) {
    return (
      <View style={{ alignItems: 'center', padding: spacing.xl }}>
        <Feather name="search" size={26} color={colors.t3} />
        <Text style={{ color: colors.t3, marginTop: 8 }}>لا توجد صلاحيات مطابقة للبحث.</Text>
      </View>
    );
  }

  return groups.map((group) => (
    <View key={group.id} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <Feather name={group.icon} size={15} color={colors.primary} />
        <Text style={{ color: colors.t1, fontSize: 14, fontWeight: '900', textAlign: 'right' }}>{group.label}</Text>
        <View style={{ height: 1, flex: 1, backgroundColor: colors.border }} />
      </View>
      {group.permissions.map((definition) => (
        <PermissionCard
          key={definition.code}
          definition={definition}
          permission={permissions[definition.code] || resolvePermissionForRole(role, definition.code, null)}
          role={role}
          currentUser={currentUser}
          entityType={entityType}
          isOverridden={!!overrides?.[definition.code]}
          isUserMode={!!overrides}
          onToggle={() => onToggle(definition.code)}
          onRemoveOverride={onRemoveOverride ? () => onRemoveOverride(definition.code) : null}
        />
      ))}
    </View>
  ));
}

function PermissionCard({
  definition,
  permission,
  role,
  currentUser,
  entityType,
  isOverridden,
  isUserMode,
  onToggle,
  onRemoveOverride,
}) {
  const { colors, spacing, radius } = useTheme();
  const editable = isPermissionEditable(role, definition.code, currentUser, 'can_view', entityType);
  const enabled = !!permission?.can_view;
  const lockReason = editable ? '' : getPermissionLockReason(role, definition.code, entityType);

  return (
    <View style={{
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: isOverridden ? colors.success + '55' : colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: 8,
      opacity: editable ? 1 : 0.9,
    }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: (editable ? colors.primary : colors.t3) + '12' }}>
          <Feather name={definition.icon} size={19} color={editable ? colors.primary : colors.t3} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
            <Text style={{ flexShrink: 1, color: colors.t1, fontSize: 15, fontWeight: '900', textAlign: 'right' }}>{definition.label}</Text>
            {!editable && <Feather name="lock" size={13} color={colors.warning} />}
          </View>
          <Text style={{ color: colors.t3, fontSize: 11, lineHeight: 19, textAlign: 'right', marginTop: 3 }}>{definition.description}</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Switch
            value={enabled}
            onValueChange={onToggle}
            disabled={!editable}
            trackColor={{ false: colors.border2, true: colors.success }}
            thumbColor="#FFFFFF"
          />
          <Text style={{ color: enabled ? colors.success : colors.t3, fontSize: 9, fontWeight: '800', marginTop: 2 }}>
            {enabled ? 'مفعلة' : 'غير مفعلة'}
          </Text>
        </View>
      </View>

      {isUserMode && (
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 9 }}>
          <Text style={{ flex: 1, color: isOverridden ? colors.success : colors.t3, fontSize: 10, textAlign: 'right' }}>
            {isOverridden ? 'تخصيص مباشر لهذا المستخدم' : 'موروثة من الدور الأساسي'}
          </Text>
          {isOverridden && editable && onRemoveOverride && (
            <TouchableOpacity onPress={onRemoveOverride} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: colors.danger + '10' }}>
              <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '800' }}>إلغاء التخصيص</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!editable && (
        <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, backgroundColor: colors.warning + '0D', borderRadius: radius.sm, padding: 8, marginTop: 9 }}>
          <Feather name="info" size={13} color={colors.warning} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, color: colors.warning, fontSize: 10, lineHeight: 17, textAlign: 'right' }}>{lockReason}</Text>
        </View>
      )}
    </View>
  );
}
