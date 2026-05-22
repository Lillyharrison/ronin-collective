// Public endpoint: given a share_token, returns the session + template + items
// + property name. Bypasses RLS via the service role since anon users can't
// read checklist_templates / checklist_items directly.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { share_token } = await req.json();
    if (!share_token || typeof share_token !== "string") {
      return new Response(JSON.stringify({ error: "share_token required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session, error: sErr } = await admin
      .from("checklist_public_sessions")
      .select("*")
      .eq("share_token", share_token)
      .maybeSingle();

    if (sErr || !session) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: template }, { data: items }] = await Promise.all([
      admin
        .from("checklist_templates")
        .select("id, title, icon, color, sections, cover_image_url")
        .eq("id", session.template_id)
        .maybeSingle(),
      admin
        .from("checklist_items")
        .select("id, title, icon, color, section, is_required, sort_order, photo_url, notes")
        .eq("template_id", session.template_id)
        .order("sort_order"),
    ]);

    let property_name: string | null = null;
    if (session.property_id) {
      const { data: prop } = await admin
        .from("properties")
        .select("name")
        .eq("id", session.property_id)
        .maybeSingle();
      property_name = prop?.name ?? null;
    }

    return new Response(
      JSON.stringify({ session, template, items: items ?? [], property_name }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
