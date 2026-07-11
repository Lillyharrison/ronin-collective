import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { token, action, shift } = body ?? {};

    if (!token || typeof token !== "string" || token.length < 16 || token.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["create", "update", "delete"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: share, error: shareErr } = await supabase
      .from("staff_schedule_shares")
      .select("week_start, week_end, revoked_at")
      .eq("share_token", token)
      .maybeSingle();
    if (shareErr) throw shareErr;
    if (!share) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (share.revoked_at) {
      return new Response(JSON.stringify({ error: "Link revoked" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rangeStart = share.week_start as string;
    const rangeEnd = (share.week_end as string) ?? addDays(rangeStart, 6);

    if (action === "create") {
      if (!shift?.staff_id || !shift?.shift_date) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!inRange(shift.shift_date, rangeStart, rangeEnd)) {
        return new Response(JSON.stringify({ error: "Date outside shared range" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase.from("staff_shifts").insert({
        staff_id: shift.staff_id,
        property_id: shift.property_id ?? null,
        schedule_id: shift.schedule_id ?? null,
        shift_date: shift.shift_date,
        start_time: shift.start_time ?? null,
        end_time: shift.end_time ?? null,
        status: shift.status ?? "scheduled",
        notes: shift.notes ?? null,
      }).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, shift: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      if (!shift?.id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existing, error: exErr } = await supabase
        .from("staff_shifts").select("shift_date").eq("id", shift.id).maybeSingle();
      if (exErr) throw exErr;
      if (!existing || !inRange(existing.shift_date, rangeStart, rangeEnd)) {
        return new Response(JSON.stringify({ error: "Shift not in shared range" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (shift.shift_date && !inRange(shift.shift_date, rangeStart, rangeEnd)) {
        return new Response(JSON.stringify({ error: "New date outside shared range" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const patch: Record<string, unknown> = {};
      for (const k of ["property_id", "shift_date", "start_time", "end_time", "status", "notes"]) {
        if (k in shift) patch[k] = shift[k];
      }
      const { error } = await supabase.from("staff_shifts").update(patch).eq("id", shift.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      if (!shift?.id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existing, error: exErr } = await supabase
        .from("staff_shifts").select("shift_date").eq("id", shift.id).maybeSingle();
      if (exErr) throw exErr;
      if (!existing || !inRange(existing.shift_date, rangeStart, rangeEnd)) {
        return new Response(JSON.stringify({ error: "Shift not in shared range" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("staff_shifts").delete().eq("id", shift.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unhandled" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
