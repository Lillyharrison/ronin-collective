// Public endpoint: marks a checklist_public_sessions row as submitted and
// fans out a notification to all master_admins. No JWT required — the share
// token in the body acts as the secret.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { share_token, assignee_name, notes, checked_item_ids } = await req.json();
    if (!share_token || typeof share_token !== "string") {
      return new Response(JSON.stringify({ error: "share_token required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find session by token
    const { data: session, error: fetchErr } = await admin
      .from("checklist_public_sessions")
      .select("id, template_id, property_id, status")
      .eq("share_token", share_token)
      .maybeSingle();

    if (fetchErr || !session) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (session.status === "submitted") {
      return new Response(JSON.stringify({ error: "Already submitted" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await admin
      .from("checklist_public_sessions")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        assignee_name: assignee_name ?? null,
        notes: notes ?? null,
        checked_item_ids: Array.isArray(checked_item_ids) ? checked_item_ids : [],
      })
      .eq("id", session.id);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve template title for the notification body
    const { data: tpl } = await admin
      .from("checklist_templates")
      .select("title, icon")
      .eq("id", session.template_id)
      .maybeSingle();

    const { data: admins } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "master_admin");

    const adminIds: string[] = (admins ?? []).map((r: any) => r.user_id);
    if (adminIds.length > 0 && tpl) {
      const title = `${tpl.icon ?? "✅"} Checklist submitted: ${tpl.title}`;
      const body = `${assignee_name || "Someone"} completed and submitted this checklist.`;
      await admin.from("notifications").insert(
        adminIds.map((uid) => ({
          user_id: uid,
          title,
          body,
          type: "checklist_submitted",
          action_url: "checklists",
          entity_id: session.id,
          entity_type: "checklist_public_session",
          property_id: session.property_id,
        })),
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
