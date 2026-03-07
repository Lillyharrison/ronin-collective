/**
 * Shared utility: fan-out an in-app notification to all users who have
 * section_permissions[section].notifications === true, plus all master_admin/admin users.
 *
 * Usage (frontend, anon key):
 *   await notifySection(supabase, "maintenance", { title: "...", body: "...", type: "info", action_url: "maintenance", entity_id: id, entity_type: "maintenance_issue" }, excludeUserId)
 *
 * Uses the service-role path via edge function for production, but for client-side calls
 * where we can only write to notifications for our own user_id, we insert per-user rows.
 * We read profiles client-side (allowed by RLS) to find recipients.
 */

import { supabase } from "@/integrations/supabase/client";

export interface NotifyPayload {
  title: string;
  body?: string;
  type?: string;
  action_url?: string;
  entity_id?: string;
  entity_type?: string;
  property_id?: string;
}

/**
 * Fan-out a notification to:
 *   - All master_admin / admin users
 *   - Any user whose section_permissions[section].notifications === true
 * Excludes excludeUserId (the actor who triggered the event).
 *
 * NOTE: Requires the authenticated user to be admin/master_admin so the
 * RLS INSERT policy ("Admins can insert notifications for anyone") is satisfied.
 * For non-admin actors (e.g. staff reporting an issue) we route through the
 * ronin-ai edge function instead (which uses the service role key).
 */
export async function notifySection(
  section: string,
  payload: NotifyPayload,
  excludeUserId?: string | null,
): Promise<void> {
  try {
    // 1. Fetch all admin/master_admin user ids
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["master_admin", "admin"]);

    const adminIds = new Set<string>((adminRoles ?? []).map((r: { user_id: string }) => r.user_id));

    // 2. Fetch all profiles to find users with the section notifications flag
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, section_permissions");

    const extraIds: string[] = (allProfiles ?? [])
      .filter((p: { id: string; section_permissions: unknown }) => {
        if (adminIds.has(p.id)) return false;
        const perms = p.section_permissions as Record<string, { notifications?: boolean }> | null;
        return perms?.[section]?.notifications === true;
      })
      .map((p: { id: string }) => p.id);

    const recipientSet = new Set<string>([...adminIds, ...extraIds]);
    if (excludeUserId) recipientSet.delete(excludeUserId);
    const recipients = [...recipientSet];
    if (!recipients.length) return;

    await supabase.from("notifications").insert(
      recipients.map((user_id) => ({
        user_id,
        title: payload.title,
        body: payload.body ?? null,
        type: payload.type ?? "info",
        action_url: payload.action_url ?? null,
        entity_id: payload.entity_id ?? null,
        entity_type: payload.entity_type ?? null,
        property_id: payload.property_id ?? null,
      }))
    );
  } catch (err) {
    console.warn("[notifySection] failed silently:", err);
  }
}
