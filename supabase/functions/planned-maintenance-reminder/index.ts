import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { eligibleNotificationRecipients, reminderCandidates } from "../_shared/notificationAudience.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response(JSON.stringify({ error: "Missing configuration" }), { status: 500, headers: corsHeaders });
  const supabase = createClient(url, serviceKey);

  try {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // ── Phase 1: Auto-flip future / completed-recurring entries to "to_be_booked" when within reminder window ──
  let autoFlipped = 0;

  const { data: candidateEntries } = await supabase
    .from("planned_maintenance")
    .select("id, title, assigned_to, property_id, date_type, scheduled_date, scheduled_month, scheduled_year, reminder_days, recurrence_months, status")
    .or("status.eq.future,and(status.eq.completed,recurrence_months.not.is.null)")
    .limit(1000);

  for (const entry of candidateEntries ?? []) {
    let targetDate: Date | null = null;
    if (entry.date_type === "specific" && entry.scheduled_date) {
      targetDate = new Date(entry.scheduled_date);
    } else if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year) {
      targetDate = new Date(entry.scheduled_year, entry.scheduled_month - 1, 1);
    }
    if (!targetDate) continue;

    const daysUntilNext = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const reminderDays = entry.reminder_days ?? 90;

    if (daysUntilNext <= reminderDays) {
      await supabase
        .from("planned_maintenance")
        .update({ status: "to_be_booked" })
        .eq("id", entry.id);
      autoFlipped++;
    }
  }

  // ── Phase 2: Send reminders for upcoming entries ──
  const { data: entries, error } = await supabase
    .from("planned_maintenance")
    .select("id, title, assigned_to, property_id, date_type, scheduled_date, scheduled_month, scheduled_year, reminder_days, recurrence_months, status")
    .in("status", ["to_be_booked", "booked", "initiated_by_vendor"])
    .limit(1000);

  if (error) {
    console.error("Error fetching planned maintenance:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  let remindersTriggered = 0;

  // Pre-load property names for any entry linked to a property
  const propertyIds = [...new Set((entries ?? []).map((e: any) => e.property_id).filter(Boolean))];
  const propertyMap = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name")
      .in("id", propertyIds);
    for (const p of properties ?? []) {
      propertyMap.set(p.id, p.name);
    }
  }

  for (const entry of entries ?? []) {
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

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dateLabel = entry.date_type === "specific"
      ? new Date(entry.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : `${months[entry.scheduled_month - 1]} ${entry.scheduled_year}`;

    const propertyName = entry.property_id ? propertyMap.get(entry.property_id) : null;
    const notifTitle = `🔧 Reminder: "${entry.title}" due in ${entry.reminder_days} days`;
    const notifBody = `Scheduled: ${dateLabel}. Time to confirm arrangements with your contractor.`;
    const pushBody = propertyName
      ? `Property: ${propertyName}. ${notifBody}`
      : notifBody;

    // A window reminder belongs to the responsible person, not the alert audience.
    const { data: masterAdmins, error: roleError } = await supabase
      .from("user_roles").select("user_id").eq("role", "master_admin").limit(1000);
    if (roleError) throw roleError;
    const masterIds = (masterAdmins ?? []).map(u => u.user_id);
    const candidates = [...new Set([...masterIds, ...(entry.assigned_to ? [entry.assigned_to] : [])])];
    const { data: loginIds, error: loginError } = await supabase.rpc("ids_with_login", { _ids: candidates });
    if (loginError) throw loginError;
    const recipients = eligibleNotificationRecipients(
      reminderCandidates(entry.assigned_to, loginIds ?? [], masterIds), loginIds ?? [],
    );

    // Persistent day/event dedup: a retry must not create another row or push.
    const { data: existing, error: dedupError } = await supabase.from("notifications")
      .select("user_id").eq("entity_id", entry.id).eq("entity_type", "planned_maintenance")
      .eq("type", "maintenance_reminder").eq("title", notifTitle)
      .gte("created_at", `${todayStr}T00:00:00Z`).lt("created_at", `${todayStr}T23:59:59.999Z`).limit(1000);
    if (dedupError) throw dedupError;
    const alreadyNotified = new Set((existing ?? []).map(n => n.user_id));
    const filteredRecipients = recipients.filter(id => !alreadyNotified.has(id));
    if (!filteredRecipients.length) continue;
    const { error: insertError } = await supabase.from("notifications").insert(filteredRecipients.map(uid => ({
      user_id: uid, title: notifTitle, body: notifBody, type: "maintenance_reminder",
      action_url: "maintenance", entity_id: entry.id, entity_type: "planned_maintenance",
      property_id: entry.property_id ?? null,
    })));
    if (insertError) throw insertError;

    // Send push notifications
    if (filteredRecipients.length > 0) {
      const response = await fetch(`${url}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          recipientUserIds: filteredRecipients,
          title: notifTitle,
          body: pushBody,
          url: "/maintenance",
        }),
      });
      await response.text();
    }

    remindersTriggered++;
  }

  return new Response(
    JSON.stringify({ ok: true, autoFlipped, remindersTriggered }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
  } catch (error) {
    console.error("Planned reminder failed:", error);
    return new Response(JSON.stringify({ error: "Reminder processing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
