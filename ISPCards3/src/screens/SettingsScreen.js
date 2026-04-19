import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Switch, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme';
import { useAuth, ROLE_PERMISSIONS } from '../services/AuthContext';
import { execSQL } from '../services/database';
import { syncAll } from '../services/SyncService';
import { Row, Btn, Avatar } from '../components/UI';
import { makeStyles } from '../styles/settings.styles';

const SETTINGS_KEY = 'isp_app_settings';

const defaultSettings = {
  currency: 'ر.ي',
  dateFormat: 'DD/MM/YYYY',
  language: 'ar',
  rtl: true,
  defaultInvoiceType: 'credit',
  notifications: true,
  autoSync: true,
  companyName: 'نظام الكروت',
};

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, spacing, radius, fontSize, shadow, mode, isDark, toggleTheme } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [settings, setSettings] = useState(defaultSettings);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [dbInfo, setDbInfo] = useState({});

  useEffect(() => {
    loadSettings(); loadDbInfo();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) setSettings({ ...defaultSettings, ...JSON.parse(stored) });
    } catch (e) { }
  };

  const saveSettings = async (newSettings) => {
    setSettings(newSettings);
    try { await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings)); } catch (e) { }
  };

  const toggle = (key) => saveSettings({ ...settings, [key]: !settings[key] });
  const setValue = (key, value) => saveSettings({ ...settings, [key]: value });

  const loadDbInfo = async () => {
    try {
      const [invR, colR, posR, walR, qR] = await Promise.all([
        execSQL('SELECT COUNT(*) as cnt FROM invoices WHERE active=1'),
        execSQL('SELECT COUNT(*) as cnt FROM collections WHERE active=1'),
        execSQL('SELECT COUNT(*) as cnt FROM pos_customers WHERE active=1'),
        execSQL('SELECT COUNT(*) as cnt FROM agent_wallets'),
        execSQL('SELECT COUNT(*) as cnt FROM sync_queue'),
      ]);
      setDbInfo({
        invoices: invR.rows._array[0]?.cnt || 0,
        collections: colR.rows._array[0]?.cnt || 0,
        pos: posR.rows._array[0]?.cnt || 0,
        wallets: walR.rows._array[0]?.cnt || 0,
        queue: qR.rows._array[0]?.cnt || 0,
      });
      setPendingSync(qR.rows._array[0]?.cnt || 0);
    } catch (e) { }
  };

  const handleManualSync = async () => {
    setSyncing(true); await syncAll(); await loadDbInfo(); setSyncing(false);
    Alert.alert('✅ تمت المزامنة', 'تم مزامنة البيانات مع الخادم');
  };

  const handleClearQueue = () => {
    Alert.alert('مسح طابور المزامنة', 'هل تريد مسح العمليات المعلقة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'مسح', style: 'destructive', onPress: async () => {
          await execSQL('DELETE FROM sync_queue'); loadDbInfo();
          Alert.alert('✅ تم', 'تم مسح طابور المزامنة');
        }
      },
    ]);
  };

  const roleColor = { admin: colors.purple, cashier: colors.blue, agent: colors.green }[user?.role] || colors.blue;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}>
      {/* ══ Theme Switcher ══ */}
      <Text style={s.sectionTitle}>🌙 المظهر</Text>
      <TouchableOpacity style={s.themeCard} activeOpacity={0.8} onPress={toggleTheme}>
        <View style={[s.themeIconWrap, { backgroundColor: isDark ? colors.blue + '20' : colors.orange + '20' }]}>
          <Text style={{ fontSize: 24 }}>{isDark ? '🌙' : '☀️'}</Text>
        </View>
        <View style={s.themeInfo}>
          <Text style={s.themeTitle}>{isDark ? 'الوضع الليلي' : 'الوضع الفاتح'}</Text>
          <Text style={s.themeSub}>اضغط للتبديل إلى الوضع {isDark ? 'الفاتح' : 'الليلي'}</Text>
        </View>
        <View style={[s.themeToggleBtn, {
             backgroundColor: isDark ? colors.bg3 : colors.blue,
             borderColor: isDark ? colors.border3 : colors.blueG,
           }]}>
          <Text style={[s.themeToggleTxt, { color: isDark ? colors.t2 : '#fff' }]}>تبديل</Text>
          <Text style={[s.themeToggleMode, { color: isDark ? colors.blue : colors.bg2 }]}>{isDark ? 'Dark' : 'Light'}</Text>
        </View>
      </TouchableOpacity>

      {/* ══ User Info ══ */}
      <View style={s.userCard}>
        <Avatar name={user?.name} color={roleColor} size={52} />
        <View style={s.userInfo}>
          <Text style={s.userName}>{user?.name || 'مستخدم'}</Text>
          <Text style={{ fontSize: fontSize.xs, color: roleColor, fontWeight: '600', marginTop: 3 }}>
            {ROLE_PERMISSIONS[user?.role]?.label || user?.role}
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.t3, marginTop: 2 }}>@{user?.username}</Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={() =>
          Alert.alert('تسجيل الخروج', 'هل تريد الخروج؟', [
            { text: 'إلغاء', style: 'cancel' },
            { text: '🚪 خروج', style: 'destructive', onPress: logout },
          ])
        }>
          <Text style={s.logoutTxt}>🚪 خروج</Text>
        </TouchableOpacity>
      </View>

      {/* ══ Sync ══ */}
      <Text style={s.sectionTitle}>🔄 المزامنة</Text>
      <View style={s.section}>
        <Row style={s.row}>
          <Text style={s.rowLabel}>عمليات معلقة</Text>
          <View style={[s.badge, { backgroundColor: pendingSync > 0 ? colors.orange + '22' : colors.green + '22' }]}>
            <Text style={{ color: pendingSync > 0 ? colors.orange : colors.green, fontWeight: '700', fontSize: fontSize.sm }}>{pendingSync}</Text>
          </View>
        </Row>
        <Row style={s.row}>
          <Text style={s.rowLabel}>مزامنة تلقائية</Text>
          <Switch value={settings.autoSync} onValueChange={() => toggle('autoSync')}
            trackColor={{ false: colors.border2, true: colors.blue + '66' }} thumbColor={settings.autoSync ? colors.blue : colors.t3} />
        </Row>
        <Btn label={syncing ? 'جاري المزامنة...' : '🔄 مزامنة الآن'}
          variant="primary" size="sm" onPress={handleManualSync} disabled={syncing}
          style={{ marginTop: spacing.sm }} />
        {pendingSync > 0 && (
          <Btn label="🗑️ مسح طابور المزامنة"
            variant="danger" size="sm" onPress={handleClearQueue}
            style={{ marginTop: spacing.xs }} />
        )}
      </View>

      {/* ══ Currency ══ */}
      <Text style={s.sectionTitle}>🎨 إعدادات العرض</Text>
      <View style={s.section}>
        <View style={s.row}>
          <Text style={[s.rowLabel, { marginBottom: spacing.sm }]}>العملة</Text>
          <Row style={{ gap: spacing.sm }}>
            {['ر.ي', 'USD', 'SAR'].map(c => (
              <TouchableOpacity key={c}
                style={[s.optBtn, settings.currency === c && s.optBtnActive]}
                onPress={() => setValue('currency', c)}>
                <Text style={[s.optTxt, settings.currency === c && { color: colors.blue, fontWeight: '700' }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </Row>
        </View>
      </View>

      <Text style={s.sectionTitle}>ℹ️ عن التطبيق</Text>
      <View style={s.section}>
        {[
          { l: 'اسم التطبيق', v: 'نظام كروت الإنترنت' },
          { l: 'الإصدار', v: '1.0.0' },
          { l: 'العملة', v: 'ريال يمني (ر.ي)' },
        ].map((item, i) => (
          <Row key={i} style={[s.row, i === 2 && { borderBottomWidth: 0 }]}>
            <Text style={s.rowLabel}>{item.l}</Text>
            <Text style={{ color: colors.t2, fontSize: fontSize.sm }}>{item.v}</Text>
          </Row>
        ))}
      </View>
    </ScrollView>
  );
}

