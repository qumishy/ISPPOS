import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  TextInput, Animated, Easing, ScrollView,
} from 'react-native';
import { useTheme } from '../theme';
import { statusLabel, statusColor } from '../utils/helpers';
import { makeStyles } from '../styles/ui.styles';
import { Feather } from '@expo/vector-icons';

// ══════════════════════════════════════════════════════
//  BASIC COMPONENTS
// ══════════════════════════════════════════════════════

export function Card({ children, style, header, footer, title, sub }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={[s.card, style]}>
      {(header || title) && (
        <View style={s.cardHeader}>
          {header || (
            <View>
              <Text style={s.cardTitle}>{title}</Text>
              {sub && <Text style={s.cardSub}>{sub}</Text>}
            </View>
          )}
        </View>
      )}
      {children}
      {footer && <View style={s.divider}>{footer}</View>}
    </View>
  );
}

export function Badge({ status, label, color, style }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const c = color || statusColor(status);
  const l = label || statusLabel(status);
  return (
    <View style={[s.badge, { borderColor: c + '40', backgroundColor: c + '12' }, style]}>
      <View style={[s.badgeDot, { backgroundColor: c }]} />
      <Text style={[s.badgeText, { color: c, flexShrink: 1 }]}>{l}</Text>
    </View>
  );
}

export function Btn({ label, onPress, variant = 'primary', size = 'md', icon, style, disabled, loading }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const variants = {
    primary: { bg: colors.primary, b: colors.blueG, t: '#fff' },
    success: { bg: colors.success, b: colors.greenL, t: '#fff' },
    warning: { bg: colors.warning, b: colors.orangeL, t: '#fff' },
    danger: { bg: colors.danger, b: colors.redL, t: '#fff' },
    outline: { bg: 'transparent', b: colors.border2, t: colors.t1 },
    ghost: { bg: 'transparent', b: 'transparent', t: colors.primary },
    glass: { bg: colors.bg2, b: colors.border, t: colors.t1 },
  };
  const v = variants[variant] || variants.primary;

  const sizes = {
    sm: { h: 36, p: spacing.md, f: fontSize.sm },
    md: { h: 42, p: spacing.lg, f: fontSize.md },
    lg: { h: 46, p: spacing.xl, f: fontSize.lg },
  };
  const sz = sizes[size] || sizes.md;

  const handlePressIn = () => { if (!disabled && !loading) Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start(); };
  const handlePressOut = () => { if (!disabled && !loading) Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start(); };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled || loading}
      style={style}
    >
      <Animated.View style={[
        s.btn,
        { height: sz.h, paddingHorizontal: sz.p, backgroundColor: v.bg, borderColor: v.b, transform: [{ scale: scaleAnim }] },
        variant === 'primary' && shadow.blue,
        disabled && s.btnDisabled,
      ]}>
        {loading ? (
          <ActivityIndicator color={v.t} size="small" />
        ) : (
          <>
            {icon && <Feather name={icon} size={sz.f + 4} color={v.t} style={{ marginLeft: label && !React.isValidElement(label) ? 6 : 0 }} />}
            {React.isValidElement(label)
              ? label
              : <Text style={[s.btnText, { color: v.t, fontSize: sz.f }]}>{label}</Text>}
          </>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

export function Input({ label, value, onChangeText, placeholder, icon, secureTextEntry, keyboardType, multiline, style, error }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <View style={s.inputWrap}>
      {label && <Text style={[s.label, isFocused && { color: colors.primary }]}>{label}</Text>}
      <View style={[
        s.inputContainer,
        multiline && { height: undefined, minHeight: 100 },
        isFocused && { borderColor: colors.primary, backgroundColor: colors.bg2 },
        error && { borderColor: colors.danger },
        style
      ]}>
        <TextInput
          style={[s.input, multiline && { height: 100, textAlignVertical: 'top' }, multiline && style && { height: style.height }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.t3}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {icon && <Feather name={icon} size={18} color={colors.t3} style={{ marginLeft: spacing.sm }} />}
      </View>
      {error && <Text style={s.inputError}>{error}</Text>}
    </View>
  );
}

export function Picker({ label, options, value, onChange, placeholder, loading: pLoading, searchable = false, wrapperStyle, dropdownZIndex = 1000 }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const [isFocused, setIsFocused] = React.useState(false);
  const selected = options?.find(o => String(o.value) === String(value));
  const [open, setOpen] = React.useState(false);
  const [filterText, setFilterText] = React.useState('');
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: open ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
    if (!open) setFilterText('');
  }, [open]);

  const filteredOptions = filterText
    ? options.filter(o => o.label?.toLowerCase().includes(filterText.toLowerCase()))
    : options;

  const dropdownHeight = animValue.interpolate({ inputRange: [0, 1], outputRange: [0, 260] });
  const dropdownOpacity = animValue.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const iconRotation = animValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={[{ marginBottom: spacing.md, zIndex: open ? dropdownZIndex : 1 }, wrapperStyle]}>
      {label && <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: 6, textAlign: 'right' }}>{label}</Text>}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.bg2,
          borderWidth: 1,
          borderColor: open ? colors.primary : colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          height: 50,
        }}
        onPress={() => !pLoading && setOpen(!open)}
        activeOpacity={0.8}
      >
        {pLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ flex: 1 }} />
        ) : (
          <Text style={{ fontSize: fontSize.md, color: selected ? colors.t1 : colors.t3, textAlign: 'right', flex: 1 }}>
            {selected ? selected.label : (placeholder || 'اختر...')}
          </Text>
        )}
        <Animated.View style={{ transform: [{ rotate: iconRotation }], marginLeft: 10 }}>
          <Feather name="chevron-down" size={20} color={open ? colors.primary : colors.t3} />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View style={{
        marginTop: 4,
        backgroundColor: colors.card,
        borderRadius: radius.md,
        borderWidth: open ? 1 : 0,
        borderColor: colors.border,
        ...shadow.md,
        overflow: 'hidden',
        height: dropdownHeight,
        opacity: dropdownOpacity,
        zIndex: dropdownZIndex,
        elevation: Math.max(12, Math.floor(dropdownZIndex / 100)),
        position: 'absolute',
        top: 75, left: 0, right: 0
      }}>
        {/* Search input (Conditional) */}
        {searchable && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg2 }}>
            <Feather name="search" size={14} color={colors.t3} />
            <TextInput
              style={{ flex: 1, fontSize: fontSize.sm, color: colors.t1, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right' }}
              value={filterText}
              onChangeText={setFilterText}
              placeholder="بحث..."
              placeholderTextColor={colors.t3}
              autoFocus={false}
            />
            {!!filterText && (
              <TouchableOpacity onPress={() => setFilterText('')}>
                <Feather name="x" size={14} color={colors.t3} />
              </TouchableOpacity>
            )}
          </View>
        )}
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {filteredOptions.length === 0 ? (
            <Text style={{ color: colors.t3, textAlign: 'center', padding: spacing.md }}>لا توجد نتائج</Text>
          ) : (
            filteredOptions.map(opt => (
              <TouchableOpacity
                key={String(opt.value)}
                style={{
                  padding: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: String(value) === String(opt.value) ? colors.primary + '10' : 'transparent',
                }}
                onPress={() => { onChange(opt.value); setOpen(false); }}
              >
                <Text style={{
                  fontSize: fontSize.md,
                  color: String(value) === String(opt.value) ? colors.primary : colors.t2,
                  textAlign: 'right',
                  fontWeight: String(value) === String(opt.value) ? '700' : '400',
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}


export function Row({ children, style }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function Loading({ label = 'جاري التحميل...' }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={s.loading}>
      <View style={s.loadingSpinWrap}>
        <ActivityIndicator color={colors.blue} size="large" />
        <View style={s.loadingGlow} />
      </View>
      <Text style={s.loadingText}>{label}</Text>
    </View>
  );
}

export function Empty({ icon = 'folder', title = 'لا توجد بيانات', sub, action, onAction }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={s.empty}>
      {icon && typeof icon === 'string' && !icon.includes(' ') && !icon.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/) ? (
        <Feather name={icon} size={48} color={colors.t3} style={{ marginBottom: spacing.md }} />
      ) : (
        <Text style={s.emptyIcon}>{icon}</Text>
      )}
      <Text style={s.emptyTitle}>{title}</Text>
      {sub && <Text style={s.emptySub}>{sub}</Text>}
      {action && <Btn label={action} variant="outline" size="sm" onPress={onAction} style={{ marginTop: 10 }} />}
    </View>
  );
}

export function SectionHeader({ title, icon, action, onAction, style }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={[s.sectionHeader, style]}>
      <View style={s.sectionTitleWrap}>
        <View style={{ width: 4, height: 20, backgroundColor: colors.primary, borderRadius: 2 }} />
        {icon && <Feather name={icon} size={18} color={colors.t2} style={{ marginLeft: 6 }} />}
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.sm }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function ProgressBar({ percent = 0, color, height = 8, showLabel = false }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const p = Math.min(Math.max(percent, 0), 100);
  const c = color || colors.primary;
  return (
    <View style={{ width: '100%', marginVertical: 4 }}>
      {showLabel && (
        <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 10, color: colors.t3, fontWeight: '700' }}>{p.toFixed(0)}%</Text>
        </Row>
      )}
      <View style={[s.progressTrack, { height, borderRadius: height / 2 }]}>
        <View style={[s.progressFill, { width: `${p}%`, height, backgroundColor: c, borderRadius: height / 2 }]} />
      </View>
    </View>
  );
}

export function KpiCard({ value, label, color, icon, style }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={[s.kpiCard, style]}>
      {icon && <Feather name={icon} size={20} color={colors.t2} style={{ marginBottom: 5 }} />}
      <Text style={[s.kpiValue, { color: color || colors.t1 }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40, color, style }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  const bg = color || colors.blue;
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg + '15' }, style]}>
      <Text style={[s.avatarTxt, { color: bg, fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

export function ScreenHeader({ kpis, tabs, activeTab, onTabSelect, search, onSearch, searchPlaceholder = 'بحث...', action, onAction }) {
  const { colors, spacing, radius, fontSize, shadow } = useTheme();
  const s = makeStyles(colors, spacing, radius, fontSize, shadow);
  return (
    <View style={s.shWrapper}>
      {kpis && kpis.length > 0 && (
        <View style={s.shKpiStrip}>
          {kpis.map((kpi, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={s.shKpiDivider} />}
              <View style={s.shKpiItem}>
                <Text style={[s.shKpiVal, { color: kpi.color || colors.t1 }]} numberOfLines={1} adjustsFontSizeToFit>{kpi.value}</Text>
                <Text style={s.shKpiLabel}>{kpi.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}
      {tabs && tabs.length > 0 && (
        <View style={s.shTabBar}>
          {tabs.map(tab => {
            const active = activeTab === tab.k;
            return (
              <TouchableOpacity key={tab.k} style={[s.shTab, active && s.shTabActive]} onPress={() => onTabSelect && onTabSelect(tab.k)} activeOpacity={0.75}>
                {tab.icon ? <Feather name={tab.icon} size={14} color={active ? colors.primary : colors.t3} style={{ marginLeft: 4 }} /> : null}
                <Text style={[s.shTabTxt, active && s.shTabTxtActive]}>{tab.l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {(onSearch || action) && (
        <View style={s.shToolbar}>
          {onSearch && (
            <View style={s.shSearchBox}>
              <Feather name="search" size={16} color={colors.t3} />
              <TextInput style={s.shSearchInput} value={search} onChangeText={onSearch} placeholder={searchPlaceholder} placeholderTextColor={colors.t3} />
              {!!search && <TouchableOpacity onPress={() => onSearch('')}><Feather name="x" size={16} color={colors.t3} /></TouchableOpacity>}
            </View>
          )}
          {action && (
            <TouchableOpacity style={s.shActionBtn} onPress={onAction} activeOpacity={0.82}>
              <Text style={s.shActionTxt}>{action}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
