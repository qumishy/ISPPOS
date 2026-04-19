import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};

export async function exportRowsToCsv(filename, rows) {
  if (!rows || rows.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => headers.map(h => escapeCsv(row[h])).join(',')),
  ];

  const csv = '\uFEFF' + lines.join('\n');
  const fileUri = `${FileSystem.cacheDirectory}${filename}.csv`;

  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    return fileUri;
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: 'تصدير CSV',
    UTI: 'public.comma-separated-values-text',
  });

  return fileUri;
}
