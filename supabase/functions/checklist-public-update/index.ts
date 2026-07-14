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
    const { share_token, checked_item_ids, assignee_name, notes } = body ?? {};

    if (!share_token || typeof share_token !== "string" || share_token.length < 16 || share_token.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (checked_item_ids && !Array.isArray(checked_item_ids)) {
      return new Response(JSON.stringify({ error: "checked_item_ids must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (assignee_name && (typeof assignee_name !== "string" || assignee_name.length > 200)) {
      return new Response(JSON.stringify({ error: "Invalid assignee_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (notes && (typeof notes !== "string" || notes.length > 5000)) {
      return new Response(JSON.stringify({ error: "Invalid notes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Only allow updates while session is still in_progress
    const { data: existing, error: findErr } = await supabase
      .from("checklist_public_sessions")
      .select("id, status")
      .eq("share_token", share_token)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (existing.status !== "in_progress") {
      return new Response(JSON.stringify({ error: "Session is no longer editable" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, unknown> = {};
    if (checked_item_ids !== undefined) updates.checked_item_ids = checked_item_ids;
    if (assignee_name !== undefined) updates.assignee_name = assignee_name;
    if (notes !== undefined) updates.notes = notes;

    const { error: updErr } = await supabase
      .from("checklist_public_sessions")
      .update(updates)
      .eq("id", existing.id);

    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
