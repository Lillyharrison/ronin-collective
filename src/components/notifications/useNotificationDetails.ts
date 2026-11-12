import { useCallback, useState } from "react";
import { useNavigation } from "@/contexts/NavigationContext";
import { isNotificationDetailType, type NotificationDetailType } from "@/lib/notificationDetail";
import type { ReceiptNotification } from "./NotificationAcknowledgement";

/** Shared viewing state; acknowledgment/deletion remain owned by each surface. */
export function useNotificationDetails(beforeEdit?: () => void) {
  const { setActiveSection, setPendingPlannedMaintenanceEntryId } = useNavigation();
  const [detailTarget, setDetailTarget] = useState<{ type: NotificationDetailType; id: string | null; notification?: ReceiptNotification } | null>(null);
  const closeDetails = useCallback(() => setDetailTarget(null), []);
  const openDetails = useCallback((notification: { entity_type: string | null; entity_id: string | null } & Partial<ReceiptNotification>) => {
    if (!isNotificationDetailType(notification.entity_type)) return false;
    setDetailTarget({ type: notification.entity_type, id: notification.entity_id, notification: notification.id ? { id: notification.id, actor_id: notification.actor_id, receipt_sent_at: notification.receipt_sent_at } : undefined });
    return true;
  }, []);
  const editPlanned = useCallback((id: string) => {
    closeDetails();
    setPendingPlannedMaintenanceEntryId(id);
    beforeEdit?.();
    setActiveSection("maintenance");
  }, [closeDetails, setPendingPlannedMaintenanceEntryId, setActiveSection, beforeEdit]);
  return { detailTarget, openDetails, closeDetails, editPlanned };
}