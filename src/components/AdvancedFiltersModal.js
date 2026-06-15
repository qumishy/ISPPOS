import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { getLocalUsers, getLocalPOS } from '../services/database';
import { useAuth } from '../services/AuthContext';

export default function AdvancedFiltersModal({ visible, onClose, onApply, currentFilters, type }) {
  const { colors, spacing, radius, fontSize, shadow, fontFamily: ff } = useTheme();
  const { projectId } = useAuth();
  
  const [f, setF] = useState({});
  const [users, setUsers] = useState([]);
  const [pos, setPos] = useState([]);
  
  useEffect(() => {
    if (visible) {
      setF({ ...currentFilters });
      loadLookups();
    }
  }, [visible, currentFilters]);

  const loadLookups = async () => {
    try {
      const u = await getLocalUsers(projectId);
      setUsers(u || []);
      const p = await getLocalPOS(projectId);
      setPos(p || []);
    } catch (e) {
      console.log('Error loading lookups', e);
    }
  };

  const setDateRange = (range) => {
    const today = new Date();
    let from, to;
    if (range === 'today') {
      from = to = today.toISOString().slice(0, 10);
    } else if (range === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      from = to = y.toISOString().slice(0, 10);
    } else if (range === 'this_week') {
      const w = new Date(today);
      w.setDate(w.getDate() - w.getDay());
      from = w.toISOString().slice(0, 10);
      to = today.toISOString().slice(0, 10);
    } else if (range === 'this_month') {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      from = m.toISOString().slice(0, 10);
      to = today.toISOString().slice(0, 10);
    }
    setF({ ...f, from_date: from, to_date: to });
  };

  const handleApply = () => {
    onApply(f);
    onClose();
  };

  const handleReset = () => {
    const defaultF = {};
    if (f.status) defaultF.status = f.status; // Preserve existing base tab status if needed, though usually handled by parent
    setF({});
  };

  const renderSectionTitle = (title) => (
    <Text style={{ fontSize: 13, fontFamily: ff?.bold, color: colors.t2, marginBottom: 8, marginTop: 12, textAlign: 'right' }}>{title}</Text>
  );

  const renderSelect = (label, key, options) => (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={{ fontSize: 11, fontFamily: ff?.medium, color: colors.t3, marginBottom: 4, textAlign: 'right' }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row-reverse' }}>
        <TouchableOpacity
          style={[styles.chip, f[key] === undefined && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
          onPress={() => setF({ ...f, [key]: undefined })}
        >
          <Text style={[styles.chipText, f[key] === undefined && { color: colors.primary, fontFamily: ff?.bold }]}>الكل</Text>
        </TouchableOpacity>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, f[key] === opt.value && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
            onPress={() => setF({ ...f, [key]: opt.value })}
          >
            <Text style={[styles.chipText, f[key] === opt.value && { color: colors.primary, fontFamily: ff?.bold }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderInput = (label, key, placeholder) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, fontFamily: ff?.medium, color: colors.t3, marginBottom: 4, textAlign: 'right' }}>{label}</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 8, textAlign: 'right', color: colors.t1, fontFamily: ff?.regular, backgroundColor: colors.bg2 }}
        placeholder={placeholder}
        placeholderTextColor={colors.t3}
        value={f[key]?.toString() || ''}
        keyboardType="numeric"
        onChangeText={t => setF({ ...f, [key]: t })}
      />
    </View>
  );

  const styles = StyleSheet.create({
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bg2 },
    chipText: { fontSize: 11, fontFamily: ff?.regular, color: colors.t2 },
    dateBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 6, flex: 1, alignItems: 'center', backgroundColor: colors.bg2 },
    dateBtnText: { fontSize: 10, fontFamily: ff?.medium, color: colors.t2 }
  });

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%', padding: spacing.md, ...shadow.lg }}>
          
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 16, fontFamily: ff?.black, color: colors.t1 }}>تصفية متقدمة</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4, backgroundColor: colors.bg2, borderRadius: 20 }}>
              <Feather name="x" size={20} color={colors.t2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ marginBottom: spacing.md }} showsVerticalScrollIndicator={false}>
            {renderSectionTitle('الفترة الزمنية')}
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 10 }}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setDateRange('today')}><Text style={styles.dateBtnText}>اليوم</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setDateRange('yesterday')}><Text style={styles.dateBtnText}>الأمس</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setDateRange('this_week')}><Text style={styles.dateBtnText}>هذا الأسبوع</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setDateRange('this_month')}><Text style={styles.dateBtnText}>هذا الشهر</Text></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: spacing.sm }}>
              {renderInput('من تاريخ (YYYY-MM-DD)', 'from_date', 'مثال: 2024-01-01')}
              {renderInput('إلى تاريخ (YYYY-MM-DD)', 'to_date', 'مثال: 2024-01-31')}
            </View>

            {renderSectionTitle('الأطراف')}
            {renderSelect('نقطة البيع', 'pos_id', pos.map(p => ({ label: p.name, value: p.id })))}
            {renderSelect('المندوب', 'agent_id', users.filter(u => u.role === 'agent').map(u => ({ label: u.name, value: u.id })))}
            
            {type === 'collections' && renderSelect('أمين الصندوق (الاعتماد)', 'approved_by', users.filter(u => u.role === 'cashier' || u.role === 'admin' || u.role === 'manager').map(u => ({ label: u.name, value: u.id })))}

            {renderSectionTitle('الحالة')}
            {type === 'invoices' ? (
              <>
                {renderSelect('حالة الفاتورة', 'status', [
                  { label: 'مسددة', value: 'paid' },
                  { label: 'معلقة', value: 'pending' },
                  { label: 'متأخرة', value: 'overdue' },
                  { label: 'مستحقة قريباً', value: 'due_soon' },
                ])}
                {renderSelect('حالة الاعتماد للخصم', 'approval_status', [
                  { label: 'لا يوجد', value: 'none' },
                  { label: 'بانتظار الاعتماد', value: 'pending' },
                  { label: 'معتمد', value: 'approved' },
                  { label: 'مرفوض', value: 'rejected' },
                ])}
              </>
            ) : (
              renderSelect('حالة التحصيل', 'status', [
                { label: 'بانتظار الاعتماد', value: 'pending' },
                { label: 'تم الاعتماد', value: 'approved' },
                { label: 'مرفوض', value: 'rejected' },
              ])
            )}

            {renderSectionTitle('نطاق المبالغ')}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 8 }}>
              {renderInput('أقل مبلغ', 'amount_min', '0')}
              {renderInput('أعلى مبلغ', 'amount_max', '100000')}
            </View>
            
            {type === 'invoices' && (
              <>
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 8 }}>
                  {renderInput('أقل مبلغ مسدد', 'paid_min', '0')}
                  {renderInput('أعلى مبلغ مسدد', 'paid_max', '100000')}
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 8 }}>
                  {renderInput('أقل متبقي', 'remaining_min', '0')}
                  {renderInput('أعلى متبقي', 'remaining_max', '100000')}
                </View>
              </>
            )}

          </ScrollView>

          <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: spacing.sm }}>
            <TouchableOpacity onPress={handleApply} style={{ flex: 2, backgroundColor: colors.primary, borderRadius: radius.lg, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontFamily: ff?.bold, color: '#fff' }}>تطبيق التصفية</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReset} style={{ flex: 1, backgroundColor: colors.danger + '15', borderRadius: radius.lg, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.danger + '30' }}>
              <Text style={{ fontSize: 14, fontFamily: ff?.bold, color: colors.danger }}>مسح</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
