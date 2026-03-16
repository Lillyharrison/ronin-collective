/**
 * useOfflineSync
 *
 * Global singleton hook that:
 *  1. Tracks real-time online/offline status
 *  2. Flushes the IndexedDB mutation queue whenever connectivity returns
 *  3. Exposes { isOnline, pendingCount, isSyncing } for the UI
 *
 * Mount this ONCE at the AppShell level. All other hooks read from
 * the shared OfflineSyncContext rather than creating their own listeners.
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAllPending,
  dequeue,
  incrementRetry,
  pendingCount as dbPendingCount,
  PendingMutation,
} from "@/lib/offlineDB";

const MAX_RETRIES = 5;

// ── Context ───────────────────────────────────────────────────────────────────

interface SyncCtx {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  /** Call from any hook to enqueue a mutation and update pendingCount. */
  notifyQueued: () => void;
}

export const OfflineSyncContext = createContext<SyncCtx>({
  isOnline: navigator.onLine,
  pendingCount: 0,
  isSyncing: false,
  notifyQueued: () => {},
});

export const useOfflineSync = () => useContext(OfflineSyncContext);

// ── Flush helpers ─────────────────────────────────────────────────────────────

async function flushMutation(m: PendingMutation): Promise<boolean> {
  try {
    if (m.op === "insert") {
      const { error } = await supabase.from(m.table as never).insert(m.payload as never);
      if (error) throw error;
    } else if (m.op === "delete" && m.filter) {
      let q = supabase.from(m.table as never).delete();
      for (const [col, val] of Object.entries(m.filter)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = (q as any).eq(col, val);
      }
      const { error } = await q;
      if (error) throw error;
    } else if (m.op === "update" && m.filter) {
      let q = supabase.from(m.table as never).update(m.payload as never);
      for (const [col, val] of Object.entries(m.filter)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = (q as any).eq(col, val);
      }
      const { error } = await q;
      if (error) throw error;
    }
    return true;
  } catch {
    return false;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline]       = useState(navigator.onLine);
  const [pending, setPending]         = useState(0);
  const [isSyncing, setIsSyncing]     = useState(false);
  const flushingRef                   = useRef(false);

  // Keep pending count in sync with DB
  const refreshCount = useCallback(async () => {
    const n = await dbPendingCount();
    setPending(n);
  }, []);

  // Called by hooks after they enqueue a mutation
  const notifyQueued = useCallback(() => {
    setPending(prev => prev + 1);
  }, []);

  // Flush the entire queue
  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setIsSyncing(true);

    try {
      const mutations = await getAllPending();
      for (const m of mutations) {
        if (m.retries >= MAX_RETRIES) {
          await dequeue(m.id); // give up on this one
          continue;
        }
        const ok = await flushMutation(m);
        if (ok) {
          await dequeue(m.id);
        } else {
          await incrementRetry(m.id);
        }
      }
    } finally {
      flushingRef.current = false;
      setIsSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  // Online / offline listeners
  useEffect(() => {
    const goOnline  = () => { setIsOnline(true);  flush(); };
    const goOffline = () => { setIsOnline(false); };

    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    // Flush any residual queue from a previous session
    if (navigator.onLine) flush();
    else refreshCount();

    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flush, refreshCount]);

  // Listen for service worker Background Sync signal (Chrome/Android)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "SYNC_QUEUE") flush();
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [flush]);

  return (
    <OfflineSyncContext.Provider value={{ isOnline, pendingCount: pending, isSyncing, notifyQueued }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}
