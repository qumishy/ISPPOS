import * as Updates from 'expo-updates';
import { Alert, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';

// Session state to prevent duplicate checks and duplicate alerts
let hasCheckedThisSession = false;
let isUpdateDownloaded = false;

export const checkForUpdate = async () => {
  try {
    if (!Updates.isEnabled || __DEV__) {
      return { isAvailable: false, message: 'Updates disabled in this environment' };
    }
    const update = await Updates.checkForUpdateAsync();
    return { isAvailable: update.isAvailable };
  } catch (error) {
    console.log('Error checking for update:', error);
    return { isAvailable: false, error };
  }
};

export const fetchUpdate = async () => {
  try {
    const result = await Updates.fetchUpdateAsync();
    if (result.isNew) {
      isUpdateDownloaded = true;
      return true;
    }
    return false;
  } catch (error) {
    console.log('Error fetching update:', error);
    return false;
  }
};

export const reloadApp = async () => {
  try {
    await Updates.reloadAsync();
  } catch (error) {
    console.log('Error reloading app:', error);
  }
};

export const checkAndApplyUpdateSilently = async () => {
  // Prevent multiple checks in the same app session
  if (hasCheckedThisSession || isUpdateDownloaded) return;
  hasCheckedThisSession = true;

  try {
    if (!Updates.isEnabled || __DEV__) return;
    
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      // Download silently
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        isUpdateDownloaded = true;
        // Prompt user for confirmation before reloading
        Alert.alert(
          'تحديث جديد متاح',
          'تم تنزيل تحديث جديد للتطبيق في الخلفية. هل تريد إعادة تشغيل التطبيق لتطبيقه الآن؟',
          [
            { text: 'لاحقاً', style: 'cancel' },
            { text: 'إعادة التشغيل', onPress: () => reloadApp() }
          ]
        );
      }
    }
  } catch (error) {
    console.log('Silent update error:', error);
  }
};

export const manualCheckForUpdate = async () => {
  try {
    if (!Updates.isEnabled || __DEV__) {
      Alert.alert('تنبيه', 'التحديثات غير مفعلة في هذه البيئة (بيئة التطوير).');
      return;
    }
    
    // If we already downloaded an update but the user delayed restarting
    if (isUpdateDownloaded) {
      Alert.alert(
        'التحديث جاهز',
        'تم تنزيل التحديث مسبقاً. هل تريد إعادة التشغيل الآن لتطبيقه؟',
        [
          { text: 'لاحقاً', style: 'cancel' },
          { text: 'إعادة التشغيل', onPress: () => reloadApp() }
        ]
      );
      return;
    }

    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        isUpdateDownloaded = true;
        Alert.alert(
          'تم تنزيل التحديث',
          'تم تنزيل التحديث بنجاح. هل تريد إعادة تشغيل التطبيق لتطبيقه الآن؟',
          [
            { text: 'لاحقاً', style: 'cancel' },
            { text: 'إعادة التشغيل', onPress: () => reloadApp() }
          ]
        );
      } else {
        Alert.alert('تنبيه', 'أنت تستخدم أحدث إصدار متاح.');
      }
    } else {
      Alert.alert('تنبيه', 'لا يوجد تحديث جديد. أنت تستخدم أحدث إصدار.');
    }
  } catch (error) {
    console.log('Manual update error:', error);
    Alert.alert('خطأ', 'حدث خطأ أثناء التحقق من التحديثات. قد لا يوجد اتصال بالإنترنت.');
  }
};

const getGithubReleaseConfig = () => {
  const extra = Constants?.expoConfig?.extra || {};
  const cfg = extra?.githubRelease || {};
  return {
    owner: cfg.owner || '',
    repo: cfg.repo || '',
    assetPattern: cfg.assetPattern || '.apk',
    token: cfg.token || '',
  };
};

export const getCurrentAppVersion = () => {
  return String(
    Constants?.expoConfig?.version ||
    Constants?.manifest2?.extra?.expoClient?.version ||
    Constants?.manifest?.version ||
    '0.0.0'
  );
};

const parseSemver = (v) => String(v || '0.0.0').replace(/^v/i, '').split('.').map(x => Number(x || 0));

export const isVersionNewer = (latest, current) => {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
};

export const formatBytesAr = (bytes) => {
  const n = Number(bytes || 0);
  if (!n) return 'غير معروف';
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} ج.ب`;
};

export const fetchLatestGithubApkRelease = async () => {
  const cfg = getGithubReleaseConfig();
  if (!cfg.owner || !cfg.repo) {
    throw new Error('إعدادات GitHub Release غير مكتملة. يرجى ضبط owner/repo في app.json.');
  }

  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/latest`;
  const headers = { Accept: 'application/vnd.github+json' };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`تعذر جلب آخر إصدار من GitHub (${res.status}).`);
  }
  const json = await res.json();
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const pattern = String(cfg.assetPattern || '.apk').toLowerCase();
  const apkAsset = assets.find((a) => String(a?.name || '').toLowerCase().includes(pattern))
    || assets.find((a) => String(a?.name || '').toLowerCase().endsWith('.apk'));

  if (!apkAsset?.browser_download_url) {
    throw new Error('لم يتم العثور على ملف APK داخل آخر Release.');
  }

  return {
    tag: json.tag_name || '',
    name: json.name || '',
    body: json.body || '',
    publishedAt: json.published_at || '',
    asset: {
      name: apkAsset.name,
      size: Number(apkAsset.size || 0),
      url: apkAsset.browser_download_url,
      contentType: apkAsset.content_type || '',
    },
  };
};

let _downloadTask = null;

export const downloadReleaseApk = async ({ url, filename, onProgress }) => {
  if (!url) throw new Error('رابط التنزيل غير صالح.');
  const safeFileName = filename || `update_${Date.now()}.apk`;
  const targetUri = `${FileSystem.cacheDirectory}${safeFileName}`;

  _downloadTask = FileSystem.createDownloadResumable(
    url,
    targetUri,
    {},
    (progress) => {
      try {
        const total = Number(progress?.totalBytesExpectedToWrite || 0);
        const written = Number(progress?.totalBytesWritten || 0);
        const pct = total > 0 ? Math.round((written / total) * 100) : 0;
        if (typeof onProgress === 'function') onProgress(pct, written, total);
      } catch (e) { }
    }
  );

  const result = await _downloadTask.downloadAsync();
  _downloadTask = null;
  if (!result?.uri) throw new Error('فشل تنزيل ملف التحديث.');
  return result.uri;
};

export const cancelApkDownload = async () => {
  try {
    if (_downloadTask) {
      await _downloadTask.pauseAsync();
      _downloadTask = null;
    }
  } catch (e) { }
};

export const installDownloadedApk = async (apkUri) => {
  if (!apkUri) throw new Error('ملف التحديث غير موجود.');
  try {
    const contentUri = await FileSystem.getContentUriAsync(apkUri);
    const opened = await Linking.openURL(contentUri);
    if (!opened) {
      throw new Error('تعذر فتح مثبت التطبيق.');
    }
    return true;
  } catch (e) {
    try { await Linking.openSettings(); } catch (_) { }
    throw new Error('تعذر فتح مثبت APK. تأكد من السماح بتثبيت التطبيقات من هذا المصدر.');
  }
};
