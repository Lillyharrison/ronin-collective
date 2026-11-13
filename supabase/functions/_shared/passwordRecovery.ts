import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Same recovery-link mechanism used by Ronin's send_password_reset action. */
export async function sendPasswordRecovery(db: SupabaseClient, email: string, req: Request, redirectOverride?: string) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/") || "https://ronin-collective.lovable.app";
  const redirectTo = redirectOverride || `${origin}/reset-password`;
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  if (error || !data?.properties?.action_link) return false;
  const response = await fetch(data.properties.action_link, { method: "GET" });
  await response.text();
  return response.ok;
}