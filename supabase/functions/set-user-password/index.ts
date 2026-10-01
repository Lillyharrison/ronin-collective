import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Only master admins may set other people's passwords.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) return json({ error: "Not signed in" }, 401);
    const { data: isMaster } = await admin.rpc("has_role", { _user_id: caller.id, _role: "master_admin" });
    if (!isMaster) return json({ error: "Only master admins can set passwords" }, 403);

    const { userId, password, email } = await req.json();
    if (!userId || typeof userId !== "string") return json({ error: "userId required" }, 400);
    if (password !== undefined && (typeof password !== "string" || password.length < 8)) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Confirm the email too, so invited users who never clicked the link can sign in.
    const updates: Record<string, unknown> = { email_confirm: true };
    if (password) updates.password = password;
    if (email) updates.email = email;

    const { error } = await admin.auth.admin.updateUserById(userId, updates);
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
