import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { token, projects, next_id, total_months, create_if_missing } = body ?? {};

    if (!token || typeof token !== "string" || token.length < 16 || token.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(projects)) {
      return new Response(JSON.stringify({ error: "projects must be an array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Cap payload size (defensive)
    const sizeKB = new TextEncoder().encode(JSON.stringify(projects)).length / 1024;
    if (sizeKB > 512) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const existing = await supabase
      .from("gantt_shared_boards")
      .select("id")
      .eq("share_token", token)
      .maybeSingle();

    if (!existing.data) {
      if (!create_if_missing) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("gantt_shared_boards").insert({
        share_token: token,
        projects,
        next_id: Number.isFinite(next_id) ? next_id : 1,
        total_months: Number.isFinite(total_months) ? total_months : 24,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("gantt_shared_boards")
        .update({
          projects,
          ...(Number.isFinite(next_id) ? { next_id } : {}),
          ...(Number.isFinite(total_months) ? { total_months } : {}),
        })
        .eq("share_token", token);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
