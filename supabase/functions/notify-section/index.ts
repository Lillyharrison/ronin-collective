import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { section, payload, excludeUserId, idempotencyKey } = body as {
      section: string;
      payload: {
        title: string;
        body?: string;
        type?: string;
        action_url?: string;
        entity_id?: string;
        entity_type?: string;
        property_id?: string;
      };
      excludeUserId?: string | null;
      /**
       * Optional dedup key (e.g. `maintenance-create-{issueId}`).
       * If provided and a notification with this entity_id + entity_type + property_id
       * was already inserted within the last 10 seconds, we skip to avoid duplicates.
       */
      idempotencyKey?: string | null;
    };

    if (!section || !payload?.title) {
      return new Response(JSON.stringify({ error: "Missing section or payload.title" }), {
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

    // 1. Get all master_admin / admin user IDs
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["master_admin", "admin"]);

    const adminIds = new Set<string>((adminRoles ?? []).map((r: { user_id: string }) => r.user_id));

    // 2. If the notification is property-scoped, only consider profiles assigned to that property.
    //    This prevents a 50-staff fan-out when only 5 people manage that property.
    let profileQuery = supabaseAdmin.from("profiles").select("id, section_permissions, assigned_property_ids");
    // (No server-side filter on property here; we filter client-side below so
    // master_admins without an assigned_property_ids still get notified.)

    const { data: allProfiles } = await profileQuery;

    const extraIds: string[] = (allProfiles ?? [])
      .filter((p: { id: string; section_permissions: unknown; assigned_property_ids: string[] | null }) => {
        if (adminIds.has(p.id)) return false; // already included

        // If notification is property-scoped, the user must be assigned to that property
        if (payload.property_id) {
          const assigned = p.assigned_property_ids ?? [];
          if (!assigned.includes(payload.property_id)) return false;
        }

        const perms = p.section_permissions as Record<string, { notifications?: boolean }> | null;
        return perms?.[section]?.notifications === true;
      })
      .map((p: { id: string }) => p.id);

    const recipientSet = new Set<string>([...adminIds, ...extraIds]);
    if (excludeUserId) recipientSet.delete(excludeUserId);
    const recipients = [...recipientSet];

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
