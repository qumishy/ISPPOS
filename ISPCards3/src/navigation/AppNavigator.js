import SyncScreen from '../screens/SyncScreen';
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';

import { NavigationContainer, DrawerActions } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '../services/AuthContext';
import { initDatabase } from '../services/database';

/* Screens */
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AdminScreen from '../screens/AdminScreen';
import CashierScreen from '../screens/CashierScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';

import InvoicesScreen from '../screens/InvoicesScreen';
import CollectionsScreen from '../screens/CollectionsScreen';
import InventoryScreen from '../screens/InventoryScreen';
import POSScreen from '../screens/POSScreen';
import WalletsScreen from '../screens/WalletsScreen';

import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';
import NewInvoiceScreen from '../screens/NewInvoiceScreen';
import NewCollectionScreen from '../screens/NewCollectionScreen';
import AddBatchScreen from '../screens/AddBatchScreen';
import NewPOSScreen from '../screens/NewPOSScreen';
import EditPOSScreen from '../screens/EditPOSScreen';
import AssignWalletScreen from '../screens/AssignWalletScreen';

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

/* ================= HEADER ================= */

function MenuButton({ navigation }) {
  return (
    <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
      <Text style={{ fontSize:22, color:'#fff', marginLeft:10 }}>☰</Text>
    </TouchableOpacity>
  );
}

function Header(title, navigation) {
  return {
    title,
    headerStyle:{ backgroundColor:'#0f172a' },
    headerTintColor:'#fff',
    headerLeft: () => <MenuButton navigation={navigation} />,
  };
}

/* ================= STACKS (بدون تغيير) ================= */

function DashboardStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} options={Header('الرئيسية', navigation)} />
    </Stack.Navigator>
  );
}

function InvoicesStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InvoicesMain" component={InvoicesScreen} options={Header('الفواتير', navigation)} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={Header('تفاصيل الفاتورة', navigation)} />
      <Stack.Screen name="NewInvoice" component={NewInvoiceScreen} options={Header('فاتورة جديدة', navigation)} />
    </Stack.Navigator>
  );
}

function CollectionsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CollectionsMain" component={CollectionsScreen} options={Header('التحصيلات', navigation)} />
      <Stack.Screen name="NewCollection" component={NewCollectionScreen} options={Header('إضافة تحصيل', navigation)} />
    </Stack.Navigator>
  );
}

function InventoryStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InventoryMain" component={InventoryScreen} options={Header('المخزون', navigation)} />
      <Stack.Screen name="AddBatch" component={AddBatchScreen} options={Header('إضافة دفعة', navigation)} />
    </Stack.Navigator>
  );
}

function POSStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="POSMain" component={POSScreen} options={Header('نقاط البيع', navigation)} />
      <Stack.Screen name="NewPOS" component={NewPOSScreen} options={Header('إضافة نقطة', navigation)} />
      <Stack.Screen name="EditPOS" component={EditPOSScreen} options={Header('تعديل نقطة', navigation)} />
    </Stack.Navigator>
  );
}

function WalletsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="WalletsMain" component={WalletsScreen} options={Header('المحافظ', navigation)} />
      <Stack.Screen name="AssignWallet" component={AssignWalletScreen} options={Header('توزيع أوراق', navigation)} />
    </Stack.Navigator>
  );
}

function ReportsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ReportsMain" component={ReportsScreen} options={Header('الاستعلامات', navigation)} />
    </Stack.Navigator>
  );
}

function AdminStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="AdminMain" component={AdminScreen} options={Header('الإدارة', navigation)} />
    </Stack.Navigator>
  );
}

function CashierStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CashierMain" component={CashierScreen} options={Header('إعتماد التحصيلات', navigation)} />
    </Stack.Navigator>
  );
}

function SettingsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} options={Header('الإعدادات', navigation)} />
    </Stack.Navigator>
  );
}

/* ================= TABS (تم التعديل هنا فقط) ================= */

function TabIcon({ emoji, label, focused }) {
  return (
    <View style={{ alignItems:'center' }}>
      <Text style={{ fontSize:18 }}>{emoji}</Text>
      <Text style={{
        fontSize:11,
        color: focused ? '#3b82f6' : '#aaa'
      }}>
        {label}
      </Text>
    </View>
  );
}

function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown:false,
        tabBarStyle:{ backgroundColor:'#0f172a', height:60 },
      }}
    >

      <Tab.Screen
        name="DashboardTab"
        component={DashboardStack}
        options={{
          tabBarIcon: ({focused}) => <TabIcon emoji="📊" label="الرئيسية" focused={focused} />
        }}
      />

      <Tab.Screen
        name="InvoicesTab"
        component={InvoicesStack}
        options={{
          tabBarIcon: ({focused}) => <TabIcon emoji="🧾" label="الفواتير" focused={focused} />
        }}
      />

      <Tab.Screen
        name="CollectionsTab"
        component={CollectionsStack}
        options={{
          tabBarIcon: ({focused}) => <TabIcon emoji="💰" label="التحصيلات" focused={focused} />
        }}
      />

      {/* Tabs مخفية */}
      <Tab.Screen name="InventoryTab" component={InventoryStack} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="POSTab" component={POSStack} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="WalletsTab" component={WalletsStack} options={{ tabBarButton: () => null }} />
<Drawer.Screen name="CashierTab" component={CashierStack}
options={{ tabBarButton: () => null }} />

      <Tab.Screen name="ReportsTab" component={ReportsStack} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="AdminTab" component={AdminStack} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="SettingsTab" component={SettingsStack} options={{ tabBarButton: () => null }} />

    </Tab.Navigator>
  );
}

/* ================= DRAWER ================= */

function CustomDrawer({ navigation }) {
  const { logout } = useAuth();

  return (
    <View style={{ flex:1, backgroundColor:'#0f172a', paddingTop:50 }}>

      {/* الرئيسية */}
      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'DashboardTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>📊 الرئيسية</Text>
      </TouchableOpacity>

      {/* الفواتير */}
      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'InvoicesTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>🧾 الفواتير</Text>
      </TouchableOpacity>

      {/* التحصيلات */}
      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'CollectionsTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>💰 التحصيلات</Text>
      </TouchableOpacity>

      {/* اعتماد التحصيلات (تبقى كما هي لأنها ليست Tab) */}
      <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'CashierTab' })
}>
        <Text style={{ color:'#fff', padding:15 }}>💼 اعتماد التحصيلات</Text>
      </TouchableOpacity>

      {/* باقي الشاشات نحولها إلى Tabs مخفية */}
      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'InventoryTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>📦 المخزون</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'POSTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>🏪 نقاط البيع</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'WalletsTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>👜 المحافظ</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'ReportsTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>📈 الاستعلامات</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'AdminTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>⚙️ الإدارة</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() =>
        navigation.navigate('MainTabs', { screen: 'SettingsTab' })
      }>
        <Text style={{ color:'#fff', padding:15 }}>🔧 الإعدادات</Text>
      </TouchableOpacity>

      {/* تسجيل الخروج */}
      <TouchableOpacity onPress={logout}>
        <Text style={{ color:'red', padding:15 }}>🚪 تسجيل الخروج</Text>
      </TouchableOpacity>

    </View>
  );
}

/* ================= MAIN ================= */

function MainDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={{ headerShown:false, drawerPosition:'right' }}
    >
      {/* الشاشة الوحيدة داخل Drawer */}
      <Drawer.Screen name="MainTabs" component={BottomTabs} />

      {/* فقط شاشة مستقلة */}
      
    </Drawer.Navigator>
  );
}

/* ================= APP ================= */

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initDatabase().then(() => setReady(true));
  }, []);

  if (loading || !ready) {
    return <ActivityIndicator style={{flex:1}} />;
  }

  return (
  <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown:false }}>

      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Sync" component={SyncScreen} />
          <Stack.Screen name="MainApp" component={MainDrawer} />
        </>
      )}

    </Stack.Navigator>
  </NavigationContainer>
);
}
