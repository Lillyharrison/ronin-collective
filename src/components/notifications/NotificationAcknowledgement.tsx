import { useContext, useState, type ComponentProps, type ReactNode } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { ENTRY_ACK_CHANGED } from "@/lib/entryAcknowledgement";
import { SwipeableNotificationRow } from "./SwipeableNotificationRow";

export type ReceiptNotification = { id: string; actor_id?: string | null; receipt_sent_at?: string | null };
export const RECEIPT_CHANGED = "ronin:notification-receipt-changed";
const pending = new Set<string>();
// Rows can render outside a QueryClientProvider (tests, embedded lists); the
// fallback client keeps the hook safe there while events still sync real lists.
const fallbackClient = new QueryClient();
export function canSendReceipt(n: ReceiptNotification, userId: string | null) {
  return !!userId && !!n.actor_id && n.actor_id !== userId && !n.receipt_sent_at;
}
// Shared receipt state and the acknowledge call, so list rows (swipe action) and
// pop-ups (inline control) always go through the same locked, cache-synced path.
export function useReceiptAcknowledgement(notification: ReceiptNotification) {
  const { userId } = usePermissions();
  const { language } = useLanguage();
  const es = language === "es";
  const cache = useContext(QueryClientContext) ?? fallbackClient;
  const [busy, setBusy] = useState(false);
  const key = ["notification-receipt", userId, notification.id];
  const { data: current } = useQuery({ queryKey: key, initialData: notification, enabled: false, queryFn: async () => notification }, cache);
  const n = notification.receipt_sent_at ? notification : current;
  const eligible = canSendReceipt(n, userId);
  const acknowledge = async () => {
    const lock = `${userId}:${n.id}`;
    if (!canSendReceipt(n, userId) || !userId || pending.has(lock)) return;
    pending.add(lock); setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("acknowledge-notification", { body: { id: n.id } });
      if (error) {
        if (error.context instanceof Response) {
          const detail = await error.context.json().catch(() => null);
          throw new Error(detail?.error || error.message);
        }
        throw error;
      }
      if (!data?.acknowledged && !data?.already_acknowledged) throw new Error(data?.error || (es ? "No se pudo confirmar" : "Could not confirm acknowledgement"));
      // The RPC has persisted the receipt; reflect that confirmed result immediately.
      const updated = { ...n, receipt_sent_at: new Date().toISOString(), is_read: true };
      cache.setQueryData(key, updated);
      window.dispatchEvent(new CustomEvent(RECEIPT_CHANGED, { detail: updated }));
      window.dispatchEvent(new Event("ronin:notifications-changed"));
      window.dispatchEvent(new Event(ENTRY_ACK_CHANGED));
      void cache.invalidateQueries({ queryKey: ["notification-record"] });
      toast.success(es ? "Enterado" : "Acknowledged");
      if (data.push_failed) toast.error(es ? "Confirmado, pero no se pudo enviar la notificación al teléfono." : "Acknowledged, but the phone notification could not be sent.");
    } catch (error) { toast.error(error instanceof Error ? error.message : es ? "No se pudo confirmar" : "Could not acknowledge notification"); }
    finally { pending.delete(lock); setBusy(false); }
  };
  return { eligible, acknowledged: !!n.receipt_sent_at, busy, acknowledge, es };
}
export function NotificationAcknowledgement({ notification, hideAction = false }: { notification: ReceiptNotification; hideAction?: boolean }) {
  const { userId } = usePermissions();
  if (!notification.actor_id || notification.actor_id === userId || !userId) return null;
  return <ReceiptControl notification={notification} hideAction={hideAction} />;
}
function ReceiptControl({ notification, hideAction }: { notification: ReceiptNotification; hideAction: boolean }) {
  const { eligible, acknowledged, busy, acknowledge, es } = useReceiptAcknowledgement(notification);
  if (hideAction && !acknowledged) return null;
  return <div className="mt-1" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    {acknowledged ? <p role="status" className="flex items-center gap-1 text-xs text-muted-foreground min-h-11"><Check size={14} aria-hidden="true" />{es ? "Enterado" : "Acknowledged"}</p>
      : eligible ? <Button variant="outline" size="sm" className="min-h-11 text-xs" disabled={busy} onClick={acknowledge}>{es ? "Enterado" : "Acknowledge"}</Button> : null}
  </div>;
}
// List rows: swipe right (or hover button on desktop) to acknowledge, exactly like
// swipe left deletes/dismisses. Rows with nothing to acknowledge keep delete only.
export function ReceiptSwipeRow({ notification, children, ...rowProps }: { notification: ReceiptNotification; children: ReactNode } & Omit<ComponentProps<typeof SwipeableNotificationRow>, "secondaryAction">) {
  const receipt = useReceiptAcknowledgement(notification);
  const { language } = useLanguage();
  return <SwipeableNotificationRow {...rowProps}
    secondaryAction={receipt.eligible ? {
      onAction: () => { void receipt.acknowledge(); },
      label: language === "es" ? "Enterado" : "Acknowledge",
      icon: Check,
    } : undefined}
  >{children}</SwipeableNotificationRow>;
}
