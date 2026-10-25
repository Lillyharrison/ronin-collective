import { useLanguage } from "@/contexts/LanguageContext";
import type { PlannedMaintenanceEntry } from "@/hooks/usePlannedMaintenance";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

export function detailDate(value: string | null, language: string, withTime = false) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(language === "es" ? "es" : "en-US", {
    day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "numeric" as const, minute: "2-digit" as const } : {}),
  });
}

export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return <div className="min-w-0"><dt className="text-sm text-muted-foreground mb-1">{label}</dt><dd className="text-base text-foreground whitespace-pre-wrap break-words">{children}</dd></div>;
}

export function PlannedMaintenanceDetail({ entry, onEdit }: {
  entry: PlannedMaintenanceEntry & { vendor_company?: string | null }; onEdit?: () => void;
}) {
  const { language } = useLanguage();
  const es = language === "es";
  const statuses: Record<string, string> = es
    ? { future: "Futuro", to_be_booked: "Por reservar", booked: "Reservado", initiated_by_vendor: "Iniciado por proveedor", recurring: "Recurrente", as_needed: "Según necesidad", completed: "Completado", cancelled: "Cancelado" }
    : { future: "Future", to_be_booked: "To be booked", booked: "Booked", initiated_by_vendor: "Initiated by vendor", recurring: "Recurring", as_needed: "As needed", completed: "Completed", cancelled: "Cancelled" };
  const roughDate = entry.scheduled_month && entry.scheduled_year
    ? new Date(entry.scheduled_year, entry.scheduled_month - 1, 1).toLocaleDateString(es ? "es" : "en-US", { month: "short", year: "numeric" }) : "—";
  const date = entry.date_type === "specific" && entry.scheduled_date
    ? `${detailDate(entry.scheduled_date, language)}${entry.scheduled_end_date ? ` – ${detailDate(entry.scheduled_end_date, language)}` : ""}${entry.scheduled_time ? ` · ${entry.scheduled_time.slice(0, 5)}` : ""}` : roughDate;
  const recurrence = entry.recurrence_months === -1 ? (es ? "Semanal" : "Weekly")
    : entry.recurrence_months === -2 ? (es ? "Mensual" : "Monthly")
    : entry.recurrence_months && entry.recurrence_months > 0 ? (es ? `Cada ${entry.recurrence_months} meses` : `Every ${entry.recurrence_months} month${entry.recurrence_months === 1 ? "" : "s"}`)
    : (es ? "No se repite" : "Does not repeat");
  return <>
    <span className={`inline-block rounded border px-2 py-1 text-sm ${entry.status === "completed" ? "status-done" : entry.status === "booked" ? "status-progress" : "bg-muted text-muted-foreground border-border"}`}>{statuses[entry.status]}</span>
    <dl className="grid gap-5 mt-5">
      <DetailField label={es ? "Propiedad" : "Property"}>{entry.property_name}</DetailField>
      <DetailField label={es ? "Asignado a" : "Assigned to"}>{entry.assignee_name}</DetailField>
      <DetailField label={es ? "Proveedor" : "Vendor"}>{[entry.vendor_name, entry.vendor_company].filter(Boolean).join(" · ")}</DetailField>
      <DetailField label={es ? "Fecha" : "Date"}>{date}</DetailField>
      <DetailField label={es ? "Plazo para reservar" : "Booking window"}>{entry.reminder_days > 0 ? (es ? `${entry.reminder_days} días antes` : `${entry.reminder_days} days before`) : (es ? "Recordatorio desactivado" : "Reminder disabled")}</DetailField>
      <DetailField label={es ? "Repetición" : "Recurrence"}>{recurrence}</DetailField>
      <DetailField label={es ? "Último servicio" : "Last service"}>{detailDate(entry.last_service_date, language)}</DetailField>
      <DetailField label={es ? "Descripción / Notas" : "Description / Notes"}>{entry.description}</DetailField>
    </dl>
    {onEdit && <Button variant="outline" className="mt-5 min-h-11" onClick={onEdit}><Pencil size={16} className="mr-2" />{es ? "Editar" : "Edit"}</Button>}
  </>;
}