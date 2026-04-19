import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, LayoutAnimation, UIManager, Platform } from 'react-native';
import { useTheme } from '../theme';
import { supabase } from '../services/supabase';
import { getLocalPermissions, saveLocalPermission, deleteLocalPermission, resetRolePermissionsToDefault } from '../services/permissionsService';
import { getLocalUsers } from '../services/userService';
import { Loading, Row, Avatar } from '../components/UI';
import { makeStyles } from '../styles/admin.styles';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREENS = [
  { id: 'Dashboard', label: 'الرئيسية', icon: '🏠' },
  { id: 'Invoices', label: 'الفواتير', icon: '🧾' },
  { id: 'Collections', label: 'التحصيلات', icon: '💰' },
  { id: 'CashierApproval', label: 'اعتماد التحصيل', icon: '✅' },
  { id: 'Inventory', label: 'المخزون', icon: '📦' },
  { id: 'POS', label: 'نقاط البيع', icon: '🏪' },
  { id: 'Wallets', label: 'المحافظ', icon: '👜' },
  { id: 'Supplies', label: 'التوريدات المالية', icon: '💵' },
  { id: 'Reports', label: 'التقارير', icon: '📊' },
  { id: 'Settings', label: 'الإعدادات العامة', icon: '⚙️' },
  { id: 'Admin', label: 'الإدارة', icon: '👑' },
  { id: 'About', label: 'اتصل بنا', icon: '📞' },
];

const ROLES = [
  { id: 'admin', label: 'المدير العام', icon: '👑', color: '#8b5cf6' },
  { id: 'cashier', label: 'قسم الحسابات', icon: '💼', color: '#3b82f6' },
  { id: 'agent', label: 'المندوبين', icon: '🚶‍♂️', color: '#10b981' },
];

const TABS = [
  { key: 'roles', label: 'صلاحيات الأدوار الأساسية', icon: '🛡️' },
  { key: 'users', label: 'تخصيص المستخدمين', icon: '👤' },
];

export default function PermissionsScreen({ navigation }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const [tab, setTab] = useState('roles');

  return (
    <View style={s.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tabBar}
        contentContainerStyle={{ paddingHorizontal: spacing.sm, flexDirection: 'row' }}
      >
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabAct]} 
             onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTab(t.key); }}>
            <Text style={{ fontSize: 16 }}>{t.icon}</Text>
            <Text style={[s.tabTxt, tab === t.key && s.tabTxtAct]}>{t.label}</Text>
            {tab === t.key && <View style={s.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === 'roles' && <RolePermissionsTab s={s} />}
      {tab === 'users' && <UserPermissionsTab s={s} />}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// UI COMPONENT: PERMISSION CARD
// ─────────────────────────────────────────────────────────
function PermissionCard({ screen, perm, isOverridden, onToggle, onRemoveOverride, allowOverride, hasFallback, fallbackPerm, colors, spacing, radius, shadow }) {
  // Determine display values
  const displayPerm = perm || fallbackPerm || { can_view: false, can_add: false, can_edit: false, can_delete: false };
  const viewActive = displayPerm.can_view;
  const borderColor = isOverridden ? colors.green : colors.border;
  const bgColor = isOverridden ? colors.green + '0A' : colors.bg1;

  const handleSubToggle = (field) => {
    onToggle(field, displayPerm[field]);
  };

  return (
    <View style={{ backgroundColor: bgColor, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor, overflow: 'hidden' }}>
      
      {/* HEADER */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md }}>
        <Row style={{ gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isOverridden ? colors.green + '22' : colors.blue + '15', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 18 }}>{screen.icon}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: isOverridden ? colors.green : colors.t1 }}>{screen.label}</Text>
            {isOverridden && <Text style={{ fontSize: 11, color: colors.green, marginTop: 2 }}>مخصصة للمستخدم ✓</Text>}
          </View>
        </Row>
        
        <Row style={{ gap: 10 }}>
           {isOverridden ? (
              <TouchableOpacity onPress={onRemoveOverride} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.red + '15', borderRadius: radius.sm }}>
                <Text style={{ color: colors.red, fontSize: 12, fontWeight: 'bold' }}>إلغاء التخصيص ✕</Text>
              </TouchableOpacity>
           ) : allowOverride && !isOverridden ? (
              <TouchableOpacity onPress={() => onToggle('can_view', !viewActive)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.bg2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border2 }}>
                <Text style={{ color: colors.t3, fontSize: 12 }}>+ تخصيص الصلاحية</Text>
              </TouchableOpacity>
           ) : null}

           {(!allowOverride || isOverridden) && (
             <Switch 
               value={viewActive} 
               onValueChange={() => onToggle('can_view', viewActive)} 
               trackColor={{ false: colors.border, true: colors.blue }} 
             />
           )}
        </Row>
      </View>

      {/* BODY PROPS */}
      {viewActive && (!allowOverride || isOverridden) && (
        <View style={{ flexDirection: 'row', padding: spacing.sm, paddingTop: 0, gap: 5 }}>
          <SubSwitch label="إضافة ➕" value={displayPerm.can_add} onToggle={() => handleSubToggle('can_add')} color={colors.green} colors={colors} radius={radius} />
          <SubSwitch label="تعديل ✏️" value={displayPerm.can_edit} onToggle={() => handleSubToggle('can_edit')} color={colors.orange} colors={colors} radius={radius} />
          <SubSwitch label="حذف 🗑️" value={displayPerm.can_delete} onToggle={() => handleSubToggle('can_delete')} color={colors.red} colors={colors} radius={radius} />
        </View>
      )}
    </View>
  );
}

function SubSwitch({ label, value, onToggle, color, colors, radius }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg2, padding: 8, paddingHorizontal: 10, borderRadius: radius.sm }}>
      <Text style={{ fontSize: 12, color: colors.t2 }}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} trackColor={{ false: colors.border2, true: color }} style={{ transform: [{ scale: 0.7 }] }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// ROLE PERMISSIONS TAB
// ─────────────────────────────────────────────────────────
function RolePermissionsTab({ s }) {
  const { colors, spacing, radius, shadow } = useTheme();
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState('agent');
  const [permissions, setPermissions] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await getLocalPermissions('ROLE', selectedRole);
    const mapped = {};
    data.forEach(d => { mapped[d.screen_name] = d; });
    setPermissions(mapped);
    setLoading(false);
  }, [selectedRole]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleResetDefaults = () => {
    Alert.alert('استرجاع الافتراضي ⚠️', 'سيتم مسح كافة الصلاحيات وإعادة هذه الصفة لإعدادات المصنع المبرمجة للمشروع.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'نعم، استعادة', style: 'destructive', onPress: async () => {
        setLoading(true);
        await resetRolePermissionsToDefault(selectedRole);
        await loadData();
      }}
    ]);
  };

  const togglePermission = async (screenId, permType, currentValue) => {
    const existing = permissions[screenId] || { entity_type: 'ROLE', entity_id: selectedRole, screen_name: screenId, can_view: false, can_add: false, can_edit: false, can_delete: false };
    const updated = { ...existing, [permType]: !currentValue };
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPermissions(prev => ({ ...prev, [screenId]: updated }));
    try { await saveLocalPermission(updated); } catch (e) { loadData(); }
  };

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      {/* Roles Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 15 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.t1, alignSelf:'flex-start' }}>اختر الدور المطلوب تعديله:</Text>
        <TouchableOpacity onPress={handleResetDefaults} style={{ backgroundColor: colors.red + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.xl }}>
          <Text style={{ color: colors.red, fontSize: 12, fontWeight: 'bold' }}>↩️ إعادة للافتراضي</Text>
        </TouchableOpacity>
      </View>

      <Row style={{ marginBottom: spacing.lg, gap: 10 }}>
        {ROLES.map(role => {
          const active = selectedRole === role.id;
          return (
            <TouchableOpacity 
              key={role.id} 
              onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedRole(role.id); }}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 12,
                backgroundColor: active ? role.color : colors.bg2,
                borderRadius: radius.md, borderWidth: 1, 
                borderColor: active ? role.color : colors.border
              }}
            >
               <Text style={{ fontSize: 24, marginBottom: 5 }}>{role.icon}</Text>
               <Text style={{ color: active ? '#FFF' : colors.t2, fontSize: 13, fontWeight: active ? 'bold' : 'normal', textAlign: 'center' }}>
                 {role.label}
               </Text>
            </TouchableOpacity>
          );
        })}
      </Row>

      {loading ? <Loading /> : (
        <View>
          {SCREENS.map(screen => (
             <PermissionCard 
               key={screen.id} 
               screen={screen} 
               perm={permissions[screen.id]} 
               isOverridden={false}
               allowOverride={false}
               onToggle={(field, val) => togglePermission(screen.id, field, val)}
               colors={colors} spacing={spacing} radius={radius} shadow={shadow}
             />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────
// USER PERMISSIONS TAB 
// ─────────────────────────────────────────────────────────
function UserPermissionsTab({ s }) {
  const { colors, spacing, radius, shadow } = useTheme();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [permissions, setPermissions] = useState({});
  const [roleFallbacks, setRoleFallbacks] = useState({}); // To hold the user's base role permissions!

  const loadInitialData = useCallback(async () => {
    try {
      const uData = await getLocalUsers();
      const activeUsers = uData.filter(u => u.active !== 0).sort((a,b)=>a.name.localeCompare(b.name));
      setUsers(activeUsers);
      if (activeUsers.length > 0) setSelectedUser(activeUsers[0].id);
    } catch (e) { }
    setLoading(false);
  }, []);

  const loadUserPermissions = useCallback(async () => {
    if (!selectedUser) return;
    setLoading(true);
    
    const userObj = users.find(u => u.id === selectedUser);
    
    // 1. Load overrides specific to this user id
    const data = await getLocalPermissions('USER', selectedUser);
    const mapped = {};
    data.forEach(d => { mapped[d.screen_name] = d; });
    
    // 2. Load Fallbacks (Role permissions for this user)
    const roleBase = userObj?.role || 'agent';
    const roleData = await getLocalPermissions('ROLE', roleBase);
    const roleMapped = {};
    roleData.forEach(d => { roleMapped[d.screen_name] = d; });

    setRoleFallbacks(roleMapped);
    setPermissions(mapped);
    setLoading(false);
  }, [selectedUser, users]);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);
  useEffect(() => { loadUserPermissions(); }, [loadUserPermissions]);

  const togglePermission = async (screenId, permType, currentValue) => {
    // Determine the base state if it was completely blank (not overridden yet)
    let existing = permissions[screenId];
    if (!existing) {
       // Deep copy the role fallback so they inherit before overriding
       const fallback = roleFallbacks[screenId] || { can_view: false, can_add: false, can_edit: false, can_delete: false };
       existing = { ...fallback, entity_type: 'USER', entity_id: selectedUser, screen_name: screenId };
       delete existing.id; // clear ID so it forces an INSERT
    }
    
    const updated = { ...existing, [permType]: !currentValue };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPermissions(prev => ({ ...prev, [screenId]: updated }));
    
    try {
      await saveLocalPermission(updated);
      // reload lightly to get generated ID
      const freshData = await getLocalPermissions('USER', selectedUser);
      const m = {};
      freshData.forEach(d => { m[d.screen_name] = d; });
      setPermissions(m);
    } catch (e) {
      loadUserPermissions();
    }
  };

  const removeUserOverride = async (screenId) => {
    const id = permissions[screenId]?.id;
    if (id) {
       LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
       setPermissions(prev => {
          const next = { ...prev };
          delete next[screenId];
          return next;
       });
       await deleteLocalPermission(id);
    }
  };

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      {loading && !users.length ? <Loading /> : (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[s.label, { marginBottom: 12, fontSize: 16, fontWeight: '800' }]}>تخصيص صلاحيات استثنائية لمستخدم</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
            {users.map(u => {
              const active = selectedUser === u.id;
              const roleInfo = ROLES.find(r => r.id === u.role) || ROLES[2];
              return (
                <TouchableOpacity 
                  key={u.id} 
                  onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedUser(u.id); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 15, paddingVertical: 10,
                    backgroundColor: active ? colors.blue : colors.bg2,
                    borderRadius: radius.xl, marginRight: 10,
                    borderWidth: 1, borderColor: active ? colors.blue : colors.border
                  }}
                >
                   <Avatar name={u.name} size={30} color={active ? '#FFF' : roleInfo.color} />
                   <View>
                     <Text style={{ color: active ? '#FFF' : colors.t1, fontSize: 14, fontWeight: active ? 'bold' : 'normal' }}>{u.name}</Text>
                     <Text style={{ color: active ? '#FFF' : colors.t3, fontSize: 10 }}>{roleInfo.label}</Text>
                   </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      )}

      {selectedUser && (
        <View>
          <View style={{ backgroundColor: colors.orange + '15', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.orange + '30' }}>
            <Text style={{ fontSize: 24 }}>⚠️</Text>
            <Text style={{ color: colors.orange, lineHeight: 22, fontSize: 12, flex: 1, fontWeight: '600' }}>
              تعديلك هنا سيطغى (Override) على صفة المستخدم الأساسية وتعتبر كاستثناء مخصص له فقط. لإعادته لاحقاً لصلاحيات صفته استخدم (إلغاء التخصيص).
            </Text>
          </View>
          
          <View>
            {SCREENS.map(screen => {
              const p = permissions[screen.id];
              const isOverridden = !!p; // user has explicit row in DB
              const fallback = roleFallbacks[screen.id];

              return (
                 <PermissionCard 
                   key={screen.id} 
                   screen={screen} 
                   perm={p}
                   fallbackPerm={fallback}
                   isOverridden={isOverridden}
                   allowOverride={true}
                   onToggle={(field, val) => togglePermission(screen.id, field, val)}
                   onRemoveOverride={() => removeUserOverride(screen.id)}
                   colors={colors} spacing={spacing} radius={radius} shadow={shadow}
                 />
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
