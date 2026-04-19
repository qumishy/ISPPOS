// ═══════════════════════════════════════════════════════
//  screens/MainScreens.js
//  هذا الملف تم تقسيمه إلى ملفات منفصلة لتقليل استهلاك الـ Tokens
// ═══════════════════════════════════════════════════════

export { default as InvoicesScreen } from './InvoicesListScreen';
export { default as CollectionsScreen } from './CollectionsListScreen';
export { default as InventoryScreen } from './InventoryListScreen';
export { default as POSScreen } from './POSListScreen';
export { default as WalletsScreen } from './WalletsListScreen';
export { default as WalletDetailScreen } from './WalletDetailScreen';
export { default as SuppliesScreen } from './SuppliesListScreen';
export { default as NotificationsScreen } from './NotificationsListScreen';

// إعادة تصدير InvoiceDetailScreen من مكانه الجديد للحفاظ على التوافق
export { default as InvoiceDetailScreen } from './InvoiceDetailScreen';
