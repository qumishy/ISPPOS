import SyncScreen from '../screens/SyncScreen';
import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ActivityIndicator, TouchableOpacity,
  Image, ScrollView, Animated, StyleSheet, StatusBar,
} from 'react-native';

import { NavigationContainer, DrawerActions, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth, ROLE_PERMISSIONS } from '../services/AuthContext';
import { useTheme } from '../theme';

/* Screens */
import LoginScreen    from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AdminScreen    from '../screens/AdminScreen';
import PermissionsScreen from '../screens/PermissionsScreen';
import CashierScreen  from '../screens/CashierScreen';
import ReportsScreen  from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';

import { getLocalNotificationsBox, subscribeDataChanges } from '../services/database';

import InvoicesScreen      from '../screens/InvoicesListScreen';
import CollectionsScreen   from '../screens/CollectionsListScreen';
import InventoryScreen     from '../screens/InventoryListScreen';
import POSScreen           from '../screens/POSListScreen';
import WalletsScreen       from '../screens/WalletsListScreen';
import SuppliesScreen      from '../screens/SuppliesListScreen';
import WalletDetailScreen  from '../screens/WalletDetailScreen';
import NotificationsScreen from '../screens/NotificationsListScreen';

import NewInvoiceScreen   from '../screens/NewInvoiceScreen';
import NewCollectionScreen from '../screens/NewCollectionScreen';
import AssignWalletScreen  from '../screens/AssignWalletScreen';
import AddBatchScreen     from '../screens/AddBatchScreen';
import NewPOSScreen       from '../screens/NewPOSScreen';
import EditPOSScreen      from '../screens/EditPOSScreen';
import AboutScreen        from '../screens/AboutScreen';
import NewSupplyScreen    from '../screens/NewSupplyScreen';
import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';

const Drawer = createDrawerNavigator();
const Tab    = createBottomTabNavigator();
const Stack  = createStackNavigator();

// ── تخصيص ألوان الملاحة (أزرق داكن يشبه لون الأزرار) ──
const navColors = {
  bg:      '#1E3A8A', // Blue 900
  bg2:     '#1E40AF', // Blue 800
  card:    '#2563EB', // Blue 600
  border:  'rgba(255,255,255,0.15)',
  t1:      '#FFFFFF',
  t2:      '#BFDBFE',
  t3:      '#93C5FD',
  blue:    '#60A5FA',
  red:     '#EF4444',
  green:   '#10B981',
};

// ══════════════════════════════════════════════════════════════
//  HEADER
// ══════════════════════════════════════════════════════════════
function MenuButton({ navigation }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }], marginLeft: 14 }}>
      <TouchableOpacity
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        style={[h.menuBtn, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }]}
        activeOpacity={0.7}
      >
        <View style={h.menuLine} />
        <View style={[h.menuLine, { width: 14 }]} />
        <View style={[h.menuLine, { width: 18 }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function NotificationBell({ navigation }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
     const check = async () => {
         const notifs = await getLocalNotificationsBox(user?.id);
         setUnreadCount(notifs.filter(n => !n.is_read).length);
     };
     check();
     const unsub = subscribeDataChanges(e => {
        if(e.type === 'notifications') check();
     });
     return unsub;
  }, [user?.id]);

  return (
    <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={{ marginRight: 15, position: 'relative' }}>
       <Text style={{ fontSize: 20 }}>🔔</Text>
       {unreadCount > 0 && (
         <View style={{ position: 'absolute', top: -5, left: -5, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
         </View>
       )}
    </TouchableOpacity>
  );
}

function HeaderOptions(title, navigation) {
  return {
    title,
    headerStyle: {
      backgroundColor: navColors.bg,
      borderBottomWidth: 0,
      height: 64,
    },
    headerTintColor: navColors.t1,
    headerTitleStyle: { fontWeight: '900', fontSize: 17, letterSpacing: -0.4 },
    headerLeft: () => <MenuButton navigation={navigation} />,
    headerRight: () => <NotificationBell navigation={navigation} />,
  };
}

// ══════════════════════════════════════════════════════════════
//  STACKS
// ══════════════════════════════════════════════════════════════
function DashboardStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} options={HeaderOptions('الرئيسية', navigation)} />
    </Stack.Navigator>
  );
}
function InvoicesStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InvoicesMain" component={InvoicesScreen} options={HeaderOptions('الفواتير', navigation)} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'تفاصيل الفاتورة' }} />
      <Stack.Screen name="NewInvoice" component={NewInvoiceScreen} options={{ title: 'فاتورة جديدة' }} />
      <Stack.Screen name="NewCollection" component={NewCollectionScreen} options={{ title: 'إضافة تحصيل' }} />
    </Stack.Navigator>
  );
}

function CollectionsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CollectionsMain" component={CollectionsScreen} options={HeaderOptions('التحصيلات', navigation)} />
      <Stack.Screen name="NewCollection" component={NewCollectionScreen} options={{ title: 'إضافة تحصيل' }} />
    </Stack.Navigator>
  );
}
function InventoryStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InventoryMain" component={InventoryScreen} options={HeaderOptions('المخزون', navigation)} />
      <Stack.Screen name="AddBatch" component={AddBatchScreen} options={{ title: 'إضافة دفعة' }} />
    </Stack.Navigator>
  );
}
function POSStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="POSMain" component={POSScreen} options={HeaderOptions('نقاط البيع', navigation)} />
      <Stack.Screen name="NewPOS" component={NewPOSScreen} options={{ title: 'إضافة نقطة' }} />
      <Stack.Screen name="EditPOS" component={EditPOSScreen} options={{ title: 'تعديل نقطة' }} />
    </Stack.Navigator>
  );
}
function WalletsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="WalletsMain" component={WalletsScreen} options={HeaderOptions('المحافظ', navigation)} />
      <Stack.Screen name="AssignWallet" component={AssignWalletScreen} options={{ title: 'توزيع أوراق' }} />
      <Stack.Screen name="WalletDetail" component={WalletDetailScreen} options={{ title: 'حركة المحفظة' }} />
    </Stack.Navigator>
  );
}
function ReportsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ReportsMain" component={ReportsScreen} options={HeaderOptions('الاستعلامات', navigation)} />
    </Stack.Navigator>
  );
}
function AdminStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="AdminMain" component={AdminScreen} options={HeaderOptions('الإدارة', navigation)} />
    </Stack.Navigator>
  );
}
function PermissionsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="PermissionsMain" component={PermissionsScreen} options={HeaderOptions('إدارة الصلاحيات', navigation)} />
    </Stack.Navigator>
  );
}
function CashierStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CashierMain" component={CashierScreen} options={HeaderOptions('اعتماد التحصيلات', navigation)} />
    </Stack.Navigator>
  );
}
function SettingsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} options={HeaderOptions('الإعدادات العامة', navigation)} />
    </Stack.Navigator>
  );
}
function SuppliesStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SuppliesMain" component={SuppliesScreen} options={HeaderOptions('التوريدات المالية', navigation)} />
      <Stack.Screen name="NewSupply" component={NewSupplyScreen} options={{ title: 'توريد جديد' }} />
    </Stack.Navigator>
  );
}


// ══════════════════════════════════════════════════════════════
//  BOTTOM TABS
// ══════════════════════════════════════════════════════════════
function AnimatedTabIcon({ emoji, label, focused }) {
  const scale = useRef(new Animated.Value(focused ? 1.1 : 1)).current;
  useEffect(() => { Animated.spring(scale, { toValue: focused ? 1.12 : 1, useNativeDriver: true }).start(); }, [focused]);
  return (
    <View style={t.tabIconWrap}>
      <Animated.View style={[t.tabPill, { backgroundColor: focused ? 'rgba(255,255,255,0.15)' : 'transparent', transform: [{ scale }] }]}>
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
      </Animated.View>
      <Text style={[t.tabLabel, { color: focused ? '#FFF' : navColors.t2, fontWeight: focused ? '900' : '600' }]}>{label}</Text>
    </View>
  );
}

function BottomTabs() {
  const { user, canAccess } = useAuth();
  const isAdmin = user?.role === 'admin';

  const tabs = [
    { name: 'DashboardTab',   component: DashboardStack,   emoji: '🏠', label: 'الرئيسية', visible: canAccess('Dashboard')  },
    { name: 'InvoicesTab',    component: InvoicesStack,    emoji: '🧾', label: 'الفواتير', visible: canAccess('Invoices') },
    { name: 'CollectionsTab', component: CollectionsStack, emoji: '💰', label: 'التحصيل', visible: canAccess('Collections') },
    { name: 'CashierTab',     component: CashierStack,     emoji: '✅', label: 'الاعتماد', visible: !isAdmin && canAccess('CashierApproval') },
    { name: 'WalletsTab',     component: WalletsStack,     emoji: '👜', label: 'المحافظ', visible: canAccess('Wallets') },
    
    // Hidden from bottom tab bar, accessed via drawer only:
    { name: 'InventoryTab',   component: InventoryStack,   emoji: '📦', label: '',         visible: false },
    { name: 'POSTab',         component: POSStack,         emoji: '🏪', label: '',         visible: false },
    { name: 'ReportsTab',     component: ReportsStack,     emoji: '📊', label: '',         visible: false },
    { name: 'AdminTab',       component: AdminStack,       emoji: '⚙️', label: '',         visible: false },
    { name: 'PermissionsTab', component: PermissionsStack, emoji: '🔐', label: '',         visible: false },
    { name: 'SuppliesTab',    component: SuppliesStack,    emoji: '💵', label: 'الإيرادات',     visible: canAccess('Supplies') },
    { name: 'SettingsTab',    component: SettingsStack,    emoji: '⚙️', label: '',         visible: false },
  ];
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: navColors.bg,
          borderTopWidth: 1, borderTopColor: navColors.border,
          height: 72, paddingBottom: 12, paddingTop: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      {tabs.map(item => (
        <Tab.Screen key={item.name} name={item.name} component={item.component}
          options={item.visible ? { tabBarIcon: ({ focused }) => <AnimatedTabIcon emoji={item.emoji} label={item.label} focused={focused} /> } : { tabBarButton: () => null }}
        />
      ))}
    </Tab.Navigator>
  );
}

// ══════════════════════════════════════════════════════════════
//  CUSTOM DRAWER
// ══════════════════════════════════════════════════════════════
function CustomDrawer({ navigation, state }) {
  const { user, logout, canAccess } = useAuth();
  const isAdmin = user?.role === 'admin';
  const currentRoute = state?.routeNames[state.index];
  const allItems = [
    { route: 'DashboardTab', label: 'الرئيسية', icon: '🏠', permission: 'Dashboard' },
    { route: 'InvoicesTab', label: 'الفواتير', icon: '🧾', permission: 'Invoices' },
    { route: 'CollectionsTab', label: 'التحصيلات', icon: '💰', permission: 'Collections' },
    { route: 'CashierTab', label: 'اعتماد التحصيل', icon: '✅', permission: 'CashierApproval', hideForAdmin: true },
    { route: 'InventoryTab', label: 'المخزون', icon: '📦', permission: 'Inventory' },
    { route: 'POSTab', label: 'نقاط البيع', icon: '🏪', permission: 'POS' },
    { route: 'WalletsTab', label: 'المحافظ', icon: '👜', permission: 'Wallets' },
    { route: 'SuppliesTab', label: 'التوريدات المالية', icon: '💵', permission: 'Supplies' },
    { route: 'ReportsTab', label: 'الاستعلامات', icon: '📊', permission: 'Reports' },
    { route: 'AdminTab', label: 'الإدارة', icon: '⚙️', permission: 'Admin' },
    { route: 'PermissionsTab', label: 'إدارة الصلاحيات', icon: '🔐', permission: 'Admin' }, 
    { route: 'About', label: 'اتصل بنا', icon: '📞', permission: 'About' },
    { route: 'SettingsTab', label: 'الإعدادات العامة', icon: '⚙️', permission: 'Settings' },
  ];

  const items = allItems.filter(i => {
    if (isAdmin && i.hideForAdmin) return false;
    return canAccess(i.permission);
  });

  return (
    <View style={[d.screen, { backgroundColor: navColors.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={navColors.bg} />
      <View style={[d.header, { backgroundColor: navColors.bg2 }]}>
        <View style={d.userRow}>
          <View style={d.userAvatar}><Text style={{ fontSize: 22 }}>👤</Text></View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={[d.userName, { color: navColors.t1 }]}>{user?.name || 'مستخدم'}</Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12, marginTop: 4 }}>
              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{ROLE_PERMISSIONS[user?.role]?.label || user?.role}</Text>
            </View>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
        {items.map((item, i) => {
          const active = currentRoute === item.route;
          return (
            <TouchableOpacity 
              key={i} 
              style={[d.item, active && { backgroundColor: 'rgba(255,255,255,0.12)' }]} 
              onPress={() => { 
                navigation.dispatch(DrawerActions.closeDrawer()); 
                if (item.route === 'About' || item.route === 'Notifications') {
                  navigation.navigate(item.route);
                } else {
                  navigation.navigate('MainTabs', { screen: item.route }); 
                }
              }}
            >
              <View style={[d.itemIcon, { backgroundColor: active ? 'rgba(255,255,255,0.1)' : 'transparent' }]}>
                <Text style={{ fontSize: 18 }}>{item.icon}</Text>
              </View>
              <Text style={[d.itemLabel, { color: active ? '#FFF' : navColors.t2, fontWeight: active ? '900' : '600' }]}>{item.label}</Text>
              {active && <View style={d.activeBar} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
        <TouchableOpacity style={d.logoutBtn} onPress={logout}>
          <Text style={{ color: '#FF9E9E', fontWeight: '900', fontSize: 15 }}>🚪 تسجيل الخروج</Text>
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
  const { user, loading } = useAuth();
  const { isDark } = useTheme();

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: navColors.bg }}><ActivityIndicator size="large" color="#FFF" /></View>;
  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar barStyle="light-content" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainApp" component={MainDrawer} />
            <Stack.Screen name="About" component={AboutScreen} options={{ headerShown: true, title: 'اتصل بنا', headerTintColor: '#FFF', headerStyle: { backgroundColor: navColors.bg } }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: true, title: 'الإشعارات الذكية', headerTintColor: '#FFF', headerStyle: { backgroundColor: navColors.bg } }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const h = StyleSheet.create({
  menuBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 4.5 },
  menuLine: { height: 2.5, width: 22, borderRadius: 2, backgroundColor: '#FFF' },
});
const t = StyleSheet.create({
  tabIconWrap: { alignItems: 'center', gap: 3 },
  tabPill: { width: 48, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 10, letterSpacing: -0.2 },
});
const d = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: 24, paddingTop: 64 },
  userRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16 },
  userAvatar: { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  userName: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  item: { flexDirection: 'row-reverse', alignItems: 'center', padding: 14, marginHorizontal: 12, marginVertical: 2, borderRadius: 14, position: 'relative' },
  itemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  itemLabel: { flex: 1, textAlign: 'right', fontSize: 15 },
  activeBar: { position: 'absolute', right: 0, width: 4, height: '60%', borderRadius: 2, backgroundColor: '#FFF' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(255, 255, 255, 0.08)', padding: 16, borderRadius: 14 },
});
