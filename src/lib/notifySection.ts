/**
 * Fan-out an in-app notification to all master_admin/admin users, plus any
 * user with section_permissions[section].notifications === true.
 *
 * Routes through the `notify-section` edge function (service role) so it works
 * even when the caller is a staff/family member who cannot read user_roles via RLS.
 */

import { supabase } from "@/integrations/supabase/client";

export interface NotifyPayload {
  title: string;
  body?: string;
  type?: string;
  /** Section name used for navigation on click, e.g. "maintenance" */
  action_url?: string;
  entity_id?: string;
  entity_type?: string;
  property_id?: string;
}

export async function notifySection(
  section: string,
  payload: NotifyPayload,
  excludeUserId?: string | null,
): Promise<void> {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/notify-section`;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ section, payload, excludeUserId }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn("[notifySection] edge function error:", res.status, text);
    }
  } catch (err) {
    console.warn("[notifySection] failed silently:", err);
  }
}
