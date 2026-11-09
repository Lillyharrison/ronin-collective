import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply({ ok: true });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply({ error: "Missing configuration" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return reply({ error: "Unauthorized" }, 401);
  const { data: user, error: authError } = await admin.auth.getUser(token);
  if (authError || !user.user) return reply({ error: "Unauthorized" }, 401);
  const { data: allowed, error: roleError } = await admin.rpc("is_admin_user", {
    _uid: user.user.id,
  });
  if (roleError || !allowed)
    return reply({ error: "Admin access required" }, 403);
  try {
    const people: any[] = [];
    for (let from = 0; ; from += 200) {
      const { data, error } = await admin
        .from("profiles")
        .select("id,full_name,level,is_archived")
        .eq("is_archived", false)
        .order("id")
        .range(from, from + 199);
      if (error) throw error;
      people.push(...data);
      if (data.length < 200) break;
    }
    const eligible = people.filter(
      (p) => !["principal", "extended_family"].includes(p.level),
    );
    const { data: ids, error } = await admin.rpc("ids_with_login", {
      _ids: eligible.map((p) => p.id),
    });
    if (error) throw error;
    return reply({ people: eligible.filter((p) => ids.includes(p.id)) });
  } catch {
    return reply({ error: "Could not load staff" }, 500);
  }
});
