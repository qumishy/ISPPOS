import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import {
  getLocalNotificationsBox, markNotificationRead, markAllNotificationsRead
} from '../services/database';
import { formatDateShort } from '../utils/helpers';
import { Loading, Empty, Row, ScreenHeader } from '../components/UI';
import { useAuth } from '../services/AuthContext';
import { makeStyles } from '../styles/main.styles';

export default function NotificationsScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getLocalNotificationsBox(user?.id);
    setNotifications(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleRead = async (notif) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id);
      load();
    }
    if (notif.route) {
       let params = {};
       try { params = JSON.parse(notif.params); } catch(e){}
       
       if (notif.route === 'InvoiceDetail') {
          navigation.navigate('MainTabs', { screen: 'InvoicesTab', params: { screen: 'InvoiceDetail', params } });
       } else if (notif.route === 'CollectionsMain') {
          navigation.navigate('MainTabs', { screen: 'CollectionsTab' });
       } else if (notif.route === 'SuppliesMain') {
          navigation.navigate('MainTabs', { screen: 'SuppliesTab' });
       } else {
          navigation.navigate(notif.route, params);
       }
    }
  };

  const handleReadAll = async () => {
    await markAllNotificationsRead(user?.id);
    load();
  };

  return (
    <View style={s.screen}>
      <ScreenHeader
        kpis={[ { label: 'الإجمالي', value: notifications.length, color: colors.blue }, { label: 'جديد', value: notifications.filter(n => !n.is_read).length, color: colors.orange } ]}
        action="✔ تحديد الكل كمقروء"
        onAction={handleReadAll}
      />
      {loading ? <Loading /> : notifications.length === 0 ? <Empty icon="🔕" title="لا توجد إشعارات" /> : (
        <FlatList
          data={notifications}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => handleRead(item)} style={{ backgroundColor: item.is_read ? colors.bg2 : colors.blue + '15', padding: 15, borderRadius: radius.md, marginBottom: 10, borderWidth: 1, borderColor: item.is_read ? colors.border : colors.blue, opacity: item.is_read ? 0.7 : 1 }}>
               <Row style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                 <Text style={{ fontWeight: '900', color: item.is_read ? colors.t2 : colors.blue, fontSize: 16 }}>{item.title}</Text>
                 {!item.is_read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange }} />}
               </Row>
               <Text style={{ color: colors.t1, fontSize: 14, marginBottom: 8 }}>{item.body}</Text>
               <Text style={{ color: colors.t3, fontSize: 11 }}>{formatDateShort(item.created_at)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
