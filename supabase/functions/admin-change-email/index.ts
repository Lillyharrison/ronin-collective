import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { signedInUserId } from "../_shared/internalAuth.ts";
import { sendPasswordRecovery } from "../_shared/passwordRecovery.ts";
import { changeEmail } from "./core.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    // Authenticate before body parsing or creating a privileged client.
    const caller = await signedInUserId(req);
    if (!caller) return reply(401, { error: "Please sign in to continue." });
    if (req.method !== "POST") return reply(405, { error: "Use a POST request." });
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return reply(500, { error: "Email changes are temporarily unavailable." });
    const userDb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: admin, error: roleError } = await userDb.rpc("is_admin_user", { _uid: caller });
    if (roleError || admin !== true) return reply(403, { error: "Only an admin can change login emails." });
    let body: unknown;
    try { body = await req.json(); } catch { return reply(400, { error: "Enter a valid person and email address." }); }
    const adminDb = createClient(url, service);
    const result = await changeEmail(body, {
      callerId: async () => caller,
      callerIsAdmin: async () => true,
      target: async id => {
        const [{ data: profile, error: pError }, { data: roles, error: rError }] = await Promise.all([
          adminDb.from("profiles").select("is_archived, is_draft").eq("id", id).maybeSingle(),
          adminDb.from("user_roles").select("role").eq("user_id", id).limit(10),
        ]);
        if (pError || rError) throw new Error("Target lookup failed");
        const master = roles?.some(r => r.role === "master_admin") ?? false;
        if (!profile || profile.is_draft || master || profile.is_archived) return { master, archived: !!profile?.is_archived, email: null };
        const { data, error } = await adminDb.auth.admin.getUserById(id);
        if (error && error.status !== 404) throw new Error("Login lookup failed");
        return { master, archived: false, email: data?.user?.email ?? null };
      },
      update: async (id, email, password) => (await adminDb.auth.admin.updateUserById(id, { email, email_confirm: true, password })).error,
      revoke: async id => !(await adminDb.rpc("revoke_user_sessions", { _uid: id })).error,
      send: email => sendPasswordRecovery(adminDb, email, req),
      audit: async (id, actor, old_email, new_email) => !(await adminDb.from("system_events").insert({ event_type: "login_email_changed", entity_type: "profile", entity_id: id, triggered_by: actor, payload: { old_email, new_email }, processed_by_ai: false })).error,
      password: () => Array.from(crypto.getRandomValues(new Uint8Array(48)), b => b.toString(16).padStart(2, "0")).join("") + "aA9!",
    });
    return reply(result.status, result.body);
  } catch {
    // Do not log Auth errors, request bodies, addresses or generated credentials.
    return reply(500, { error: "The email change could not be completed. Please ask an admin to check the account before trying again." });
  }
});