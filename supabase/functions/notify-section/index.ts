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
    const { section, payload, excludeUserId } = body as {
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
    };

    if (!section || !payload?.title) {
      return new Response(JSON.stringify({ error: "Missing section or payload.title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get all master_admin / admin user IDs using service role (bypasses RLS)
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["master_admin", "admin"]);

    const adminIds = new Set<string>((adminRoles ?? []).map((r: { user_id: string }) => r.user_id));

    // 2. Get all profiles to find users with section notifications enabled
    const { data: allProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, section_permissions");

    const extraIds: string[] = (allProfiles ?? [])
      .filter((p: { id: string; section_permissions: unknown }) => {
        if (adminIds.has(p.id)) return false;
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

    // 3. Insert one notification row per recipient using service role
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
