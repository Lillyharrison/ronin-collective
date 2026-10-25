import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";

import { X, Bell, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveSection } from "@/contexts/NavigationContext";
import { useNavigate } from "react-router-dom";
import { NotificationRecordDialog } from "@/components/NotificationRecordDialog";
import { isNotificationDetailType, type NotificationDetailType } from "@/lib/notificationDetail";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
  action_url: string | null;
  entity_id: string | null;
  entity_type: string | null;
  property: { name: string } | null;
}

const NOTIF_CHANGED = "ronin:notifications-changed";
const emitChanged = () => window.dispatchEvent(new Event(NOTIF_CHANGED));

const TYPE_STYLES: Record<string, { dot: string; bg: string }> = {
  success: { dot: "bg-[hsl(var(--status-done))]",   bg: "border-l-[hsl(var(--status-done))]" },
  warning: { dot: "bg-[hsl(var(--status-urgent))]", bg: "border-l-[hsl(var(--status-urgent))]" },
  alert:   { dot: "bg-[hsl(var(--status-urgent))]", bg: "border-l-[hsl(var(--status-urgent))]" },
  task:    { dot: "bg-[hsl(var(--gold))]",          bg: "border-l-[hsl(var(--gold))]" },
  message: { dot: "bg-accent",                      bg: "border-l-accent" },
  ai:      { dot: "bg-purple-400",                  bg: "border-l-purple-400" },
  info:    { dot: "bg-muted-foreground",             bg: "border-l-muted-foreground" },
};

/** Sections that can be deep-linked by entity_id stored in NavigationContext */
const SECTION_DEEP_LINK: Partial<Record<string, ActiveSection>> = {
  maintenance_issue:   "maintenance",
  planned_maintenance: "maintenance",
  task:                "tasks",
  order:               "orders",
  calendar_event:      "calendar",
  message:             "messages",
  property_rule:       "rules",
  checklist:           "checklists",
};

interface Props {
  open: boolean;
  onClose: () => void;
}

function SwipeNotificationRow({ revealed, resetEpoch, removing, onReveal, onClose, onDelete, deleteLabel, children }: {
  revealed: boolean; resetEpoch: number; removing: boolean; onReveal: () => void;
  onClose: () => void; onDelete: () => void; deleteLabel: string; children: ReactNode;
}) {
  const gesture = useRef<{ x: number; y: number; start: number; axis: "x" | "y" | null; offset: number } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState<number | null>(null);
  useEffect(() => { gesture.current = null; setOffset(null); }, [resetEpoch]);
  return <div className={cn("notification-collapse grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", removing && "grid-rows-[0fr] opacity-0 pointer-events-none")}>
    <div className="min-h-0 overflow-hidden">
      <div className="notification-swipe-row relative isolate overflow-hidden" data-revealed={revealed}>
        <Button variant="destructive" size="icon" aria-label={deleteLabel} disabled={removing}
          tabIndex={revealed ? 0 : -1} aria-hidden={!revealed}
          className={cn("notification-touch-delete absolute right-3 top-1/2 z-0 h-14 w-14 -translate-y-1/2 rounded-full text-notification-delete-foreground [&_svg]:size-[22px]", !revealed && "invisible")}
          onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 aria-hidden="true" /></Button>
        <div className={cn("notification-swipe-content relative z-10 bg-card touch-pan-y transition-transform duration-200 motion-reduce:transition-none", offset !== null && "transition-none")}
          style={{ transform: `translateX(${offset ?? (revealed ? -80 : 0)}px)` }}
          onTouchStart={e => {
            suppressClick.current = false;
            if (e.touches.length !== 1 || removing) return;
            const touch = e.touches[0];
            gesture.current = { x: touch.clientX, y: touch.clientY, start: revealed ? -80 : 0, axis: null, offset: revealed ? -80 : 0 };
          }}
          onTouchMove={e => {
            const current = gesture.current;
            if (!current || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - current.x;
            const dy = e.touches[0].clientY - current.y;
            if (!current.axis) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
              if (Math.abs(dy) >= Math.abs(dx)) current.axis = "y";
              else if (Math.abs(dx) > Math.abs(dy) * 1.5) current.axis = "x";
              else return;
            }
            if (current.axis !== "x") return;
            current.offset = Math.max(-80, Math.min(0, current.start + dx));
            setOffset(current.offset);
          }}
          onTouchEnd={e => {
            const current = gesture.current;
            gesture.current = null;
            setOffset(null);
            if (current?.axis !== "x") return;
            e.preventDefault(); // Do not synthesize a notification click after a swipe.
            suppressClick.current = true;
            if (current.offset <= -40) onReveal(); else onClose();
          }}
          onTouchCancel={() => { gesture.current = null; setOffset(null); }}
          onClickCapture={e => {
            if (suppressClick.current && e.detail !== 0) { e.stopPropagation(); suppressClick.current = false; return; }
            if (revealed) { e.stopPropagation(); onClose(); }
          }}
          onKeyDownCapture={e => {
            if (revealed && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); onClose(); }
          }}
        >{children}</div>
      </div>
    </div>
  </div>;
}

export function NotificationsPanel({ open, onClose }: Props) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { userId, isMasterAdmin } = usePermissions();
  const { setActiveSection, setPendingMaintenanceIssueId, setPendingPlannedMaintenanceEntryId, setPendingTaskId } = useNavigation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailTarget, setDetailTarget] = useState<{ type: NotificationDetailType; id: string | null } | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [resetEpoch, setResetEpoch] = useState(0);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const deletingIds = useRef(new Set<string>());
  const closeRevealed = useCallback(() => { setRevealedId(null); setResetEpoch(value => value + 1); }, []);
  useEffect(() => { closeRevealed(); }, [open, detailTarget, closeRevealed]);

  useEffect(() => {
    if (!open) setDetailTarget(null);
  }, [open]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Cleanup old notifications silently
    supabase.from("notifications").delete().eq("user_id", userId).lt("created_at", sevenDaysAgo);

    // Always filter by own user_id — prevents master_admin seeing duplicate rows
    // sent to other admins (RLS allows master_admin to read all, but we only want their own)
    const query = supabase
      .from("notifications")
      .select("id, title, body, type, is_read, created_at, action_url, entity_id, entity_type, property:properties(name)")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(60);

    const { data } = await query;
    setNotifications((data as Notification[]) ?? []);
    setLoading(false);
  }, [userId, isMasterAdmin]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Realtime for new notifications
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("notifications-panel")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    emitChanged();
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    emitChanged();
  };

  const deleteNotification = async (id: string) => {
    if (deletingIds.current.has(id)) return;
    deletingIds.current.add(id);
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) { deletingIds.current.delete(id); console.error("Notification delete failed", error); return; }
    closeRevealed();
    setRemovingIds(prev => new Set(prev).add(id));
    emitChanged();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) await new Promise(resolve => window.setTimeout(resolve, 200));
    setNotifications(prev => prev.filter(n => n.id !== id));
    setRemovingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    deletingIds.current.delete(id);
  };

  const handleNotificationClick = async (n: Notification) => {
    if (isNotificationDetailType(n.entity_type)) {
      if (!n.is_read) markRead(n.id);
      setDetailTarget({ type: n.entity_type, id: n.entity_id });
      return;
    }
    const targetSection: ActiveSection | undefined =
      (n.entity_type ? SECTION_DEEP_LINK[n.entity_type] : undefined) ??
      (n.action_url as ActiveSection | undefined);

    if (!n.is_read) markRead(n.id);

    // Set deep-link ID synchronously BEFORE closing/navigating so the ref
    // is populated when the target section mounts
    if (n.entity_type === "maintenance_issue" && n.entity_id) {
      setPendingMaintenanceIssueId(n.entity_id);
    } else if (n.entity_type === "planned_maintenance" && n.entity_id) {
      setPendingPlannedMaintenanceEntryId(n.entity_id);
    } else if (n.entity_type === "task" && n.entity_id) {
      setPendingTaskId(n.entity_id);
    }

    onClose();

    if (targetSection) {
      setActiveSection(targetSection);
      if (n.entity_type === "order" && n.entity_id) navigate(`/orders?order=${encodeURIComponent(n.entity_id)}`);
    }
  };

  const isClickable = (n: Notification) =>
    !!(isNotificationDetailType(n.entity_type) || n.action_url || (n.entity_type && SECTION_DEEP_LINK[n.entity_type]));

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-14 right-0 z-50 w-full max-w-sm bg-card border-l border-b border-border shadow-2xl animate-slide-in-right"
        style={{ maxHeight: "calc(100vh - 56px)", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-[hsl(var(--gold))]" />
            <span className="font-semibold text-sm text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-status-urgent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1" onScroll={closeRevealed}>
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Bell size={32} className="text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No notifications yet</p>
              <p className="text-xs text-muted-foreground/50 mt-1">Updates and alerts will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => {
                const styles = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
                const clickable = isClickable(n);
                return (
              <SwipeNotificationRow key={n.id} revealed={revealedId === n.id} resetEpoch={resetEpoch}
                removing={removingIds.has(n.id)} onReveal={() => { closeRevealed(); setRevealedId(n.id); }}
                onClose={closeRevealed} onDelete={() => deleteNotification(n.id)}
                deleteLabel={language === "es" ? "Eliminar notificación" : "Delete notification"}>
              <div className="group flex items-start">
              <div
                    onClick={() => handleNotificationClick(n)}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={clickable ? (e) => e.key === "Enter" && handleNotificationClick(n) : undefined}
                    className={cn(
                      "min-w-0 flex-1 flex items-start gap-3 px-4 py-3 text-left border-l-2 transition-colors",
                      styles.bg,
                      !n.is_read && "bg-muted/30",
                      clickable ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"
                    )}
                  >
                    {/* Status dot */}
                    <div className="mt-1.5 flex-shrink-0 relative">
                      <div className={cn("w-2 h-2 rounded-full", styles.dot)} />
                      {!n.is_read && (
                        <div className={cn("absolute inset-0 rounded-full animate-ping opacity-60", styles.dot)} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-semibold leading-snug", n.is_read ? "text-muted-foreground" : "text-foreground")}>
                        {n.title}
                      </p>
                      {n.property?.name && (
                        <p className="text-[11px] font-bold text-foreground mt-0.5 leading-relaxed">
                          {n.property.name}
                        </p>
                      )}
                      {n.body && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-muted-foreground/50">
                          {new Date(n.created_at).toLocaleString("en-US", {
                            month: "short", day: "numeric",
                            hour: "numeric", minute: "2-digit",
                          })}
                        </p>
                        {clickable && (
                          <span className="text-[10px] text-[hsl(var(--gold)/0.7)] flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink size={9} /> View
                          </span>
                        )}
                      </div>
                    </div>

                  </div>
                  <Button variant="ghost" size="icon"
                    aria-label={language === "es" ? "Eliminar notificación" : "Delete notification"}
                    disabled={removingIds.has(n.id)}
                    onClick={e => { e.stopPropagation(); deleteNotification(n.id); }}
                    className="notification-desktop-delete my-2 mr-2 h-11 w-11 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <Trash2 aria-hidden="true" />
                  </Button>
                  </div>
                </SwipeNotificationRow>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {detailTarget && <NotificationRecordDialog
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onEditPlanned={id => {
          setDetailTarget(null);
          setPendingPlannedMaintenanceEntryId(id);
          onClose();
          setActiveSection("maintenance");
        }}
      />}
    </>
  );
}

// Hook for unread count (used in header)
export function useNotificationCount() {
  const { userId } = usePermissions();
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    setUnreadCount(count ?? 0);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Realtime DELETE events only carry the primary key, so a `user_id` filter
  // never matches them — clearing notifications on another device would leave
  // this badge stale. Re-check whenever the tab/app regains focus.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener(NOTIF_CHANGED, load);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTIF_CHANGED, load);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("notif-count")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  return unreadCount;
}
