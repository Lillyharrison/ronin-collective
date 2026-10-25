import { supabase } from "@/integrations/supabase/client";
import { fetchIssueForDetail } from "@/lib/fetchIssueForDetail";
import type { PlannedMaintenanceEntry } from "@/hooks/usePlannedMaintenance";

export const NOTIFICATION_DETAIL_TYPES = ["maintenance_issue", "planned_maintenance", "task", "calendar_event", "birthday"] as const;
export type NotificationDetailType = typeof NOTIFICATION_DETAIL_TYPES[number];
export function isNotificationDetailType(type: string | null): type is NotificationDetailType {
  return NOTIFICATION_DETAIL_TYPES.some(value => value === type);
}

async function propertyName(id: string | null) {
  if (!id) return null;
  const { data } = await supabase.from("properties").select("name").eq("id", id).maybeSingle();
  return data?.name ?? null;
}
async function personName(id: string | null) {
  if (!id) return null;
  const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name ?? null;
}

export async function fetchNotificationDetail(type: NotificationDetailType, id: string | null) {
  if (!id) return null;
  if (type === "maintenance_issue") {
    const record = await fetchIssueForDetail(id);
    return record ? { type, record } as const : null;
  }
  if (type === "planned_maintenance") {
    const { data, error } = await supabase.from("planned_maintenance")
      .select("id, title, description, vendor_id, property_id, assigned_to, date_type, scheduled_date, scheduled_end_date, scheduled_time, scheduled_month, scheduled_year, reminder_days, recurrence_months, status, last_service_date, calendar_event_id, created_by, created_at, updated_at")
      .eq("id", id).maybeSingle();
    if (error || !data) return null;
    const [property, assignee, vendor] = await Promise.all([
      propertyName(data.property_id), personName(data.assigned_to),
      data.vendor_id ? supabase.from("vendors").select("name, company").eq("id", data.vendor_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const record = { ...data, property_name: property ?? undefined, assignee_name: assignee ?? undefined, vendor_name: vendor.data?.name, vendor_company: vendor.data?.company } as PlannedMaintenanceEntry & { vendor_company?: string | null };
    return { type, record } as const;
  }
  if (type === "task") {
    const { data, error } = await supabase.from("tasks")
      .select("id, title_en, title_es, description_en, description_es, assigned_to, created_by, due_date, status, property_id")
      .eq("id", id).maybeSingle();
    if (error || !data) return null;
    const [property, assignee, sender] = await Promise.all([propertyName(data.property_id), personName(data.assigned_to), personName(data.created_by)]);
    return { type, record: { ...data, property_name: property, assignee_name: assignee, sender_name: sender } } as const;
  }
  if (type === "calendar_event") {
    const { data, error } = await supabase.from("calendar_events")
      .select("id, title, start_date, end_date, property_id, location, description, notes")
      .eq("id", id).maybeSingle();
    if (error || !data) return null;
    return { type, record: { ...data, property_name: await propertyName(data.property_id) } } as const;
  }
  const { data, error } = await supabase.from("profiles").select("id, full_name, avatar_url").eq("id", id).maybeSingle();
  return error || !data ? null : { type: "birthday", record: data } as const;
}