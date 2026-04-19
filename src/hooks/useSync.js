import { useState, useEffect, useCallback } from 'react';
import { isOnline, addSyncListener, syncNow } from '../services/SyncService';
import { getSyncQueueCount, subscribeDataChanges, getFailedSyncCount, resetFailedSyncItems } from '../services/database';
export function useSync() {
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const [failed, setFailed] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setPending(await getSyncQueueCount());
      setFailed(await getFailedSyncCount());
    } catch (e) {
      setPending(0);
      setFailed(0);
    }
    setOnline(isOnline());
  }, []);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  const retryFailed = useCallback(async () => {
    setSyncing(true);
    try {
      await resetFailedSyncItems();
      await syncNow();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const unsubSync = addSyncListener(refresh);
    const unsubData = subscribeDataChanges(refresh);
    return () => {
      unsubSync?.();
      unsubData?.();
    };
  }, [refresh]);

  return { online, pending, syncing, failed, refresh, runSync, retryFailed };
}
