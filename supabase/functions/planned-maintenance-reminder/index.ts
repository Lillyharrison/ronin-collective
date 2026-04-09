import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Fetch all non-completed planned maintenance entries
  const { data: entries, error } = await supabase
    .from("planned_maintenance")
    .select("*")
    .in("status", ["to_be_booked", "booked", "initiated_by_vendor"]);

  if (error) {
    console.error("Error fetching planned maintenance:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  let remindersTriggered = 0;

  for (const entry of entries ?? []) {
    // Determine target date: specific date or 1st of the month
    let targetDate: Date | null = null;
    if (entry.date_type === "specific" && entry.scheduled_date) {
      targetDate = new Date(entry.scheduled_date);
    } else if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year) {
      targetDate = new Date(entry.scheduled_year, entry.scheduled_month - 1, 1);
    }

    if (!targetDate) continue;

    const reminderDate = new Date(targetDate);
    reminderDate.setDate(reminderDate.getDate() - (entry.reminder_days ?? 90));
    const reminderStr = reminderDate.toISOString().split("T")[0];

    if (reminderStr !== todayStr) continue;

    // Build human-readable date
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const dateLabel = entry.date_type === "specific"
      ? new Date(entry.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : `${months[entry.scheduled_month - 1]} ${entry.scheduled_year}`;

    const notifTitle = `🔧 Reminder: "${entry.title}" due in ${entry.reminder_days} days`;
    const notifBody = `Scheduled: ${dateLabel}. Time to confirm arrangements with your contractor.`;

    // Fan-out in-app notifications to users with maintenance alerts
    const { data: usersWithAlerts } = await supabase
      .from("user_section_permissions")
      .select("user_id")
      .eq("section", "maintenance")
      .eq("notifications", true);

    const { data: masterAdmins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "master_admin");

    const recipientIds = [
      ...new Set([
        ...(usersWithAlerts ?? []).map((u: any) => u.user_id),
        ...(masterAdmins ?? []).map((u: any) => u.user_id),
      ])
    ];

    // Apply property scoping — only notify users assigned to this property
    const filteredRecipients = entry.property_id
      ? await (async () => {
          const filtered: string[] = [];
          for (const uid of recipientIds) {
            // Master admins always receive
            const isMaster = (masterAdmins ?? []).some((u: any) => u.user_id === uid);
            if (isMaster) { filtered.push(uid); continue; }
            const { data: prof } = await supabase
              .from("profiles")
              .select("assigned_property_ids")
              .eq("id", uid)
              .single();
            if (prof?.assigned_property_ids?.includes(entry.property_id)) {
              filtered.push(uid);
            }
          }
          return filtered;
        })()
      : recipientIds;

    // Insert in-app notifications
    for (const uid of filteredRecipients) {
      await supabase.from("notifications").insert({
        user_id: uid,
        title: notifTitle,
        body: notifBody,
        type: "maintenance_reminder",
        action_url: "maintenance",
        entity_id: entry.id,
        entity_type: "planned_maintenance",
        property_id: entry.property_id ?? null,
      });
    }

    // Send push notifications
    if (filteredRecipients.length > 0) {
      const projectId = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
      await fetch(`https://${projectId}.supabase.co/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientUserIds: filteredRecipients,
          title: notifTitle,
          body: notifBody,
          url: "/maintenance",
        }),
      });
    }

    remindersTriggered++;
  }

  return new Response(
    JSON.stringify({ ok: true, remindersTriggered }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
