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
    console.log("ronin-event-listener: received event", event.event_type, event.title);

    // ── Classify the event ───────────────────────────────────────────────────
    const classification = classifyEvent(
      event.title ?? event.payload?.title ?? "",
      event.description ?? event.payload?.description ?? "",
      event.keywords ?? [],
      event.event_type ?? "",
      event.location ?? "",
    );

    // ── Load context: property + staff ───────────────────────────────────────
    const [propRes, staffRes, masterRes] = await Promise.all([
      event.property_id
        ? adminClient.from("properties").select("id, name, city, country").eq("id", event.property_id).single()
        : Promise.resolve({ data: null }),
      adminClient.from("profiles").select("id, full_name, job_title, level"),
      adminClient.from("user_roles").select("user_id, role").eq("role", "master_admin"),
    ]);

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
