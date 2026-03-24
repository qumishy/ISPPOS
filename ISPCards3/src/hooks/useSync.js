import { useState, useEffect, useCallback } from 'react';
import { isOnline, addSyncListener, syncNow } from '../services/SyncService';
import { getSyncQueueCount, subscribeDataChanges } from '../services/database';

export function useSync() {
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPending(await getSyncQueueCount());
    } catch (e) {
      setPending(0);
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

  useEffect(() => {
    refresh();
    const unsubSync = addSyncListener(refresh);
    const unsubData = subscribeDataChanges(refresh);
    return () => {
      unsubSync?.();
      unsubData?.();
    };
  }, [refresh]);

  return { online, pending, syncing, refresh, runSync };
}
