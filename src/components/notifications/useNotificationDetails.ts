import { useCallback, useState } from "react";
import { useNavigation } from "@/contexts/NavigationContext";
import { isNotificationDetailType, type NotificationDetailType } from "@/lib/notificationDetail";

/** Shared viewing state; acknowledgment/deletion remain owned by each surface. */
export function useNotificationDetails(beforeEdit?: () => void) {
  const { setActiveSection, setPendingPlannedMaintenanceEntryId } = useNavigation();
  const [detailTarget, setDetailTarget] = useState<{ type: NotificationDetailType; id: string | null } | null>(null);
  const closeDetails = useCallback(() => setDetailTarget(null), []);
  const openDetails = useCallback((notification: { entity_type: string | null; entity_id: string | null }) => {
    if (!isNotificationDetailType(notification.entity_type)) return false;
    setDetailTarget({ type: notification.entity_type, id: notification.entity_id });
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