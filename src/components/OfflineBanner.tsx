/**
 * OfflineBanner
 *
 * Thin status strip that sits below the Header.
 *  • Offline  → amber "You're offline" bar
 *  • Syncing  → blue "Syncing…" bar
 *  • Online, 0 pending → nothing (invisible)
 *  • Online, queue drained → brief green "All synced ✓" flash, then hides
 */

import { useEffect, useRef, useState } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing } = useOfflineSync();
  const [showSynced, setShowSynced] = useState(false);
  const prevSyncingRef = useRef(isSyncing);

  // Flash "All synced" for 2.5 s after a sync completes
  useEffect(() => {
    const wassyncing = prevSyncingRef.current;
    prevSyncingRef.current = isSyncing;
    if (wassyncing && !isSyncing && isOnline && pendingCount === 0) {
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), 2500);
      return () => clearTimeout(t);
    }
  }, [isSyncing, isOnline, pendingCount]);

  const hidden = isOnline && !isSyncing && pendingCount === 0 && !showSynced;
  if (hidden) return null;

  const variant =
    !isOnline         ? "offline"
    : isSyncing       ? "syncing"
    : showSynced      ? "synced"
    : pendingCount > 0 ? "pending"
    : null;

  if (!variant) return null;

  const configs = {
    offline: {
      bg:   "bg-amber-500/95",
      text: "text-amber-950",
      icon: <WifiOff size={13} className="shrink-0" />,
      msg:  "You're offline — changes will sync when you reconnect",
    },
    syncing: {
      bg:   "bg-blue-500/95",
      text: "text-blue-950",
      icon: <RefreshCw size={13} className="shrink-0 animate-spin" />,
      msg:  `Syncing${pendingCount > 0 ? ` ${pendingCount} item${pendingCount !== 1 ? "s" : ""}` : ""}…`,
    },
    synced: {
      bg:   "bg-emerald-500/95",
      text: "text-emerald-950",
      icon: <CheckCircle2 size={13} className="shrink-0" />,
      msg:  "All changes synced ✓",
    },
    pending: {
      bg:   "bg-amber-400/95",
      text: "text-amber-950",
      icon: <RefreshCw size={13} className="shrink-0" />,
      msg:  `${pendingCount} change${pendingCount !== 1 ? "s" : ""} waiting to sync`,
    },
  };

  const config = configs[variant];

  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-50 flex items-center justify-center gap-1.5 px-4 py-1 text-xs font-medium transition-all duration-300",
        config.bg,
        config.text,
      )}
      style={{ top: "calc(56px + env(safe-area-inset-top, 0px))" }}
    >
      {config.icon}
      <span>{config.msg}</span>
    </div>
  );
}


