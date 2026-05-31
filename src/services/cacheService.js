import { subscribeDataChanges } from './dbCore';

const cache = new Map();

// الاستماع لتغيرات قاعدة البيانات لتفريغ الكاش عند التحديثات المحلية أو المزامنة
subscribeDataChanges((event) => {
  const { type } = event || {};
  const inventoryDependentTypes = new Set(['batches', 'agent_wallets', 'invoice_items', 'invoices', 'collections']);
  
  if (type === 'all' || type === 'db_ready') {
    cache.clear();
  } else if (type) {
    if (inventoryDependentTypes.has(type)) {
      invalidateCachePrefix('batches:financial:');
      invalidateCachePrefix('reports:inventory_tracking:');
      invalidateCachePrefix('batches:all:');
      invalidateCachePrefix('agent_wallets:');
    }
    // حذف الكاش المرتبط بالجدول الذي تغير
    for (const key of cache.keys()) {
      if (key.startsWith(`${type}:`) || key.includes(`_${type}_`) || key.includes(type)) {
        cache.delete(key);
      }
    }
  }
});

/**
 * جلب البيانات من الكاش أو تنفيذ الدالة لجلبها وتخزينها
 * @param {string} key مفتاح الكاش (يفضل أن يبدأ باسم الجدول مثلاً invoices:filters)
 * @param {Function} fetcher دالة جلب البيانات إذا لم تكن في الكاش
 * @param {number} ttlMs مدة بقاء الكاش بالمللي ثانية (الافتراضي 60 ثانية)
 */
export const getCached = async (key, fetcher, ttlMs = 60000) => {
  const now = Date.now();
  const cached = cache.get(key);
  
  if (cached && (now - cached.timestamp < ttlMs)) {
    return cached.data;
  }
  
  const data = await fetcher();
  cache.set(key, { data, timestamp: now });
  return data;
};

export const invalidateCachePrefix = (prefix) => {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};

export const clearCache = () => {
  cache.clear();
};
