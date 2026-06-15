import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ActivityIndicator, TouchableOpacity,
  Image, ScrollView, Animated, StyleSheet, StatusBar,
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
import LicenseScreen  from '../screens/LicenseScreen';
import LoginScreen    from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AdminScreen    from '../screens/AdminScreen';
import PermissionsScreen from '../screens/PermissionsScreen';
import CashierScreen  from '../screens/CashierScreen';
import ReportsScreen  from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import UpdatesScreen from '../screens/UpdatesScreen';
import DiscountApprovalsScreen from '../screens/DiscountApprovalsScreen';

import { getLocalNotificationsBox, getPendingOfflineOperationsForUser } from '../services/database';
import { setupNotificationListeners } from '../services/NotificationService';

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
  const { colors, spacing, isLight } = useTheme();
  const isAdmin = user?.role === 'admin';

  const tabs = [
    { name: 'DashboardTab',   component: DashboardStack,   icon: 'grid', label: 'الرئيسية', visible: canAccess('Dashboard')  },
    { name: 'InvoicesTab',    component: InvoicesStack,    icon: 'file-text', label: 'الفواتير', visible: canAccess('Invoices') },
    { name: 'CollectionsTab', component: CollectionsStack, icon: 'dollar-sign', label: 'التحصيل', visible: canAccess('Collections') },
    { name: 'CashierTab',     component: CashierStack,     icon: 'check-circle', label: 'الاعتماد', visible: !isAdmin && canAccess('CashierApproval') },
    { name: 'WalletsTab',     component: WalletsStack,     icon: 'briefcase', label: 'المحافظ', visible: canAccess('Wallets') },
    
    // Hidden from bottom tab bar, accessed via drawer only:
    { name: 'InventoryTab',   component: InventoryStack,   icon: 'package', visible: false },
    { name: 'POSTab',         component: POSStack,         icon: 'monitor', visible: false },
    { name: 'ReportsTab',     component: ReportsStack,     icon: 'bar-chart-2', visible: false },
    { name: 'DiscountApprovalsTab', component: DiscountApprovalsStack, icon: 'percent', visible: false },
    { name: 'AdminTab',       component: AdminStack,       icon: 'settings', visible: false },
    { name: 'PermissionsTab', component: PermissionsStack, icon: 'shield', visible: false },
    { name: 'SuppliesTab',    component: SuppliesStack,    icon: 'credit-card', visible: false },
    { name: 'SettingsTab',    component: SettingsStack,    icon: 'sliders', visible: false },
  ];
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
      {tabs.map(item => (
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
function CustomDrawer({ navigation, state }) {
  const { user, logout, canAccess, selectedPhase, setSelectedPhase, allPhases } = useAuth();
  const { colors, fontSize, isLight } = useTheme();
  const isAdmin = user?.role === 'admin';
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
    { route: 'DiscountApprovalsTab', label: 'اعتماد الخصومات', icon: 'percent', permission: 'Admin' },
    { route: 'AdminTab', label: 'الإدارة', icon: 'settings', permission: 'Admin' },
    { route: 'PermissionsTab', label: 'إدارة الصلاحيات', icon: 'shield', permission: 'Admin' }, 
    { route: 'About', label: 'حول و اتصل بنا', icon: 'info', permission: 'About' },
    { route: 'SettingsTab', label: 'الإعدادات العامة', icon: 'sliders', permission: 'Settings' },
  ];

  const items = allItems.filter(i => {
    if (isAdmin && i.hideForAdmin) return false;
    return canAccess(i.permission);
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
          <View style={{ marginTop: 20 }}>
            <Text style={{ color: isLight ? 'rgba(255,255,255,0.8)' : colors.t2, fontSize: fontSize.xs, fontFamily: 'IBMPlexSansArabic-SemiBold', marginBottom: 8, textAlign: 'right' }}>السياق الحالي (المرحلة):</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', paddingRight: 4 }}>
              {allPhases.map(p => {
                const isSelected = selectedPhase?.id === p.id;
                return (
                  <TouchableOpacity 
                    key={p.id} 
                    onPress={() => setSelectedPhase(p)} 
                    style={{ 
                      backgroundColor: isSelected ? colors.primary : (isLight ? 'rgba(255,255,255,0.2)' : colors.bg2), 
                      paddingHorizontal: 14, 
                      paddingVertical: 8, 
                      borderRadius: 10, 
                      marginLeft: 8, 
                      borderWidth: 1, 
                      borderColor: isSelected ? colors.primary : (isLight ? 'rgba(255,255,255,0.4)' : colors.border) 
                    }}
                  >
                    <Text style={{ color: isSelected ? '#FFFFFF' : (isLight ? '#FFFFFF' : colors.t1), fontSize: fontSize.xs, fontFamily: isSelected ? 'IBMPlexSansArabic-Bold' : 'IBMPlexSansArabic-Medium' }}>
                      {p.name} {p.status === 'closed' ? '🔒' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
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
                if (item.route === 'About' || item.route === 'Notifications') {
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
  const { user, projectId, loading, selectedPhase, dbReady, initialSyncReady, initialSyncInProgress, startupError, offlineMode, retryInitialSync, logout } = useAuth();
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
        {!projectId ? (
          <Stack.Screen name="License" component={LicenseScreen} />
        ) : !user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainApp" component={MainDrawer} />
            <Stack.Screen name="About" component={AboutScreen} options={{ headerShown: true, title: 'حول اتصل بنا', headerTintColor: colors.t1, headerStyle: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 } }} />
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
  header: { padding: 24, paddingTop: 64 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  userAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  userName: { fontWeight: '900', letterSpacing: -0.3, fontFamily: 'IBMPlexSansArabic-Bold' },
  item: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 12, marginVertical: 4, borderRadius: 14, position: 'relative' },
  itemIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 16 },
  itemLabel: { flex: 1, textAlign: 'right' },
  activeBar: { position: 'absolute', right: 0, width: 4, height: '50%', borderRadius: 2 },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, padding: 16, borderRadius: 14 },
});
