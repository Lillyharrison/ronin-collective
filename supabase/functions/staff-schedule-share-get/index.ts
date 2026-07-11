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

function clamp(iso: string, min: string, max: string) {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { token, week_start: requestedWeekStart } = body ?? {};
    if (!token || typeof token !== "string" || token.length < 16 || token.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: share, error: shareErr } = await supabase
      .from("staff_schedule_shares")
      .select("id, week_start, week_end, label, revoked_at, created_by")
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

    // The client can request a specific week within the range. Default to first week.
    let weekStart = typeof requestedWeekStart === "string" ? requestedWeekStart : rangeStart;
    weekStart = clamp(weekStart, rangeStart, rangeEnd);
    let weekEnd = addDays(weekStart, 6);
    if (weekEnd > rangeEnd) weekEnd = rangeEnd;

    const [staffRes, propertiesRes, shiftsRes, schedulesRes, leaveRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url, job_title, department, assigned_property_ids, is_draft, contracted_days_per_week, contracted_hours_per_week, annual_leave_days, start_date, level")
        .not("level", "in", "(principal,extended_family)")
        .order("full_name"),
      supabase.from("properties").select("id, name").order("name"),
      supabase
        .from("staff_shifts")
        .select("id, staff_id, property_id, schedule_id, shift_date, start_time, end_time, status, notes")
        .gte("shift_date", weekStart)
        .lte("shift_date", weekEnd)
        .limit(500),
      supabase
        .from("staff_schedules")
        .select("id, staff_id, property_id, day_of_week, start_time, end_time, effective_from, effective_to, is_active, notes")
        .eq("is_active", true)
        .lte("effective_from", weekEnd)
        .or(`effective_to.is.null,effective_to.gte.${weekStart}`)
        .limit(500),
      supabase
        .from("staff_leave_requests")
        .select("id, staff_id, status, start_date, end_date, leave_type")
        .eq("status", "approved")
        .lte("start_date", weekEnd)
        .gte("end_date", weekStart)
        .limit(500),
    ]);

    return new Response(JSON.stringify({
      week_start: weekStart,
      week_end: weekEnd,
      range_start: rangeStart,
      range_end: rangeEnd,
      label: share.label,
      staff: staffRes.data ?? [],
      properties: propertiesRes.data ?? [],
      shifts: shiftsRes.data ?? [],
      schedules: schedulesRes.data ?? [],
      leave_requests: leaveRes.data ?? [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
