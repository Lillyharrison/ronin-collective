import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Internal webhook secret — must match the value in the DB trigger function
const WEBHOOK_SECRET = "ronin-event-webhook-2026";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ronin-webhook-secret",
};

// ─── KEYWORD → EVENT CLASSIFICATION MAP ──────────────────────────────────────
const TRAVEL_KEYWORDS = ["travel", "trip", "fly", "flight", "airport", "vacation", "holiday", "departure", "return", "montana", "aspen", "hamptons", "miami", "paris", "london", "ski", "skiing", "snowboard", "beach", "europe", "mexico", "caribbean", "yacht", "boat"];
const GUEST_KEYWORDS  = ["guest", "visitor", "arriving", "arrival", "check-in", "checkout", "check out", "host", "hosting", "welcome", "stay", "overnight"];
const MAINTENANCE_KEYWORDS = ["maintenance", "service", "repair", "inspection", "hvac", "plumbing", "electrical", "landscaping", "pool", "pest", "exterminator", "deep clean", "turnover"];
const FAMILY_KEYWORDS = ["family", "birthday", "anniversary", "celebration", "gathering", "holiday dinner", "thanksgiving", "christmas", "easter", "passover", "fourth of july", "new year"];

function classifyEvent(title: string, description: string, keywords: string[], eventType: string, location: string): string {
  const text = `${title} ${description} ${keywords.join(" ")} ${location}`.toLowerCase();
  if (eventType === "travel" || TRAVEL_KEYWORDS.some(k => text.includes(k))) return "travel";
  if (eventType === "guest_stay" || GUEST_KEYWORDS.some(k => text.includes(k))) return "guest_stay";
  if (eventType === "maintenance" || MAINTENANCE_KEYWORDS.some(k => text.includes(k))) return "maintenance";
  if (eventType === "family_trip" || FAMILY_KEYWORDS.some(k => text.includes(k))) return "family";
  return "general";
}

// ─── BRIEFING PROMPT BUILDER ──────────────────────────────────────────────────
function buildBriefingPrompt(
  classification: string,
  event: Record<string, unknown>,
  propertyName: string,
  staffNames: string[],
): string {
  const dateStr = event.start_date
    ? new Date(event.start_date as string).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "TBD";
  const endDateStr = event.end_date
    ? new Date(event.end_date as string).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null;
  const location = event.location as string || "";
  const staffList = staffNames.length > 0 ? `Assigned staff: ${staffNames.join(", ")}` : "No staff assigned yet";

  const baseContext = `
EVENT DETAILS:
- Title: ${event.title}
- Date: ${dateStr}${endDateStr ? ` → ${endDateStr}` : ""}
- Location: ${location || "Property"}
- Property: ${propertyName}
- Notes: ${event.description || event.notes || "None"}
- ${staffList}
`;

  switch (classification) {
    case "travel":
      return `You are Ronin AI, a world-class Estate Manager. A travel event has been added to the estate calendar.

${baseContext}

Generate a **proactive staff briefing** for this travel event. Use professional estate management language.

Structure your response EXACTLY as follows:

## 🧳 Travel Briefing: ${event.title}

**Dates:** [dates]
**Destination:** [location or property]

### Pre-Departure Checklist (Property)
[5-8 bullet points: what needs to be done at the property before departure — e.g. mail hold, security check, appliance shutdown, car servicing, plant/garden arrangements, pool maintenance, HVAC adjustment]

### Packing Essentials
[8-12 bullet points tailored to the destination and season — if Montana/skiing: ski gear, cold weather layers, etc. If beach: swimwear, sun protection, etc. If city: formal attire, etc.]

### Staff Action Items
[3-5 specific assignments for estate staff during the absence — property monitoring, scheduled maintenance, etc.]

### On-Return Protocol
[3-4 bullet points: what to prepare for the return — property refresh, car readiness, refrigerator restocking, etc.]

Be specific, professional, and action-oriented. Use estate management vocabulary.`;

    case "guest_stay":
      return `You are Ronin AI, a world-class Estate Manager. A guest stay has been added to the estate calendar.

${baseContext}

Generate a **guest arrival briefing** for estate staff. Be specific and professional.

Structure your response EXACTLY as follows:

## 🏡 Guest Arrival Briefing: ${event.title}

**Arrival:** [date]${endDateStr ? `\n**Departure:** ${endDateStr}` : ""}
**Property:** ${propertyName}

### Pre-Arrival Checklist (48h Before)
[5-7 bullet points: deep clean, fresh linens, welcome amenities, flowers, temperature settings, security code updates if needed]

### Day-Of Arrival Protocol
[4-6 bullet points: final walk-through, fresh towels, welcome note, refreshments, parking, luggage assistance]

### Housekeeping Schedule During Stay
[3-4 bullet points: daily turndown, restocking, discretion protocol]

### Departure & Turnover Protocol
[4-5 bullet points: post-departure deep clean, linen refresh, inventory check, damage assessment, property reset to Show-Ready]

Be professional and thorough. This is a luxury estate — standards are paramount.`;

    case "maintenance":
      return `You are Ronin AI, a world-class Estate Manager. A maintenance event has been scheduled.

${baseContext}

Generate a **maintenance coordination briefing** for the estate team.

Structure your response EXACTLY as follows:

## 🔧 Maintenance Briefing: ${event.title}

**Scheduled:** [date]
**Property:** ${propertyName}

### Pre-Work Preparation
[3-5 bullet points: vendor confirmation, access arrangements, area prep, Principal notification if needed]

### Work Order Summary
[Concise description of the scope of work]

### During-Work Protocol
[3-4 bullet points: staff availability, documentation requirements, vendor supervision, area security]

### Post-Work Inspection Checklist
[4-5 bullet points: quality check, cleanup verification, system testing, photo documentation, invoice review]

Use Preventive Maintenance and Work Order vocabulary.`;

    case "family":
      return `You are Ronin AI, a world-class Estate Manager. A family event has been added to the estate calendar.

${baseContext}

Generate a **family event preparation briefing** for estate staff.

Structure your response EXACTLY as follows:

## 👨‍👩‍👧‍👦 Family Event Briefing: ${event.title}

**Date:** [date]
**Property:** ${propertyName}

### Property Preparation
[5-7 bullet points: setup, decorations if applicable, extra linens/towels, additional room preparation, entertainment/AV setup]

### Catering & Kitchen Prep
[4-6 bullet points: menu planning suggestions, dietary considerations, serving equipment, refrigerator stocking, bar setup]

### Staff Assignments & Schedule
[3-5 bullet points: recommended staffing levels, arrival times, service protocol, post-event cleanup]

### Day-Of Checklist
[4-5 bullet points: final walk-through points, timing checkpoints, contingency items]

Be warm yet professional. Family events require exceptional attention to detail.`;

    default:
      return `You are Ronin AI, a world-class Estate Manager. A new calendar event has been added.

${baseContext}

Generate a concise **estate operations briefing** for this event in 150 words or fewer. 
Use professional estate management language. Include any relevant SOP reminders, staff action items, or preparation notes.
Format with a header, bullet points for action items, and close with any escalation notes if required.`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ─── WEBHOOK SECRET VALIDATION ─────────────────────────────────────────────
  const secret = req.headers.get("x-ronin-webhook-secret");
  if (secret !== WEBHOOK_SECRET) {
    console.error("ronin-event-listener: invalid webhook secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!LOVABLE_API_KEY) {
    console.error("ronin-event-listener: LOVABLE_API_KEY missing");
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const event = await req.json();
    const eventType: string = event.event_type ?? "";
    const payload = event.payload ?? {};
    console.log("ronin-event-listener: received event", eventType);

    // ── Load shared context ──────────────────────────────────────────────────
    const [propRes, staffRes, masterRes] = await Promise.all([
      event.property_id
        ? adminClient.from("properties").select("id, name, city, country, occupied_by, status").eq("id", event.property_id).single()
        : Promise.resolve({ data: null }),
      adminClient.from("profiles").select("id, full_name, job_title, level"),
      adminClient.from("user_roles").select("user_id, role").eq("role", "master_admin"),
    ]);

    const propertyName = propRes.data?.name ?? "Estate";
    const allStaff = staffRes.data ?? [];
    const masterAdminId = masterRes.data?.[0]?.user_id ?? null;

    // Helper: find master admin's system_ai thread
    async function getMasterThreadId(): Promise<string | null> {
      if (!masterAdminId) return null;
      const { data: threads } = await adminClient
        .from("chat_threads").select("id, participant_ids").eq("type", "system_ai");
      return threads?.find((t: { participant_ids: string[] | null }) =>
        t.participant_ids?.includes(masterAdminId))?.id ?? null;
    }

    // Helper: post message to master admin's Ronin thread
    async function alertMasterAdmin(text: string): Promise<void> {
      const tid = await getMasterThreadId();
      if (!tid) return;
      await adminClient.from("messages").insert({
        thread_id: tid, sender_id: null, is_ai_generated: true,
        content_text: text, delivery_status: "sent",
      });
      await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", tid);
    }

    // Helper: generate a quick AI message (Gemini Flash)
    async function quickAI(prompt: string, maxTokens = 300): Promise<string> {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) return "";
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    }

    // ════════════════════════════════════════════════════════════════════════
    // ── ROUTE BY EVENT TYPE ─────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // ── OCCUPANCY CHANGED ────────────────────────────────────────────────────
    if (eventType === "occupancy_changed") {
      const { property_name, old_occupant, new_occupant, old_status, new_status } = payload;
      const cleared = !new_occupant && old_occupant;
      const arrived  = new_occupant && !old_occupant;

      const aiPrompt = `You are Ronin AI, an elite estate manager.
The occupancy status of **${property_name || propertyName}** has changed.
${cleared ? `The occupant **${old_occupant}** has departed. The property is now ${new_status || "vacant"}.` : ""}
${arrived ? `**${new_occupant}** has just been registered as the occupant. Status is now ${new_status}.` : ""}
${!cleared && !arrived ? `Status changed from ${old_status} to ${new_status}. Occupant: ${new_occupant || "none"}.` : ""}

Write a concise estate briefing (max 120 words) for the Master Admin noting:
1. What changed and what it means operationally
2. ${cleared ? "Key tasks to action now (securing, adjusting climate, notifying relevant staff, any occupancy-linked rules that were auto-deactivated)" : "Key tasks to prepare for the arrival and any rules that should be reviewed"}
3. Any follow-up Ronin recommends

Be direct and professional. Use bullet points for tasks.`;

      const aiText = await quickAI(aiPrompt, 400);
      if (aiText) {
        const icon = cleared ? "🏠" : "👤";
        const heading = cleared
          ? `${icon} **Occupancy Alert — ${property_name || propertyName} is now vacant**`
          : `${icon} **Occupancy Update — ${new_occupant} registered at ${property_name || propertyName}**`;
        await alertMasterAdmin(`${heading}\n\n${aiText}`);
      }

      await adminClient.from("system_events").update({ processed_by_ai: true, ai_response: aiText?.slice(0, 300) ?? "" })
        .eq("id", event.event_id);

      return new Response(JSON.stringify({ success: true, type: "occupancy_changed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── URGENT TASK ESCALATION ───────────────────────────────────────────────
    if (eventType === "urgent_task") {
      const { task_title, description, category, assigned_to, due_date } = payload;
      let assigneeName = "Unassigned";
      if (assigned_to) {
        const match = allStaff.find((s: { id: string }) => s.id === assigned_to);
        assigneeName = (match as any)?.full_name ?? "Unknown";
      }

      const aiPrompt = `You are Ronin AI. An URGENT task has been flagged on the estate platform.

Task: "${task_title}"
Category: ${category || "general"}
Assigned to: ${assigneeName}
Property: ${propertyName}
Due: ${due_date ? new Date(due_date).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "ASAP"}
Details: ${description || "No details provided"}

Write a concise alert (max 100 words) for the Master Admin:
1. Acknowledge the urgency
2. Note key risk if not actioned
3. Recommend immediate next step

Be direct, no filler. Use estate management language.`;

      const aiText = await quickAI(aiPrompt, 250);
      if (aiText) {
        await alertMasterAdmin(`🚨 **URGENT Task Alert — ${task_title}**\n\n${aiText}`);
      }

      await adminClient.from("system_events").update({ processed_by_ai: true, ai_response: aiText?.slice(0, 300) ?? "" })
        .eq("id", event.event_id);

      return new Response(JSON.stringify({ success: true, type: "urgent_task" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── RULE SUBMITTED FOR APPROVAL ──────────────────────────────────────────
    if (eventType === "rule_submitted") {
      const { rule_title, description: ruleDesc, submitted_source, is_universal } = payload;

      // Find the submitter's name
      let submitterName = "Unknown";
      if (event.created_by) {
        const match = allStaff.find((s: { id: string }) => s.id === event.created_by);
        submitterName = (match as any)?.full_name ?? "Someone";
      }

      const sourceLabel: Record<string, string> = {
        manual: "entered manually",
        chat: "detected in a chat message",
        ronin_ai: "suggested by Ronin AI",
        guest: "submitted by a guest",
      };

      const aiPrompt = `You are Ronin AI. A new property rule has been submitted for your approval.

Rule: "${rule_title}"
Description: ${ruleDesc || "No description"}
Scope: ${is_universal ? "Universal (all properties)" : `Specific to ${propertyName}`}
Submitted by: ${submitterName}
Source: ${sourceLabel[submitted_source] ?? submitted_source}

Write a short advisory (max 80 words) for the Master Admin:
1. Summarise the rule's intent
2. Note any operational implications or conflicts to consider before approving
3. Recommend approve/review with 1 sentence reasoning

Be concise and professional.`;

      const aiText = await quickAI(aiPrompt, 200);
      if (aiText) {
        await alertMasterAdmin(`📋 **Pending Rule Submitted — "${rule_title}"**\n\n*Submitted by ${submitterName} via ${sourceLabel[submitted_source] ?? submitted_source}*\n\n${aiText}\n\n---\n👆 Review in **Rules → Pending Approvals**`);
      }

      await adminClient.from("system_events").update({ processed_by_ai: true, ai_response: aiText?.slice(0, 300) ?? "" })
        .eq("id", event.event_id);

      return new Response(JSON.stringify({ success: true, type: "rule_submitted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── OVERDUE TASKS DIGEST ─────────────────────────────────────────────────
    if (eventType === "overdue_tasks_digest") {
      const { overdue_count } = payload;

      // Fetch the actual overdue tasks for context
      const { data: overdueTasks } = await adminClient
        .from("tasks")
        .select("title_en, category, due_date, assigned_to, property_id")
        .not("status", "in", '("completed")')
        .lt("due_date", new Date().toISOString())
        .not("due_date", "is", null)
        .order("due_date")
        .limit(8);

      const propMap: Record<string, string> = {};
      (await adminClient.from("properties").select("id, name")).data?.forEach(
        (p: { id: string; name: string }) => { propMap[p.id] = p.name; }
      );
      const staffMap: Record<string, string> = {};
      allStaff.forEach((s: { id: string; full_name?: string | null }) => {
        staffMap[s.id] = (s as any).full_name ?? "Unknown";
      });

      const taskList = (overdueTasks ?? [])
        .map((t: any) => `- "${t.title_en}" (${t.category ?? "general"}) — ${propMap[t.property_id] ?? "Estate"} — assigned: ${staffMap[t.assigned_to] ?? "unassigned"} — due: ${new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`)
        .join("\n");

      const aiPrompt = `You are Ronin AI. There are currently ${overdue_count} overdue tasks on the estate platform.

Overdue tasks:
${taskList || "Details unavailable"}

Write a concise daily overdue digest (max 130 words) for the Master Admin:
1. Summarise the risk level (critical / moderate / low)
2. Call out the top 2-3 tasks needing immediate attention
3. Suggest one corrective action

Be direct and professional.`;

      const aiText = await quickAI(aiPrompt, 300);
      if (aiText) {
        await alertMasterAdmin(`⏰ **Overdue Tasks Digest — ${overdue_count} task${overdue_count !== 1 ? "s" : ""} overdue**\n\n${aiText}`);
      }

      await adminClient.from("system_events").update({ processed_by_ai: true }).eq("id", event.event_id);

      return new Response(JSON.stringify({ success: true, type: "overdue_tasks_digest" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CALENDAR EVENT (existing behaviour) ─────────────────────────────────
    if (["calendar_entry", "travel_event", "guest_arrival", "guest_departure"].includes(eventType) ||
        event.title || event.start_date) {

      // Classify the event
      const classification = classifyEvent(
        event.title ?? payload?.title ?? "",
        event.description ?? payload?.description ?? "",
        event.keywords ?? [],
        eventType,
        event.location ?? "",
      );

      const assignedIds: string[] = event.assigned_staff_ids ?? [];
      const assignedStaff = allStaff.filter((s: { id: string }) => assignedIds.includes(s.id));
      const assignedNames = assignedStaff.map((s: { full_name: string | null }) => s.full_name ?? "Unknown");

      const briefingPrompt = buildBriefingPrompt(classification, event, propertyName, assignedNames);

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [{ role: "user", content: briefingPrompt }],
          temperature: 0.4, max_tokens: 1200,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("ronin-event-listener: AI error", aiRes.status, errText);
        return new Response(JSON.stringify({ error: "AI briefing failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiRes.json();
      const briefingText = aiData.choices?.[0]?.message?.content ?? "Briefing unavailable.";

      let masterThreadId: string | null = null;
      if (masterAdminId) {
        masterThreadId = await getMasterThreadId();
        if (masterThreadId) {
          const draftTaskLink = `\n\n---\n💡 **I've created a draft task for your review.** Tap the **Ronin draft tasks** widget on your Dashboard to assign and publish it.`;
          await adminClient.from("messages").insert({
            thread_id: masterThreadId, sender_id: null, is_ai_generated: true,
            content_text: `📅 **Proactive Briefing — New Calendar Event Detected**\n\nI've reviewed the new entry on your estate calendar and prepared the following briefing:\n\n` + briefingText + draftTaskLink,
            delivery_status: "sent",
          });
          await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", masterThreadId);
        }
      }

      if (masterAdminId && classification !== "general") {
        const taskTitleMap: Record<string, string> = {
          travel: `Prepare for trip: ${event.title}`,
          guest_stay: `Guest arrival prep: ${event.title}`,
          maintenance: `Coordinate maintenance: ${event.title}`,
          family: `Family event prep: ${event.title}`,
        };
        const dueDate = event.start_date
          ? new Date(new Date(event.start_date as string).getTime() - 24 * 60 * 60 * 1000).toISOString()
          : null;
        const { data: matchedChecklist } = await adminClient
          .from("checklist_templates").select("id")
          .ilike("title", `%${classification === "travel" ? "pack" : classification === "guest_stay" ? "guest" : classification}%`)
          .eq("is_published", true).limit(1).single();
        await adminClient.from("tasks").insert({
          title_en: taskTitleMap[classification] ?? `Prepare for: ${event.title}`,
          description_en: `Auto-generated by Ronin from calendar event: "${event.title}". Review, assign staff, and publish when ready.`,
          status: "pending", priority: classification === "travel" || classification === "guest_stay" ? 1 : 2,
          due_date: dueDate, property_id: event.property_id ?? null, created_by: masterAdminId,
          is_draft: true, ai_suggested: true, linked_checklist_id: matchedChecklist?.id ?? null,
          attachments: [], linked_inventory_ids: [],
        });
      }

      if (assignedIds.length > 0 && masterAdminId) {
        const staffBriefingPrompt = `You are Ronin AI, an estate management assistant.
A calendar event has been added: "${event.title}" on ${event.start_date ? new Date(event.start_date as string).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "TBD"} at ${propertyName}.
Write a SHORT, professional message (max 80 words) to assigned staff listing their 2-3 key preparation tasks. Do NOT include private family details. Use bullet points.`;

        const staffText = await quickAI(staffBriefingPrompt, 200);
        if (staffText) {
          for (const staffId of assignedIds) {
            const { data: dmThreads } = await adminClient.from("chat_threads").select("id, participant_ids").eq("type", "private");
            let dmThreadId: string | null = dmThreads?.find((t: { participant_ids: string[] | null }) =>
              t.participant_ids?.includes(masterAdminId!) && t.participant_ids?.includes(staffId))?.id ?? null;
            if (!dmThreadId) {
              const { data: nt } = await adminClient.from("chat_threads").insert({
                type: "private", participant_ids: [masterAdminId, staffId], created_by: masterAdminId,
              }).select("id").single();
              dmThreadId = nt?.id ?? null;
            }
            if (dmThreadId) {
              await adminClient.from("messages").insert({
                thread_id: dmThreadId, sender_id: null, is_ai_generated: true,
                content_text: `📋 **Estate Briefing — ${event.title}**\n\n${staffText}`, delivery_status: "sent",
              });
              await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", dmThreadId);
            }
          }
        }
      }

      await adminClient.from("system_events").insert({
        event_type: "ronin_proactive_briefing", entity_type: "calendar_event",
        entity_id: event.event_id ?? null, property_id: event.property_id ?? null,
        processed_by_ai: true, ai_response: briefingText.slice(0, 500),
        payload: { classification, calendar_title: event.title, thread_id: masterThreadId, staff_notified: assignedIds.length },
      });

      return new Response(JSON.stringify({ success: true, classification, staff_notified: assignedIds.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UNKNOWN EVENT ────────────────────────────────────────────────────────
    console.log("ronin-event-listener: unhandled event type:", eventType);
    return new Response(JSON.stringify({ success: false, message: "Unhandled event type" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("ronin-event-listener error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

    const propertyName = propRes.data?.name ?? "Estate";
    const allStaff = staffRes.data ?? [];
    const masterAdminId = masterRes.data?.[0]?.user_id ?? null;

    // Resolve assigned staff names
    const assignedIds: string[] = event.assigned_staff_ids ?? [];
    const assignedStaff = allStaff.filter((s: { id: string }) => assignedIds.includes(s.id));
    const assignedNames = assignedStaff.map((s: { full_name: string | null }) => s.full_name ?? "Unknown");

    // Build briefing prompt
    const briefingPrompt = buildBriefingPrompt(classification, event, propertyName, assignedNames);

    // ── Generate AI briefing ─────────────────────────────────────────────────
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: briefingPrompt }],
        temperature: 0.4,
        max_tokens: 1200,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("ronin-event-listener: AI error", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "AI briefing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const briefingText = aiData.choices?.[0]?.message?.content ?? "Briefing unavailable.";

    // ── Post to Master Admin's Agent Ronin thread ────────────────────────────
    let masterThreadId: string | null = null;
    if (masterAdminId) {
      // Find the system_ai thread for master admin
      const { data: threads } = await adminClient
        .from("chat_threads")
        .select("id, participant_ids, type, title")
        .eq("type", "system_ai");

      if (threads) {
        const masterThread = threads.find((t: { participant_ids: string[] | null }) =>
          t.participant_ids?.includes(masterAdminId)
        );
        masterThreadId = masterThread?.id ?? null;
      }

      if (masterThreadId) {
        const draftTaskLink = `\n\n---\n💡 **I've created a draft task for your review.** Tap the **Ronin draft tasks** widget on your Dashboard to assign and publish it.`;
        const intro = `📅 **Proactive Briefing — New Calendar Event Detected**\n\nI've reviewed the new entry on your estate calendar and prepared the following briefing:\n\n`;
        await adminClient.from("messages").insert({
          thread_id: masterThreadId,
          sender_id: null,
          is_ai_generated: true,
          content_text: intro + briefingText + draftTaskLink,
          delivery_status: "sent",
        });
        await adminClient.from("chat_threads")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", masterThreadId);
      }
    }

    // ── Create a draft task for Master Admin to review & publish ────────────
    if (masterAdminId && classification !== "general") {
      const taskTitleMap: Record<string, string> = {
        travel:     `Prepare for trip: ${event.title}`,
        guest_stay: `Guest arrival prep: ${event.title}`,
        maintenance:`Coordinate maintenance: ${event.title}`,
        family:     `Family event prep: ${event.title}`,
      };
      const taskTitle = taskTitleMap[classification] ?? `Prepare for: ${event.title}`;

      // Find matching checklist template for this event type
      const { data: matchedChecklist } = await adminClient
        .from("checklist_templates")
        .select("id")
        .ilike("title", `%${classification === "travel" ? "pack" : classification === "guest_stay" ? "guest" : classification}%`)
        .eq("is_published", true)
        .limit(1)
        .single();

      const dueDate = event.start_date
        ? new Date(new Date(event.start_date as string).getTime() - 24 * 60 * 60 * 1000).toISOString()
        : null;

      await adminClient.from("tasks").insert({
        title_en: taskTitle,
        description_en: `Auto-generated by Ronin from calendar event: "${event.title}". Review, assign staff, and publish when ready.`,
        status: "pending",
        priority: classification === "travel" || classification === "guest_stay" ? 1 : 2,
        due_date: dueDate,
        property_id: event.property_id ?? null,
        created_by: masterAdminId,
        is_draft: true,
        ai_suggested: true,
        linked_checklist_id: matchedChecklist?.id ?? null,
        attachments: [],
        linked_inventory_ids: [],
      });
    }

    // ── Post shorter action-item briefing to each assigned staff member ──────
    if (assignedIds.length > 0 && masterAdminId) {
      // Build a concise staff-facing version (no private details)
      const staffBriefingPrompt = `You are Ronin AI, an estate management assistant.
A calendar event has been added: "${event.title}" on ${event.start_date ? new Date(event.start_date as string).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "TBD"} at ${propertyName}.

Write a SHORT, professional message (max 80 words) to assigned staff notifying them of this event and listing their 2-3 key preparation tasks. Do NOT include any private family details. Start directly with the task — no preamble. Use bullet points for tasks.`;

      const staffAiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: staffBriefingPrompt }],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      let staffBriefingText = "";
      if (staffAiRes.ok) {
        const staffAiData = await staffAiRes.json();
        staffBriefingText = staffAiData.choices?.[0]?.message?.content ?? "";
      }

      if (staffBriefingText) {
        for (const staffId of assignedIds) {
          // Find existing DM thread between master admin and this staff member
          const { data: dmThreads } = await adminClient
            .from("chat_threads")
            .select("id, participant_ids")
            .eq("type", "private");

          let dmThreadId: string | null = null;
          if (dmThreads) {
            const existing = dmThreads.find((t: { participant_ids: string[] | null }) =>
              t.participant_ids?.includes(masterAdminId) && t.participant_ids?.includes(staffId)
            );
            dmThreadId = existing?.id ?? null;
          }

          // Create DM thread if it doesn't exist
          if (!dmThreadId) {
            const { data: newThread } = await adminClient.from("chat_threads").insert({
              type: "private",
              participant_ids: [masterAdminId, staffId],
              created_by: masterAdminId,
            }).select("id").single();
            dmThreadId = newThread?.id ?? null;
          }

          if (dmThreadId) {
            await adminClient.from("messages").insert({
              thread_id: dmThreadId,
              sender_id: null,
              is_ai_generated: true,
              content_text: `📋 **Estate Briefing — ${event.title}**\n\n${staffBriefingText}`,
              delivery_status: "sent",
            });
            await adminClient.from("chat_threads")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", dmThreadId);
          }
        }
      }
    }

    // ── Log to system_events ─────────────────────────────────────────────────
    await adminClient.from("system_events").insert({
      event_type: "ronin_proactive_briefing",
      entity_type: "calendar_event",
      entity_id: event.event_id ?? null,
      property_id: event.property_id ?? null,
      processed_by_ai: true,
      ai_response: briefingText.slice(0, 500),
      payload: {
        classification,
        calendar_title: event.title,
        thread_id: masterThreadId,
        staff_notified: assignedIds.length,
      },
    });

    console.log("ronin-event-listener: briefing posted, classification:", classification, "staff notified:", assignedIds.length);

    return new Response(JSON.stringify({ success: true, classification, staff_notified: assignedIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ronin-event-listener error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
