import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ── إعدادات كيفية ظهور التنبيهات ──
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * طلب تصريح التنبيهات من جهاز المستخدم
 */
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }
    
    try {
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: '646d2fcc-0ecb-472b-abdb-2011179d1af0',
        })
      ).data;
      console.log('[NotificationService] Expo Push Token:', token);
    } catch (error) {
      console.error('Error getting push token', error);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

/**
 * إرسال تنبيه محلي فوري
 * @param {string} title العنوان
 * @param {string} body نص التنبيه
 * @param {object} data بيانات إضافية
 */
export async function sendLocalNotification(title, body, data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: null, // null يعني فوراً
    });
    
    // حل مشكلة الدائرة (Require Cycle) عبر الاستيراد من الخدمة المتخصصة مباشرة
    const { saveLocalNotificationBox } = require('./dbNotificationService');
    await saveLocalNotificationBox({
      title,
      body,
      route: data?.route || '',
      params: JSON.stringify(data),
      is_read: 0
    });
  } catch (e) {
    console.error('Error sending local notification:', e);
  }
}
