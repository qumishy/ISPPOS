import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ActivityIndicator, TouchableOpacity,
  Image, ScrollView, Animated, StyleSheet, StatusBar, Modal, Alert,
} from 'react-native';

import { NavigationContainer, DrawerActions, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';

import { useAuth, ROLE_PERMISSIONS } from '../services/AuthContext';
import { useLoading } from '../services/LoadingContext';
import { subscribeDataChanges, getSetting } from '../services/database';
import { useTheme } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';

/* Screens */
import LoginScreen    from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AdminScreen    from '../screens/AdminScreen';
import PermissionsScreen from '../screens/PermissionsScreen';
import CashierScreen  from '../screens/CashierScreen';
import ReportsScreen  from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import UpdatesScreen from '../screens/UpdatesScreen';
import DiscountApprovalsScreen from '../screens/DiscountApprovalsScreen';

import { getLocalNotificationsBox, getPendingOfflineOperationsForUser, getLastProjectForUser } from '../services/database';
import { setupNotificationListeners } from '../services/NotificationService';
import { isSystemAdminUser } from '../services/systemAdminService';

import InvoicesScreen      from '../screens/InvoicesListScreen';
import CollectionsScreen   from '../screens/CollectionsListScreen';
import InventoryScreen     from '../screens/InventoryListScreen';
import POSScreen           from '../screens/POSListScreen';
import WalletsScreen       from '../screens/WalletsListScreen';
import SuppliesScreen      from '../screens/SuppliesListScreen';
import WalletDetailScreen  from '../screens/WalletDetailScreen';
import NotificationsScreen from '../screens/NotificationsListScreen';
import OperationsScreen from '../screens/OperationsScreen';

import NewInvoiceScreen   from '../screens/NewInvoiceScreen';
import NewCollectionScreen from '../screens/NewCollectionScreen';
import AssignWalletScreen  from '../screens/AssignWalletScreen';
import AddBatchScreen     from '../screens/AddBatchScreen';
import NewPOSScreen       from '../screens/NewPOSScreen';
import EditPOSScreen      from '../screens/EditPOSScreen';
import AboutScreen        from '../screens/AboutScreen';
import NewSupplyScreen    from '../screens/NewSupplyScreen';
import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';
import BatchStockDetailScreen from '../screens/BatchStockDetailScreen';
import PhaseReportScreen from '../screens/PhaseReportScreen';
import SystemAdminScreen from '../screens/SystemAdminScreen';

const Drawer = createDrawerNavigator();
const Tab    = createBottomTabNavigator();
const Stack  = createStackNavigator();

// ══════════════════════════════════════════════════════════════
//  HEADER
// ══════════════════════════════════════════════════════════════
function MenuButton({ navigation, colors }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }], marginLeft: 16 }}>
      <TouchableOpacity
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        style={[h.menuBtn, { backgroundColor: colors.bg2, borderColor: colors.border }]}
        activeOpacity={0.7}
      >
        <Feather name="menu" size={20} color={colors.t1} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function HeaderRight({ navigation, colors }) {
  const { user, projectId } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingOpsCount, setPendingOpsCount] = useState(0);

  useEffect(() => {
     const check = async () => {
         const notifs = await getLocalNotificationsBox(user?.id, projectId);
         setUnreadCount(notifs.filter(n => !n.is_read).length);
         const ops = await getPendingOfflineOperationsForUser(user?.id, { projectId });
         setPendingOpsCount((ops || []).filter(o => o.sync_status !== 'synced').length);
     };
     check();
     const unsub = subscribeDataChanges(e => {
        if (['notifications', 'operations_log', 'sync_queue', 'all'].includes(e.type)) check();
     });
     return unsub;
  }, [user?.id, projectId]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14, gap: 10 }}>
      {/* compact online status */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: colors.success + '30' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
        <Text style={{ fontSize: 9, color: colors.success, fontWeight: '800' }}>متصل</Text>
      </View>
      {/* notification bell */}
      <TouchableOpacity onPress={() => navigation.navigate('Operations')} style={{ position: 'relative', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
         <Feather name="activity" size={22} color={colors.t1} />
         {pendingOpsCount > 0 && (
           <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.warning, borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.card }}>
              <Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>{pendingOpsCount > 99 ? '99+' : pendingOpsCount}</Text>
           </View>
         )}
      </TouchableOpacity>
      {/* notification bell */}
      <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={{ position: 'relative', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
         <Feather name="bell" size={22} color={colors.t1} />
         {unreadCount > 0 && (
           <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.danger, borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.card }}>
              <Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
           </View>
         )}
      </TouchableOpacity>
    </View>
  );
}

function HeaderOptions(title, navigation, colors, fontSize, isLight) {
  return {
    title,
    headerStyle: {
      height: 68,
      elevation: 0, shadowOpacity: 0,
      backgroundColor: isLight ? colors.primary : colors.card,
      borderBottomWidth: isLight ? 0 : 1,
      borderBottomColor: colors.border,
    },
    headerTintColor: isLight ? '#FFFFFF' : colors.t1,
    headerTitleStyle: {
      fontFamily: 'IBMPlexSansArabic-Bold',
      fontWeight: '800',
      fontSize: fontSize.xl,
      letterSpacing: -0.3,
      color: isLight ? '#FFFFFF' : colors.t1
    },
    headerLeft: () => <MenuButton navigation={navigation} colors={colors} />,
    headerRight: () => <HeaderRight navigation={navigation} colors={colors} />,
  };
}

function SystemAdminHeaderActions() {
  const { logout } = useAuth();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={logout}
      style={{
        flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
        marginRight: 14, paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 12, borderWidth: 1, borderColor: colors.danger + '55',
        backgroundColor: colors.danger + '15',
      }}
    >
      <Feather name="log-out" size={16} color={colors.danger} />
      <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 12 }}>خروج</Text>
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════════════════════
//  PROJECT SWITCHER (drawer) — only for users with >1 cached project
// ══════════════════════════════════════════════════════════════
function DrawerProjectSwitcher() {
  const { user, project, cachedAllowedProjects, switchProject } = useAuth();
  const { colors, fontSize, isLight } = useTheme();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [selectedPid, setSelectedPid] = useState(null);
  const [lastPid, setLastPid] = useState(null);

  const projects = cachedAllowedProjects || [];

  useEffect(() => {
    let cancelled = false;
    getLastProjectForUser(user?.id).then((value) => {
      if (!cancelled) setLastPid(value?.project_id || null);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user || projects.length < 2) return null;

  const currentName = project?.project_name || '—';

  const openSheet = () => {
    setSelectedPid(project?.project_id || projects[0]?.project_id || null);
    setOpen(true);
  };

  const doSwitch = async (pid, acknowledgedWarning) => {
    if (!pid) return;
    setSwitching(true);
    try {
      const result = await switchProject(pid, { acknowledgedWarning: !!acknowledgedWarning });
      if (result.needsConfirm) {
        Alert.alert('تغيير المشروع', result.warning, [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'متابعة', onPress: () => { doSwitch(pid, true); } },
        ]);
        return;
      }
      if (!result.success) {
        Alert.alert('تنبيه', result.error || 'تعذر تغيير المشروع.');
        return;
      }
      setOpen(false);
      Alert.alert('تم', result.alreadyActive ? 'أنت على هذا المشروع بالفعل.' : 'تم تغيير المشروع بنجاح.');
    } catch (error) {
      Alert.alert('تنبيه', error?.message || 'تعذر تغيير المشروع.');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <View style={ps.wrap}>
      <Text style={[ps.label, { color: isLight ? 'rgba(255,255,255,0.85)' : colors.t2, fontSize: fontSize.xs }]}>
        المشروع الحالي
      </Text>
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={openSheet}
        style={[ps.button, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Feather name="refresh-cw" size={15} color={colors.primary} />
        <Text style={[ps.buttonText, { color: colors.t1, fontSize: fontSize.sm }]} numberOfLines={1}>
          {currentName}
        </Text>
        <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>تغيير المشروع</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => !switching && setOpen(false)}>
        <View style={d.phaseModalRoot} pointerEvents="box-none">
          <TouchableOpacity activeOpacity={1} style={d.phaseBackdrop} onPress={() => !switching && setOpen(false)} />
          <View style={[ps.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={ps.sheetHeader}>
              <Text style={{ color: colors.t1, fontWeight: '800', fontSize: fontSize.md }}>اختر المشروع</Text>
              <TouchableOpacity onPress={() => setOpen(false)} disabled={switching}>
                <Feather name="x" size={20} color={colors.t2} />
              </TouchableOpacity>
            </View>
            <ScrollView nestedScrollEnabled style={ps.listScroll}>
              {projects.map((item) => {
                const isSelected = String(selectedPid) === String(item.project_id);
                const isCurrent = user?.project_id && String(item.project_id) === String(user.project_id);
                const isLast = lastPid && String(item.project_id) === String(lastPid);
                return (
                  <TouchableOpacity
                    key={String(item.project_id)}
                    activeOpacity={0.82}
                    onPress={() => setSelectedPid(item.project_id)}
                    style={[
                      ps.row,
                      { backgroundColor: isSelected ? colors.primary + '14' : colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View style={ps.rowMain}>
                      <View style={ps.rowTitleWrap}>
                        <Text style={{ color: isSelected ? colors.primary : colors.t1, fontWeight: '800', fontSize: fontSize.sm, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                          {item.project_name}
                        </Text>
                        {isCurrent ? (
                          <View style={[ps.badge, { backgroundColor: colors.success + '18' }]}>
                            <Text style={{ color: colors.success, fontSize: 10, fontWeight: '800' }}>الحالية</Text>
                          </View>
                        ) : null}
                        {isLast ? (
                          <View style={[ps.badge, { backgroundColor: colors.primary + '14' }]}>
                            <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>آخر مشروع مستخدم</Text>
                          </View>
                        ) : null}
                      </View>
                      {item.license_number ? (
                        <Text style={{ color: colors.t3, fontSize: 11, textAlign: 'right' }}>رقم الترخيص: {item.license_number}</Text>
                      ) : null}
                    </View>
                    <View style={[ps.radio, isSelected && { borderColor: colors.primary }]}>
                      {isSelected ? <View style={[ps.radioDot, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[ps.enterBtn, { backgroundColor: colors.primary }, switching && { opacity: 0.6 }]}
              onPress={() => doSwitch(selectedPid)}
              disabled={switching || !selectedPid}
            >
              {switching
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: fontSize.sm }}>الدخول إلى المشروع</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ps = {
  wrap: { marginTop: 10, alignSelf: 'center', width: '92%', zIndex: 4999 },
  label: { fontFamily: 'IBMPlexSansArabic-SemiBold', marginBottom: 7, textAlign: 'right' },
  button: {
    height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    elevation: 3,
  },
  buttonText: { flex: 1, textAlign: 'right', fontFamily: 'IBMPlexSansArabic-Bold' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '75%', borderWidth: 1,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  listScroll: { maxHeight: 380 },
  row: {
    marginHorizontal: 14, marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
  },
  rowMain: { flex: 1, gap: 3 },
  rowTitleWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(128,128,128,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  enterBtn: { marginHorizontal: 14, marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
};

// ══════════════════════════════════════════════════════════════
//  STACKS
// ══════════════════════════════════════════════════════════════
function createStack(Component, name, title) {
  return function StackWrapper({ navigation }) {
    const { colors, fontSize, isLight } = useTheme();
    const commonHeaderOptions = {
      headerTintColor: isLight ? '#FFFFFF' : colors.t1,
      headerStyle: { 
        backgroundColor: isLight ? colors.primary : colors.card,
        borderBottomColor: colors.border, 
        borderBottomWidth: isLight ? 0 : 1 
      }
    };

    return (
      <Stack.Navigator>
        <Stack.Screen name={name} component={Component} options={HeaderOptions(title, navigation, colors, fontSize, isLight)} />
        <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'تفاصيل الفاتورة', ...commonHeaderOptions }} />
        <Stack.Screen name="NewInvoice" component={NewInvoiceScreen} options={{ title: 'فاتورة جديدة', ...commonHeaderOptions }} />
        <Stack.Screen name="NewCollection" component={NewCollectionScreen} options={{ title: 'إضافة تحصيل', ...commonHeaderOptions }} />
        <Stack.Screen name="AddBatch" component={AddBatchScreen} options={{ title: 'إضافة دفعة', ...commonHeaderOptions }} />
        <Stack.Screen name="NewPOS" component={NewPOSScreen} options={{ title: 'إضافة نقطة', ...commonHeaderOptions }} />
        <Stack.Screen name="EditPOS" component={EditPOSScreen} options={{ title: 'تعديل نقطة', ...commonHeaderOptions }} />
        <Stack.Screen name="AssignWallet" component={AssignWalletScreen} options={{ title: 'توزيع أوراق', ...commonHeaderOptions }} />
        <Stack.Screen name="WalletDetail" component={WalletDetailScreen} options={{ title: 'حركة المحفظة', ...commonHeaderOptions }} />
        <Stack.Screen name="BatchStockDetail" component={BatchStockDetailScreen} options={{ title: 'تقرير التوزيع', ...commonHeaderOptions }} />
        <Stack.Screen name="PhaseReport" component={PhaseReportScreen} options={{ title: 'تقرير المرحلة', ...commonHeaderOptions }} />
        <Stack.Screen name="NewSupply" component={NewSupplyScreen} options={{ title: 'توريد جديد', ...commonHeaderOptions }} />
        <Stack.Screen name="Updates" component={UpdatesScreen} options={{ title: 'التحديثات', ...commonHeaderOptions }} />
      </Stack.Navigator>
    );
  };
}

const DashboardStack = createStack(DashboardScreen, 'DashboardMain', 'الرئيسية');
const InvoicesStack = createStack(InvoicesScreen, 'InvoicesMain', 'الفواتير');
const CollectionsStack = createStack(CollectionsScreen, 'CollectionsMain', 'التحصيلات');
const InventoryStack = createStack(InventoryScreen, 'InventoryMain', 'المخزون');
const POSStack = createStack(POSScreen, 'POSMain', 'نقاط البيع');
const WalletsStack = createStack(WalletsScreen, 'WalletsMain', 'المحافظ');
const ReportsStack = createStack(ReportsScreen, 'ReportsMain', 'الاستعلامات');
const DiscountApprovalsStack = createStack(DiscountApprovalsScreen, 'DiscountApprovalsMain', 'اعتماد الخصومات');
const AdminStack = createStack(AdminScreen, 'AdminMain', 'الإدارة');
const PermissionsStack = createStack(PermissionsScreen, 'PermissionsMain', 'إدارة الصلاحيات');
const CashierStack = createStack(CashierScreen, 'CashierMain', 'اعتماد التحصيلات');
const SettingsStack = createStack(SettingsScreen, 'SettingsMain', 'الإعدادات العامة');
const SuppliesStack = createStack(SuppliesScreen, 'SuppliesMain', 'التوريدات المالية');


// ══════════════════════════════════════════════════════════════
//  BOTTOM TABS
// ══════════════════════════════════════════════════════════════
function AnimatedTabIcon({ iconName, label, focused, colors }) {
  const scale = useRef(new Animated.Value(focused ? 1.05 : 1)).current;
  useEffect(() => { Animated.spring(scale, { toValue: focused ? 1.1 : 1, useNativeDriver: true }).start(); }, [focused]);
  return (
    <View style={t.tabIconWrap}>
      <Animated.View style={[t.tabPill, { backgroundColor: focused ? colors.primary + '17' : 'transparent', transform: [{ scale }] }]}> 
        <Feather name={iconName} size={22} color={focused ? colors.primary : colors.t3} />
      </Animated.View>
      <Text style={[t.tabLabel, { color: focused ? colors.primary : colors.t3, fontWeight: focused ? '800' : '600' }]}>{label}</Text>
    </View>
  );
}

function BottomTabs() {
  const { user, canAccess } = useAuth();
  if (!user) return null;
  const { colors, spacing, isLight } = useTheme();
  const isAdmin = user?.role === 'admin';
  const canUseApprovals = isAdmin || user?.role === 'manager' || canAccess('approve_card_returns');

  const tabs = [
    { name: 'DashboardTab',   component: DashboardStack,   icon: 'grid', label: 'الرئيسية', available: canAccess('Dashboard'), visible: true },
    { name: 'InvoicesTab',    component: InvoicesStack,    icon: 'file-text', label: 'الفواتير', available: canAccess('Invoices'), visible: true },
    { name: 'CollectionsTab', component: CollectionsStack, icon: 'dollar-sign', label: 'التحصيل', available: canAccess('Collections'), visible: true },
    { name: 'CashierTab',     component: CashierStack,     icon: 'check-circle', label: 'الاعتماد', available: !isAdmin && canAccess('CashierApproval'), visible: true },
    { name: 'WalletsTab',     component: WalletsStack,     icon: 'briefcase', label: 'المحافظ', available: canAccess('Wallets'), visible: true },
    
    // Hidden from bottom tab bar, accessed via drawer only:
    { name: 'InventoryTab',   component: InventoryStack,   icon: 'package', available: canAccess('Inventory'), visible: false },
    { name: 'POSTab',         component: POSStack,         icon: 'monitor', available: canAccess('POS'), visible: false },
    { name: 'ReportsTab',     component: ReportsStack,     icon: 'bar-chart-2', available: canAccess('Reports'), visible: false },
    { name: 'DiscountApprovalsTab', component: DiscountApprovalsStack, icon: 'percent', available: canUseApprovals, visible: false },
    { name: 'AdminTab',       component: AdminStack,       icon: 'settings', available: isAdmin, visible: false },
    { name: 'PermissionsTab', component: PermissionsStack, icon: 'shield', available: isAdmin, visible: false },
    { name: 'SuppliesTab',    component: SuppliesStack,    icon: 'credit-card', available: canAccess('Supplies'), visible: false },
    { name: 'SettingsTab',    component: SettingsStack,    icon: 'sliders', available: canAccess('Settings'), visible: false },
  ];
  const availableTabs = tabs.filter(item => item.available);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1, borderTopColor: colors.border,
          height: 80, paddingBottom: 20, paddingTop: 10,
          elevation: 20,
          shadowColor: '#000', shadowOffset: { width:0, height:-4 }, shadowOpacity: 0.05, shadowRadius: 10,
        },
        tabBarShowLabel: false,
      }}
    >
      {availableTabs.map(item => (
        <Tab.Screen key={item.name} name={item.name} component={item.component}
          options={item.visible ? { tabBarIcon: ({ focused }) => <AnimatedTabIcon iconName={item.icon} label={item.label} focused={focused} colors={colors} /> } : { tabBarButton: () => null }}
        />
      ))}
    </Tab.Navigator>
  );
}

// ══════════════════════════════════════════════════════════════
//  CUSTOM DRAWER
// ══════════════════════════════════════════════════════════════
function DrawerPhaseSelector({ allPhases, selectedPhase, setSelectedPhase, colors, fontSize, isLight }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = selectedPhase?.name || 'اختر المرحلة...';

  const phaseStatusLabel = (phase) => {
    if (selectedPhase?.id === phase.id) return 'الحالية';
    if (phase.status === 'closed') return 'مغلقة - عرض فقط';
    return 'نشطة';
  };

  const handleSelect = (phase) => {
    setSelectedPhase(phase);
    setOpen(false);
  };

  return (
    <View style={d.phaseWrap}>
      <Text style={[d.phaseLabel, { color: isLight ? 'rgba(255,255,255,0.85)' : colors.t2, fontSize: fontSize.xs }]}>المرحلة الحالية</Text>
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => setOpen(true)}
        style={[d.phaseButton, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Feather name="chevron-down" size={16} color={colors.t3} />
        <Text style={[d.phaseButtonText, { color: colors.t1, fontSize: fontSize.sm }]} numberOfLines={1}>{selectedLabel}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={d.phaseModalRoot} pointerEvents="box-none">
          <TouchableOpacity activeOpacity={1} style={d.phaseBackdrop} onPress={() => setOpen(false)} />
          <View
            style={[
              d.phaseMenu,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: '#000',
              },
            ]}
          >
            <ScrollView nestedScrollEnabled style={d.phaseMenuScroll} contentContainerStyle={d.phaseMenuContent}>
              {allPhases.map(phase => {
                const isSelected = selectedPhase?.id === phase.id;
                const isClosed = phase.status === 'closed';
                return (
                  <TouchableOpacity
                    key={phase.id}
                    activeOpacity={0.82}
                    onPress={() => handleSelect(phase)}
                    style={[
                      d.phaseRow,
                      {
                        backgroundColor: isSelected ? colors.primary + '12' : colors.card,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={d.phaseStatusWrap}>
                      {isSelected && <Feather name="check" size={15} color={colors.primary} />}
                      {isClosed && !isSelected && <Feather name="lock" size={13} color={colors.warning} />}
                      <Text style={{ color: isClosed ? colors.warning : (isSelected ? colors.primary : colors.t3), fontSize: 10, fontWeight: '800' }}>
                        {phaseStatusLabel(phase)}
                      </Text>
                    </View>
                    <Text style={[d.phaseRowText, { color: isSelected ? colors.primary : colors.t1, fontSize: fontSize.sm }]} numberOfLines={1}>
                      {phase.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CustomDrawer({ navigation, state }) {
  const { user, logout, canAccess, selectedPhase, setSelectedPhase, allPhases } = useAuth();
  const { colors, fontSize, isLight } = useTheme();
  const isAdmin = user?.role === 'admin';
  const isSystemAdmin = isSystemAdminUser(user);
  const currentRoute = state?.routeNames[state.index];

  const allItems = [
    { route: 'DashboardTab', label: 'الرئيسية', icon: 'grid', permission: 'Dashboard' },
    { route: 'InvoicesTab', label: 'الفواتير', icon: 'file-text', permission: 'Invoices' },
    { route: 'CollectionsTab', label: 'التحصيلات', icon: 'dollar-sign', permission: 'Collections' },
    { route: 'CashierTab', label: 'اعتماد التحصيل', icon: 'check-circle', permission: 'CashierApproval', hideForAdmin: true },
    { route: 'InventoryTab', label: 'المخزون', icon: 'package', permission: 'Inventory' },
    { route: 'POSTab', label: 'نقاط البيع', icon: 'monitor', permission: 'POS' },
    { route: 'WalletsTab', label: 'المحافظ', icon: 'briefcase', permission: 'Wallets' },
    { route: 'SuppliesTab', label: 'التوريدات المالية', icon: 'credit-card', permission: 'Supplies' },
    { route: 'ReportsTab', label: 'الاستعلامات', icon: 'bar-chart-2', permission: 'Reports' },
    { route: 'DiscountApprovalsTab', label: 'اعتماد الخصومات', icon: 'percent', permission: 'Admin', altPermission: 'approve_card_returns', allowRoles: ['manager'] },
    { route: 'AdminTab', label: 'الإدارة', icon: 'settings', permission: 'Admin', adminOnly: true },
    { route: 'PermissionsTab', label: 'إدارة الصلاحيات', icon: 'shield', permission: 'Admin', adminOnly: true },
    { route: 'SystemAdmin', label: 'إدارة النظام', icon: 'shield', systemAdminOnly: true },
    { route: 'About', label: 'حول و اتصل بنا', icon: 'info', permission: 'About' },
    { route: 'SettingsTab', label: 'الإعدادات العامة', icon: 'sliders', permission: 'Settings' },
  ];

  const items = allItems.filter(i => {
    if (i.systemAdminOnly) return isSystemAdmin;
    if (isAdmin && i.hideForAdmin) return false;
    if (i.adminOnly) return isAdmin;
    return canAccess(i.permission) || (i.altPermission && canAccess(i.altPermission)) || (i.allowRoles || []).includes(user?.role);
  });

  return (
    <View style={[d.screen, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.t1 === '#FFFFFF' ? "light-content" : "dark-content"} backgroundColor={colors.bg} />
      <View 
        style={[d.header, { backgroundColor: isLight ? colors.primary : colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}
      >
        <View style={d.userRow}>
          <View style={[d.userAvatar, { backgroundColor: isLight ? 'rgba(255,255,255,0.2)' : colors.bg2, borderColor: isLight ? 'rgba(255,255,255,0.4)' : colors.border }]}>
            <Feather name="user" size={26} color={isLight ? '#FFFFFF' : colors.primary} />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Text style={[d.userName, { color: isLight ? '#FFFFFF' : colors.t1, fontSize: fontSize.xl }]}>{user?.name || 'مستخدم'}</Text>
            <View style={{ backgroundColor: isLight ? 'rgba(255,255,255,0.2)' : colors.primary + '15', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 6, borderWidth: 1, borderColor: isLight ? 'rgba(255,255,255,0.4)' : colors.primary + '30' }}>
              <Text style={{ color: isLight ? '#FFFFFF' : colors.primary, fontSize: fontSize.xs, fontWeight: '800' }}>{ROLE_PERMISSIONS[user?.role]?.label || user?.role}</Text>
            </View>
          </View>
        </View>
        
        {/* Phase Selector */}
        {allPhases && allPhases.length > 0 && (
          <DrawerPhaseSelector
            allPhases={allPhases}
            selectedPhase={selectedPhase}
            setSelectedPhase={setSelectedPhase}
            colors={colors}
            fontSize={fontSize}
            isLight={isLight}
          />
        )}

        {/* Project Switcher (multi-project users only) */}
        <DrawerProjectSwitcher />
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        {items.map((item, i) => {
          const active = currentRoute === item.route;
          return (
            <TouchableOpacity 
              key={i} 
              style={[d.item, active && { backgroundColor: colors.primary + '10' }]}
              onPress={() => {
                navigation.dispatch(DrawerActions.closeDrawer());
                if (item.route === 'About' || item.route === 'Notifications' || item.route === 'SystemAdmin') {
                  navigation.navigate(item.route);
                } else {
                  navigation.navigate('MainTabs', { screen: item.route });
                }
              }}
            >
              <View style={[d.itemIcon, { backgroundColor: active ? colors.primary + '20' : colors.bg2 }]}> 
                <Feather name={item.icon} size={20} color={active ? colors.primary : colors.t2} />
              </View>
              <Text style={[d.itemLabel, { color: active ? colors.primary : colors.t2, fontWeight: active ? '800' : '600', fontSize: fontSize.md }]}>{item.label}</Text>
              {active && <View style={[d.activeBar, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'transparent' }}>
        <TouchableOpacity style={[d.logoutBtn, { backgroundColor: isLight ? '#FFFFFF' : colors.bg2, borderColor: colors.border }]} onPress={logout}>
          <Feather name="log-out" size={20} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: '800', fontSize: fontSize.md }}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MainDrawer() {
  return (
    <Drawer.Navigator drawerContent={(props) => <CustomDrawer {...props} />} screenOptions={{ headerShown: false, drawerPosition: 'right' }}>
      <Drawer.Screen name="MainTabs" component={BottomTabs} />
    </Drawer.Navigator>
  );
}

export default function AppNavigator() {
  const { user, projectId, loading, selectedPhase, dbReady, initialSyncReady, initialSyncInProgress, startupError, offlineMode, retryInitialSync, logout, canAccess, isSystemAdmin } = useAuth();
  const { message: loadingMessage, progress: loadingPercent } = useLoading();
  const { isDark, colors, fontSize } = useTheme();
  const navigationRef = useRef();
  const [historicalSyncStatus, setHistoricalSyncStatus] = useState(null);

  useEffect(() => {
    if (user && initialSyncReady) {
      getSetting('historical_sync_started').then(s => {
        if (s === '1') {
          getSetting('historical_sync_completed').then(c => {
            if (c !== '1') setHistoricalSyncStatus('syncing');
          });
        }
      });
      return subscribeDataChanges(({ type }) => {
        if (type === 'historical_sync_started') setHistoricalSyncStatus('syncing');
        else if (type === 'historical_sync_completed') setHistoricalSyncStatus('completed');
        else if (type === 'historical_sync_failed') setHistoricalSyncStatus('failed');
      });
    }
  }, [user, initialSyncReady]);

  useEffect(() => {
    if (user) {
      const cleanup = setupNotificationListeners(navigationRef);
      return cleanup;
    }
  }, [user]);

  if (loading || !dbReady) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}><ActivityIndicator size="large" color={colors.primary} /><Text style={{ marginTop: 12, color: colors.t2, fontSize: 14 }}>جاري تهيئة قاعدة البيانات...</Text></View>;

  if (user && !initialSyncReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, padding: 20 }}>
        {initialSyncInProgress ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 14, color: colors.t1, fontSize: 16, fontFamily: 'IBMPlexSansArabic-Bold', textAlign: 'center' }}>
              {loadingMessage || 'جاري جلب البيانات...'}
            </Text>
            {loadingPercent !== null && (
              <View style={{ width: '80%', height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 16, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${loadingPercent}%`, backgroundColor: colors.primary, borderRadius: 3 }} />
              </View>
            )}
          </>
        ) : (
          <>
            <Feather name="wifi-off" size={34} color={colors.danger} />
            <Text style={{ marginTop: 14, color: colors.danger, fontSize: 15, fontFamily: 'IBMPlexSansArabic-Bold', textAlign: 'center' }}>
              {startupError || 'تعذر تحميل البيانات الأولية.'}
            </Text>
            <Text style={{ marginTop: 8, color: colors.t3, fontSize: 13, textAlign: 'center' }}>
              فشل جلب البيانات، تحقق من الاتصال ثم أعد المحاولة
            </Text>
            <TouchableOpacity 
              onPress={() => retryInitialSync?.()}
              style={{ marginTop: 24, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Feather name="refresh-cw" size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontFamily: 'IBMPlexSansArabic-Bold', fontSize: 14 }}>إعادة المحاولة</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={logout}
              style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.danger, fontFamily: 'IBMPlexSansArabic-SemiBold', fontSize: 14 }}>تسجيل الخروج</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={selectedPhase?.status === 'closed' ? colors.danger : colors.card} />
      {user && offlineMode && (
        <View style={{ backgroundColor: colors.warning, paddingTop: StatusBar.currentHeight || 28, paddingBottom: 8, alignItems: 'center', zIndex: 9999, elevation: 10 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: 'IBMPlexSansArabic-Bold', fontSize: fontSize.sm }}>وضع عدم الاتصال - يتم عرض البيانات المحلية</Text>
        </View>
      )}
      {user && historicalSyncStatus === 'syncing' && (
        <View style={{ backgroundColor: colors.primary, paddingTop: offlineMode ? 8 : (StatusBar.currentHeight || 40), paddingBottom: 8, alignItems: 'center', zIndex: 9998, elevation: 9 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: 'IBMPlexSansArabic-Medium', fontSize: fontSize.sm }}>جاري مزامنة المراحل السابقة (بالخلفية)...</Text>
        </View>
      )}
      {user && historicalSyncStatus === 'failed' && (
        <View style={{ backgroundColor: colors.danger, paddingTop: offlineMode ? 8 : (StatusBar.currentHeight || 40), paddingBottom: 8, alignItems: 'center', zIndex: 9998, elevation: 9, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: 'IBMPlexSansArabic-Medium', fontSize: fontSize.sm }}>تعذر إكمال مزامنة المراحل السابقة</Text>
          <TouchableOpacity onPress={() => { setHistoricalSyncStatus('syncing'); retryInitialSync?.(); }}>
            <Feather name="refresh-cw" size={14} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}
      {user && selectedPhase?.status === 'closed' && (
        <View style={{ backgroundColor: colors.danger, paddingTop: StatusBar.currentHeight || 40, paddingBottom: 10, alignItems: 'center', zIndex: 9999, elevation: 10 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: 'IBMPlexSansArabic-Bold', fontSize: fontSize.sm }}>وضع القراءة فقط - المرحلة مغلقة ({selectedPhase.name})</Text>
        </View>
      )}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (isSystemAdmin && !projectId) ? (
          <>
            <Stack.Screen
              name="SystemAdminHome"
              component={SystemAdminScreen}
              options={{
                headerShown: true,
                title: 'إدارة النظام',
                headerTintColor: colors.t1,
                headerTitleStyle: { fontFamily: 'IBMPlexSansArabic-Bold', fontWeight: '800', fontSize: fontSize.xl },
                headerStyle: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 },
                headerLeft: () => null,
                headerRight: () => <SystemAdminHeaderActions />,
              }}
            />
            <Stack.Screen name="Operations" component={OperationsScreen} options={{ headerShown: true, title: 'العمليات', headerTintColor: colors.t1, headerStyle: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 } }} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainApp" component={MainDrawer} />
            {canAccess('About') && <Stack.Screen name="About" component={AboutScreen} options={{ headerShown: true, title: 'حول اتصل بنا', headerTintColor: colors.t1, headerStyle: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 } }} />}
            {isSystemAdmin && <Stack.Screen name="SystemAdmin" component={SystemAdminScreen} options={{ headerShown: true, title: 'إدارة النظام', headerTintColor: colors.t1, headerStyle: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 } }} />}
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: true, title: 'الإشعارات الذكية', headerTintColor: colors.t1, headerStyle: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 } }} />
            <Stack.Screen name="Operations" component={OperationsScreen} options={{ headerShown: true, title: 'العمليات', headerTintColor: colors.t1, headerStyle: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 } }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const h = StyleSheet.create({
  menuBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
const t = StyleSheet.create({
  tabIconWrap: { alignItems: 'center', gap: 4 },
  tabPill: { width: 48, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, letterSpacing: 0.1, fontFamily: 'IBMPlexSansArabic-SemiBold' },
});
const d = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: 24, paddingTop: 64, overflow: 'visible' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  userAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  userName: { fontWeight: '900', letterSpacing: -0.3, fontFamily: 'IBMPlexSansArabic-Bold' },
  phaseWrap: { marginTop: 18, alignSelf: 'center', width: '92%', zIndex: 5000, elevation: 20 },
  phaseLabel: { fontFamily: 'IBMPlexSansArabic-SemiBold', marginBottom: 7, textAlign: 'right' },
  phaseButton: {
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  phaseButtonText: { flex: 1, textAlign: 'right', marginHorizontal: 8, fontFamily: 'IBMPlexSansArabic-Bold' },
  phaseModalRoot: { flex: 1, zIndex: 9999, elevation: 9999 },
  phaseBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.08)' },
  phaseMenu: {
    position: 'absolute',
    top: 178,
    right: 18,
    width: '88%',
    maxWidth: 320,
    maxHeight: 210,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 10000,
    elevation: 30,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  phaseMenuScroll: { maxHeight: 210 },
  phaseMenuContent: { paddingVertical: 4 },
  phaseRow: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseRowText: { flex: 1, textAlign: 'right', fontFamily: 'IBMPlexSansArabic-SemiBold' },
  phaseStatusWrap: { minWidth: 82, flexDirection: 'row', alignItems: 'center', gap: 4 },
  item: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 12, marginVertical: 4, borderRadius: 14, position: 'relative' },
  itemIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 16 },
  itemLabel: { flex: 1, textAlign: 'right' },
  activeBar: { position: 'absolute', right: 0, width: 4, height: '50%', borderRadius: 2 },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, padding: 16, borderRadius: 14 },
});
