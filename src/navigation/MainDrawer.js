import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import DashboardScreen from '../screens/DashboardScreen';

// ✅ استيراد مباشر من MainScreens
import {
  InvoicesScreen,
  CollectionsScreen,
  InventoryScreen,
  POSScreen,
  WalletsScreen,
} from '../screens/MainScreens';

import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AdminScreen from '../screens/AdminScreen';
import CashierScreen from '../screens/CashierScreen';

import { useAuth } from '../services/AuthContext';

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();

// ═══════════════════════════════
// التابات
// ═══════════════════════════════
function BottomTabs() {
  const { can } = useAuth();

  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />

      {can('canViewInvoices') && InvoicesScreen && (
        <Tab.Screen name="Invoices" component={InvoicesScreen} />
      )}

      {can('canCreateCollection') && CollectionsScreen && (
        <Tab.Screen name="Collections" component={CollectionsScreen} />
      )}

      {can('canApproveCollection') && (
        <Tab.Screen name="Cashier" component={CashierScreen} />
      )}
    </Tab.Navigator>
  );
}

// ═══════════════════════════════
// Drawer
// ═══════════════════════════════
export default function MainDrawer() {
  const { can } = useAuth();

  return (
    <Drawer.Navigator screenOptions={{ headerShown: true }}>
      <Drawer.Screen name="Home" component={BottomTabs} />

      {can('canViewInventory') && InventoryScreen && (
        <Drawer.Screen name="Inventory" component={InventoryScreen} />
      )}

      {can('canViewPOS') && POSScreen && (
        <Drawer.Screen name="POS" component={POSScreen} />
      )}

      {WalletsScreen && (
        <Drawer.Screen name="Wallets" component={WalletsScreen} options={{ title: 'شاشة المحافظ والعهد' }} />
      )}

      <Drawer.Screen name="Reports" component={ReportsScreen} />

      {can('canViewAdmin') && (
        <Drawer.Screen name="Admin" component={AdminScreen} />
      )}

      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  );
}
