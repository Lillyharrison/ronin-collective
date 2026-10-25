import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { IssueDetailDrawer } from "@/components/maintenance/IssueDetailDrawer";
import { PlannedMaintenanceDetail, DetailField, detailDate } from "@/components/maintenance/PlannedMaintenanceDetail";
import { fetchNotificationDetail, type NotificationDetailType } from "@/lib/notificationDetail";
import { imageUrl } from "@/lib/imageUrl";

export function NotificationRecordDialog({ target, onClose, onEditPlanned }: {
  target: { type: NotificationDetailType; id: string | null };
  onClose: () => void;
  onEditPlanned: (id: string) => void;
}) {
  const { language } = useLanguage();
  const { userId, canEdit, isManager, isAdmin, isMasterAdmin } = usePermissions();
  const es = language === "es";
  const { data, isPending } = useQuery({
    queryKey: ["notification-record", userId, target.type, target.id],
    queryFn: () => fetchNotificationDetail(target.type, target.id),
    staleTime: 0,
    retry: false,
  });
  const title = data?.type === "task" ? (es ? data.record.title_es || data.record.title_en : data.record.title_en)
    : data?.type === "birthday" ? data.record.full_name || (es ? "Cumpleaños" : "Birthday")
    : data?.record.title || (es ? "Detalles" : "Details");
  const closeLabel = es ? "Cerrar" : "Close";
  const statuses: Record<string, string> = es
    ? { pending: "Pendiente", in_progress: "En progreso", completed: "Completado" }
    : { pending: "Pending", in_progress: "In progress", completed: "Completed" };

  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[210] bg-background/80 backdrop-blur-sm" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        onPointerDownOutside={event => { if (window.getSelection()?.toString()) event.preventDefault(); }}
        className="fixed inset-x-0 bottom-0 z-[220] w-full sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-lg h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col border border-border rounded-t-lg sm:rounded-lg bg-background text-foreground shadow-lg"
      >
        {data?.type === "maintenance_issue" ? <>
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <IssueDetailDrawer embedded issue={data.record} categories={[]} onClose={onClose} />
        </> : <>
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-5">
            <DialogPrimitive.Title className="text-xl leading-snug break-words min-w-0">{title}</DialogPrimitive.Title>
            <Button variant="ghost" size="icon" className="shrink-0 h-11 w-11" onClick={onClose} aria-label={closeLabel}><X size={18} /></Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {isPending ? <div role="status" aria-label={es ? "Cargando" : "Loading"} className="space-y-5"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
            : !data ? <p className="text-base">{es ? "Este elemento ya no existe o ya no tienes acceso a él." : "This item no longer exists, or you no longer have access to it."}</p>
            : data.type === "planned_maintenance" ? <PlannedMaintenanceDetail entry={data.record} onEdit={canEdit("maintenance") || isManager || isAdmin || isMasterAdmin ? () => onEditPlanned(data.record.id) : undefined} />
            : data.type === "task" ? <dl className="grid gap-5">
              <DetailField label={es ? "Estado" : "Status"}>{statuses[data.record.status] ?? data.record.status}</DetailField>
              <DetailField label={es ? "Descripción" : "Description"}>{es ? data.record.description_es || data.record.description_en : data.record.description_en}</DetailField>
              <DetailField label={es ? "Asignado a" : "Assigned to"}>{data.record.assignee_name}</DetailField>
              <DetailField label={es ? "Enviado por" : "Sent by"}>{data.record.sender_name}</DetailField>
              <DetailField label={es ? "Fecha límite" : "Due date"}>{detailDate(data.record.due_date, language)}</DetailField>
              <DetailField label={es ? "Propiedad" : "Property"}>{data.record.property_name}</DetailField>
            </dl>
            : data.type === "calendar_event" ? <dl className="grid gap-5">
              <DetailField label={es ? "Fecha y hora" : "Date and time"}>{detailDate(data.record.start_date, language, data.record.start_date.length > 10)}{data.record.end_date && data.record.end_date !== data.record.start_date ? ` – ${detailDate(data.record.end_date, language, data.record.end_date.length > 10)}` : ""}</DetailField>
              <DetailField label={es ? "Propiedad" : "Property"}>{data.record.property_name}</DetailField>
              <DetailField label={es ? "Ubicación" : "Location"}>{data.record.location}</DetailField>
              <DetailField label={es ? "Descripción" : "Description"}>{data.record.description}</DetailField>
              <DetailField label={es ? "Notas" : "Notes"}>{data.record.notes}</DetailField>
            </dl>
            : data.type === "birthday" ? <div className="flex flex-col items-center gap-4 py-6 text-center">
              {data.record.avatar_url ? <img src={imageUrl(data.record.avatar_url)} alt={data.record.full_name ?? ""} className="h-24 w-24 rounded-full object-cover" /> : <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center text-3xl text-muted-foreground">{data.record.full_name?.charAt(0) ?? "🎂"}</div>}
              <p className="text-lg font-semibold">{data.record.full_name}</p><p className="text-base text-gold">{es ? "Cumpleaños hoy" : "Birthday today"}</p>
            </div> : null}
          </div>
          <div className="shrink-0 sticky bottom-0 border-t border-border bg-background p-4 flex justify-end"><Button variant="outline" className="min-h-11" onClick={onClose}>{closeLabel}</Button></div>
        </>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}