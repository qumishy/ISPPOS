import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export default function AgentDashboardScreen({ navigation }) {
  const actions = [
    { title: 'فاتورة جديدة', screen: 'NewInvoice' },
    { title: 'تحصيل جديد', screen: 'NewCollection' },
    { title: 'عرض الفواتير', screen: 'Invoices' },
    { title: 'عرض التحصيلات', screen: 'Collections' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>لوحة المندوب</Text>
      <Text style={styles.subtitle}>اختر العملية المطلوبة</Text>

      <View style={styles.grid}>
        {actions.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(item.screen)}
          >
            <Text style={styles.cardText}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: '#f5f7fb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 20,
    color: '#222',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginTop: 8,
    marginBottom: 24,
  },
  grid: {
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 14,
    elevation: 2,
  },
  cardText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111',
  },
});
