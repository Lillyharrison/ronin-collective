import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { eligibleNotificationRecipients } from "../_shared/notificationAudience.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Missing notification configuration");
    const supabaseAdmin = createClient(url, serviceKey);

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      url,
      anonKey,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const schema = z.object({
      section: z.union([z.string().min(1).max(100), z.array(z.string().min(1).max(100)).max(100)]).optional(),
      userIds: z.array(z.string().uuid()).max(1000).optional(),
      excludeUserId: z.string().uuid().nullable().optional(),
      excludeUserIds: z.array(z.string().uuid()).max(1000).optional(),
      idempotencyKey: z.string().nullable().optional(),
      payload: z.object({ title: z.string().min(1).max(1000), body: z.string().max(10000).optional(), type: z.string().max(100).optional(), action_url: z.string().max(2000).optional(), entity_id: z.string().uuid().optional(), entity_type: z.string().max(100).optional(), property_id: z.string().uuid().optional() }),
    });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { section, userIds, payload, excludeUserId, excludeUserIds } = parsed.data;
    const sections = Array.isArray(section)
      ? section.filter(Boolean)
      : section
        ? [section]
        : [];

    if ((!sections.length && !(userIds && userIds.length > 0)) || !payload?.title) {
      return new Response(JSON.stringify({ error: "Missing section/userIds or payload.title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Idempotency guard ───────────────────────────────────────────────────────
    // If entity_id is provided, check whether notifications for this exact event
    // were already inserted in the last 15 seconds.  This prevents duplicate fan-outs
    // from rapid UI re-renders or double-triggers.
    if (payload.entity_id && payload.entity_type) {
      const windowStart = new Date(Date.now() - 15_000).toISOString();
      const { count } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", payload.entity_id)
        .eq("entity_type", payload.entity_type)
        .eq("title", payload.title)
        .gte("created_at", windowStart);

      if ((count ?? 0) > 0) {
        console.log(`[notify-section] dedup: skipping — ${count} matching rows in last 15s for entity ${payload.entity_id}`);
        return new Response(
          JSON.stringify({ inserted: 0, message: "Duplicate suppressed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Build recipient list ────────────────────────────────────────────────────

    let recipients: string[];

    if (userIds && userIds.length > 0) {
      // Direct targeting: notify the specified users only, bypassing the
      // admin-role and section-permission lookup (used for assignment
      // notifications where only the assignee should be notified).
      const recipientSet = new Set<string>(userIds);
      if (excludeUserId) recipientSet.delete(excludeUserId);
      recipients = [...recipientSet];
    } else {
      // 1. Get all master_admin / admin user IDs
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["master_admin", "admin"]);

      const adminIds = new Set<string>((adminRoles ?? []).map((r: { user_id: string }) => r.user_id));

      // 2. Find users who opted into notifications for this section (single query on the
      //    user_section_permissions table — the source of truth).
      const { data: permRows } = await supabaseAdmin
        .from("user_section_permissions")
        .select("user_id")
        .in("section", sections)
        .eq("notifications", true);

      const optedInIds = new Set<string>((permRows ?? []).map((r: { user_id: string }) => r.user_id));

      // 3. If property-scoped, filter opted-in users to those assigned to that property.
      let extraIds: string[] = [];
      if (optedInIds.size > 0) {
        const candidateIds = [...optedInIds].filter(id => !adminIds.has(id));
        if (candidateIds.length > 0) {
          if (payload.property_id) {
            const { data: profs } = await supabaseAdmin
              .from("profiles")
              .select("id, assigned_property_ids")
              .in("id", candidateIds);
            extraIds = (profs ?? [])
              .filter((p: { id: string; assigned_property_ids: string[] | null }) =>
                (p.assigned_property_ids ?? []).includes(payload.property_id))
              .map((p: { id: string }) => p.id);
          } else {
            extraIds = candidateIds;
          }
        }
      }

      const recipientSet = new Set<string>([...adminIds, ...extraIds]);
      if (excludeUserId) recipientSet.delete(excludeUserId);
      recipients = [...recipientSet];
    }

    const { data: loginIds, error: loginError } = await supabaseAdmin.rpc("ids_with_login", { _ids: recipients });
    if (loginError) throw loginError;
    recipients = eligibleNotificationRecipients(recipients, loginIds ?? [], excludeUserId, excludeUserIds);

    if (!recipients.length) {
      return new Response(JSON.stringify({ inserted: 0, message: "No recipients found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Insert notifications in a single batch ──────────────────────────────────
    const { error: insertError } = await supabaseAdmin.from("notifications").insert(
      recipients.map((uid) => ({
        user_id: uid,
        title: payload.title,
        body: payload.body ?? null,
        type: payload.type ?? "info",
        action_url: payload.action_url ?? null,
        entity_id: payload.entity_id ?? null,
        entity_type: payload.entity_type ?? null,
        property_id: payload.property_id ?? null,
      }))
    );

    if (insertError) {
      console.error("[notify-section] insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire the actual push notifications to subscribed devices for the same recipients.
    // Best-effort / non-blocking: a push failure should never fail the in-app notification insert.
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          recipientUserIds: recipients,
          title: payload.title,
          body: payload.body ?? "",
          url: payload.action_url ?? "/",
        }),
      });
    } catch (pushErr) {
      console.error("[notify-section] push dispatch failed:", pushErr);
    }

    return new Response(
      JSON.stringify({ inserted: recipients.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[notify-section] unhandled error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
