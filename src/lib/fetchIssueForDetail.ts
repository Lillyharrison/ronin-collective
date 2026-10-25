import { supabase } from "@/integrations/supabase/client";
import type { MaintenanceIssue } from "@/hooks/useMaintenanceIssues";

/** One-record lookup through the normal signed-in client; all joins retain RLS. */
export async function fetchIssueForDetail(id: string): Promise<MaintenanceIssue | null> {
  const { data, error } = await supabase.from("maintenance_issues")
    .select("id, title, description, category, priority, status, property_id, location_detail, reported_by, assigned_to, photo_url, photo_urls, close_out_photo_url, scheduled_date, resolved_at, source, related_issue_id, is_draft, is_archived, created_at, updated_at")
    .eq("id", id).maybeSingle();
  if (error || !data) return null;
  const profileIds = [...new Set([data.reported_by, data.assigned_to].filter((value): value is string => Boolean(value)))];
  const [property, profiles, related] = await Promise.all([
    data.property_id ? supabase.from("properties").select("id, name").eq("id", data.property_id).maybeSingle() : Promise.resolve({ data: null }),
    profileIds.length ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", profileIds).limit(2) : Promise.resolve({ data: [] }),
    data.related_issue_id ? supabase.from("maintenance_issues").select("id, title").eq("id", data.related_issue_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const people = new Map((profiles.data ?? []).map(person => [person.id, person]));
  return {
    ...data,
    photo_urls: data.photo_urls ?? undefined,
    property_name: property.data?.name,
    reporter_name: people.get(data.reported_by)?.full_name ?? undefined,
    assignee_name: data.assigned_to ? people.get(data.assigned_to)?.full_name ?? undefined : undefined,
    assignee_avatar: data.assigned_to ? people.get(data.assigned_to)?.avatar_url ?? undefined : undefined,
    related_issue_title: related.data?.title,
  } as MaintenanceIssue;
}