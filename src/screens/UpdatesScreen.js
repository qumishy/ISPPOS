import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import {
  fetchLatestGithubApkRelease,
  getCurrentAppVersion,
  isVersionNewer,
  formatBytesAr,
  downloadReleaseApk,
  installDownloadedApk,
  cancelApkDownload,
} from '../services/updateService';

export default function UpdatesScreen() {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [apkUri, setApkUri] = useState('');
  const [release, setRelease] = useState(null);
  const [error, setError] = useState('');

  const currentVersion = useMemo(() => getCurrentAppVersion(), []);
  const latestVersion = String(release?.tag || '').replace(/^v/i, '');
  const hasNewVersion = latestVersion ? isVersionNewer(latestVersion, currentVersion) : false;

  const loadLatest = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      const latest = await fetchLatestGithubApkRelease();
      setRelease(latest);
    } catch (e) {
      const msg = e?.message || 'تعذر التحقق من آخر إصدار.';
      setError(msg);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
    return () => {
      cancelApkDownload().catch(() => {});
    };
  }, [loadLatest]);

  const onDownload = async () => {
    if (!release?.asset?.url) {
      Alert.alert('خطأ', 'رابط APK غير متوفر.');
      return;
    }
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const uri = await downloadReleaseApk({
        url: release.asset.url,
        filename: release.asset.name || `update_${Date.now()}.apk`,
        onProgress: (pct) => setDownloadProgress(Number(pct || 0)),
      });
      setApkUri(uri);
      Alert.alert('نجاح', 'تم تنزيل التحديث بنجاح.');
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'فشل تنزيل التحديث.');
    } finally {
      setDownloading(false);
    }
  };

  const onInstall = async () => {
    try {
      await installDownloadedApk(apkUri);
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذر بدء التثبيت.');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
        <Text style={{ color: colors.t1, fontSize: fontSize.lg, fontWeight: '800', marginBottom: 10 }}>التحديثات</Text>

        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.t2 }}>الإصدار الحالي: <Text style={{ color: colors.t1, fontWeight: '700' }}>{currentVersion}</Text></Text>
          <Text style={{ color: colors.t2 }}>آخر إصدار: <Text style={{ color: colors.t1, fontWeight: '700' }}>{latestVersion || '—'}</Text></Text>
          <Text style={{ color: colors.t2 }}>حجم APK: <Text style={{ color: colors.t1, fontWeight: '700' }}>{formatBytesAr(release?.asset?.size)}</Text></Text>
        </View>

        {loading || checking ? (
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.t2 }}>جاري التحقق من آخر إصدار...</Text>
          </View>
        ) : null}

        {!!error && !checking && (
          <Text style={{ marginTop: 14, color: colors.danger, fontWeight: '700' }}>{error}</Text>
        )}

        {!loading && !checking && !error && (
          <Text style={{ marginTop: 14, color: hasNewVersion ? colors.warning : colors.success, fontWeight: '800' }}>
            {hasNewVersion ? 'يتوفر إصدار أحدث للتطبيق.' : 'أنت تستخدم آخر إصدار.'}
          </Text>
        )}
      </View>

      <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
        <Text style={{ color: colors.t1, fontSize: fontSize.md, fontWeight: '800', marginBottom: 8 }}>ملاحظات الإصدار</Text>
        <Text style={{ color: colors.t2, lineHeight: 22 }}>
          {release?.body?.trim() || 'لا توجد ملاحظات متاحة.'}
        </Text>
      </View>

      {hasNewVersion && !apkUri && (
        <TouchableOpacity
          disabled={downloading}
          onPress={onDownload}
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: 14,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            opacity: downloading ? 0.7 : 1,
          }}
        >
          {downloading ? <ActivityIndicator color="#fff" /> : <Feather name="download-cloud" size={18} color="#fff" />}
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.md }}>
            {downloading ? `جاري التنزيل ${downloadProgress}%` : 'تنزيل التحديث'}
          </Text>
        </TouchableOpacity>
      )}

      {!!apkUri && (
        <TouchableOpacity
          onPress={onInstall}
          style={{
            backgroundColor: colors.success,
            borderRadius: radius.md,
            paddingVertical: 14,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Feather name="package" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.md }}>تثبيت التحديث</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={loadLatest}
        style={{
          marginTop: spacing.md,
          borderRadius: radius.md,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.bg2,
        }}
      >
        <Feather name="refresh-cw" size={16} color={colors.t2} />
        <Text style={{ color: colors.t2, fontWeight: '700' }}>إعادة التحقق</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
