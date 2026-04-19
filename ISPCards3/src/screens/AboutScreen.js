import React from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { Btn } from '../components/UI';
import { makeStyles } from '../styles/form.styles';

export default function AboutScreen({ navigation }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: spacing.xl, alignItems: 'center' }}>
      <View style={{ width: 100, height: 100, backgroundColor: colors.blue + '15', borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 40 }}>📱</Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: '900', color: colors.t1, marginBottom: 10 }}>ISP Cards v3.0</Text>
      <Text style={{ color: colors.t3, fontSize: 13, textAlign: 'center', marginBottom: 30 }}>نظام إدارة مبيعات وتوزيع كروت الشبكات الذكي</Text>

      <View style={[s.section, { width: '100%', padding: 20 }]}>
        <Text style={{ color: colors.blue, fontWeight: '800', marginBottom: 15, fontSize: 16, textAlign: 'center' }}>🛠️ الإشراف والدعم الفني</Text>
        <View style={{ alignItems: 'center', marginBottom: 15 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.t1, textAlign: 'center' }}>المهندس / أحمد مكافح</Text>
          <TouchableOpacity onPress={() => { }}>
            <Text style={{ fontSize: 16, color: colors.blue, fontWeight: 'bold', marginTop: 5, textAlign: 'center' }}>+967 774 030 881</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.section, { width: '100%', padding: 20 }]}>
        <Text style={{ color: colors.cyan, fontWeight: '800', marginBottom: 15, fontSize: 16, textAlign: 'center' }}>💻 التطوير والتصميم</Text>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.t1, textAlign: 'center' }}>المبرمج / سالم القميشي</Text>
          <TouchableOpacity onPress={() => { }}>
            <Text style={{ fontSize: 16, color: colors.cyan, fontWeight: 'bold', marginTop: 5, textAlign: 'center' }}>+967 770 726 510</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={{ marginTop: 20, color: colors.t3, fontSize: 11 }}>جميع الحقوق محفوظة © 2026</Text>
      <Btn label="⬅️ عودة للرئيسية" variant="outline" style={{ marginTop: 20, width: '100%' }} onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}
