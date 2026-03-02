import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── AUTH ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    let callerUserId: string | null = null;
    let callerProfile: Record<string, unknown> | null = null;
    let callerProperties: string[] = [];
    let callerRole: string = "staff";

    if (authHeader?.startsWith("Bearer ")) {
      const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anonClient.auth.getUser();
      if (user) {
        callerUserId = user.id;
        const { data: profile } = await adminClient
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (profile) {
          callerProfile = profile;
          callerProperties = (profile.assigned_property_ids as string[]) ?? [];
        }
        const { data: roleRow } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();
        if (roleRow) callerRole = roleRow.role;
      }
    }

    const body = await req.json();
    const { type, content, thread_id, csv_content, property_id, action } = body;

    // ─── INVITE USER ──────────────────────────────────────────────────────────
    if (action === "invite_user") {
      if (!["master_admin", "admin"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { email, full_name, job_title, level, department, role, start_date, birthday, notes } = body;
      if (!email || !full_name || !level || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { full_name },
      });
      if (createErr || !newUser?.user) {
        return new Response(JSON.stringify({ error: createErr?.message ?? "Failed to create user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uid = newUser.user.id;

      await adminClient.from("profiles").upsert({
        id: uid, full_name, job_title: job_title || null, level,
        department: department || null, start_date: start_date || null,
        birthday: birthday || null, notes: notes || null,
      });
      await adminClient.from("user_roles").insert({ user_id: uid, role });
      await adminClient.from("user_stats").insert({ user_id: uid }).select().maybeSingle();
      await adminClient.auth.admin.inviteUserByEmail(email);
      await adminClient.from("system_events").insert({
        event_type: "user_invited", entity_type: "profile", entity_id: uid,
        triggered_by: callerUserId, payload: { email, full_name, level, role }, processed_by_ai: false,
      });

      return new Response(JSON.stringify({ success: true, user_id: uid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SYSTEM PROMPT ────────────────────────────────────────────────────────
    const systemPrompt = `You are Ronin AI, the intelligent operations backbone for Ronin Collective — a luxury estate management platform.

CALLER CONTEXT:
- User ID: ${callerUserId ?? "anonymous"}
- Name: ${(callerProfile?.full_name as string) ?? "Unknown"}
- Role: ${callerRole}
- Assigned property IDs: ${callerProperties.length ? callerProperties.join(", ") : "none"}
- Active property context: ${property_id ?? "none"}

YOUR CAPABILITIES:
- You have read access to all estate data: tasks, properties, assets, manuals, messages, user stats, system events.
- You enforce permission boundaries: staff only see their assigned properties; admins see all.
- You respond in the same language the user writes in (English or Spanish).
- You are concise, professional, and proactive.

CRITICAL RULES:
- NEVER invent, guess, or fabricate any data. Every answer must come exclusively from the LIVE PLATFORM DATA injected below.
- If a person, property, task, or detail is not present in the live data, say "I don't have that information in the system" — never fill gaps with assumptions.
- Never reveal other users' personal data to non-admins.
- Always confirm destructive operations before executing.
- When creating tasks, always set created_by to the calling user's ID unless told otherwise.`;

    // ─── CSV IMPORT MODE ───────────────────────────────────────────────────────
    if (type === "csv_import") {
      if (!["master_admin", "admin"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Insufficient permissions for import" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const parsePrompt = `You are a data parser. Parse this CSV content into a JSON array of task objects.
Each row should produce: { title_en, description_en, category (one of: housekeeping, maintenance, general), priority (1=urgent,2=normal,3=low), property_hint (name or id hint from the data) }
Only return valid JSON array, nothing else.

CSV:
${csv_content}`;

      const parseResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-pro", messages: [{ role: "user", content: parsePrompt }], temperature: 0.1 }),
      });

      if (!parseResponse.ok) {
        const errText = await parseResponse.text();
        throw new Error(`AI parse failed: ${parseResponse.status} ${errText}`);
      }

      const parseData = await parseResponse.json();
      let rawJson = parseData.choices?.[0]?.message?.content ?? "[]";
      rawJson = rawJson.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

      let parsedTasks: Array<{
        title_en: string; description_en?: string; category?: string;
        priority?: number; property_hint?: string;
      }> = [];

      try {
        parsedTasks = JSON.parse(rawJson);
      } catch {
        throw new Error("AI returned invalid JSON for CSV parse");
      }

      const { data: allProperties } = await adminClient.from("properties").select("id, name");
      const propertyMap: Record<string, string> = {};
      (allProperties ?? []).forEach((p: { id: string; name: string }) => {
        propertyMap[p.name.toLowerCase()] = p.id;
      });

      const resolvedPropertyId = property_id ?? null;

      const taskRows = parsedTasks.map((t) => {
        let resolvedPropId: string | null = resolvedPropertyId;
        if (!resolvedPropId && t.property_hint) {
          const hint = t.property_hint.toLowerCase();
          for (const [name, id] of Object.entries(propertyMap)) {
            if (name.includes(hint) || hint.includes(name)) { resolvedPropId = id; break; }
          }
        }
        return {
          title_en: t.title_en, description_en: t.description_en ?? null,
          category: t.category ?? "general", priority: t.priority ?? 2,
          property_id: resolvedPropId, status: "pending" as const, created_by: callerUserId!,
        };
      });

      const { data: inserted, error: insertError } = await adminClient.from("tasks").insert(taskRows).select("id");
      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

      const taskCount = inserted?.length ?? 0;

      if (thread_id) {
        await adminClient.from("messages").insert({
          thread_id, sender_id: null, is_ai_generated: true,
          content_text: `🤖 **Ronin AI** — I have processed the new import. **${taskCount} new tasks** have been added across the relevant properties. All tasks are now visible in the Tasks section.`,
        });
      }

      await adminClient.from("system_events").insert({
        event_type: "csv_import", entity_type: "tasks", property_id: resolvedPropertyId,
        triggered_by: callerUserId, payload: { task_count: taskCount },
        processed_by_ai: true, ai_response: `Imported ${taskCount} tasks`,
      });

      return new Response(
        JSON.stringify({ success: true, task_count: taskCount, summary: `I have processed the new import. ${taskCount} new tasks have been added.`, tasks: taskRows }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CHAT MESSAGE MODE ─────────────────────────────────────────────────────
    if (type === "message") {
      const { messages: conversationHistory = [] } = body;

      // ── Always load full platform snapshot in parallel ─────────────────────
      const [propsRes, tasksRes, staffRes, assetsRes, eventsRes] = await Promise.all([
        adminClient
          .from("properties")
          .select("id, name, address, city, country, status, is_primary, occupied_by, timezone")
          .order("sort_order"),
        adminClient
          .from("tasks")
          .select("id, title_en, status, priority, category, due_date, assigned_to, property_id")
          .in("status", ["pending", "in_progress", "urgent"])
          .order("priority")
          .limit(50),
        adminClient
          .from("profiles")
          .select("id, full_name, job_title, department, level, assigned_property_ids, phone, notes"),
        adminClient
          .from("assets")
          .select("id, name, category, make, model, serial_number, current_property_id")
          .limit(50),
        adminClient
          .from("system_events")
          .select("event_type, entity_type, created_at, payload")
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      const contextSections: string[] = [];

      // Properties
      const props = propsRes.data ?? [];
      const propLines = props.map((p: Record<string, unknown>) =>
        `  - [ID:${p.id}] ${p.name} | ${p.city ?? p.address}, ${p.country ?? ""} | Status: ${p.status} | Occupied by: ${p.occupied_by ?? "N/A"} | Timezone: ${p.timezone}`
      );
      contextSections.push(props.length > 0
        ? `PROPERTIES (${props.length} total):\n${propLines.join("\n")}`
        : "PROPERTIES: None in database.");

      // Staff / profiles
      const staff = staffRes.data ?? [];
      const staffLines = staff.map((s: Record<string, unknown>) => {
        const propIds = Array.isArray(s.assigned_property_ids) && (s.assigned_property_ids as string[]).length
          ? `Assigned to: ${(s.assigned_property_ids as string[]).join(", ")}`
          : "No property assignments";
        return `  - [ID:${s.id}] ${s.full_name ?? "Unknown"} | Title: ${s.job_title ?? "N/A"} | Dept: ${s.department ?? "N/A"} | Level: ${s.level} | ${propIds}`;
      });
      contextSections.push(staff.length > 0
        ? `TEAM MEMBERS (${staff.length} total):\n${staffLines.join("\n")}`
        : "TEAM MEMBERS: None in database.");

      // Tasks
      const tasks = tasksRes.data ?? [];
      const taskLines = tasks.map((t: Record<string, unknown>) =>
        `  - [${t.status}] ${t.title_en} | Priority: ${t.priority} | Category: ${t.category ?? "general"} | Due: ${t.due_date ?? "none"} | Property ID: ${t.property_id ?? "unassigned"}`
      );
      contextSections.push(tasks.length > 0
        ? `OPEN TASKS (${tasks.length}):\n${taskLines.join("\n")}`
        : "OPEN TASKS: None.");

      // Assets
      const assets = assetsRes.data ?? [];
      if (assets.length > 0) {
        const assetLines = assets.map((a: Record<string, unknown>) =>
          `  - ${a.name} | Category: ${a.category} | Make: ${a.make ?? "N/A"} ${a.model ?? ""} | Property ID: ${a.current_property_id ?? "unassigned"}`
        );
        contextSections.push(`ASSETS (${assets.length}):\n${assetLines.join("\n")}`);
      }

      // Recent events
      const events = eventsRes.data ?? [];
      if (events.length > 0) {
        const eventLines = events.map((e: Record<string, unknown>) =>
          `  - [${e.event_type}] ${e.entity_type ?? ""} at ${e.created_at}`
        );
        contextSections.push(`RECENT SYSTEM EVENTS:\n${eventLines.join("\n")}`);
      }

      const contextNote = "\n\n=== LIVE PLATFORM DATA ===\n" + contextSections.join("\n\n") + "\n=== END LIVE DATA ===";

      const aiMessages = [
        { role: "system", content: systemPrompt + contextNote },
        ...conversationHistory,
        { role: "user", content },
      ];

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-pro", messages: aiMessages, stream: true }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in workspace settings." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await aiResponse.text();
        throw new Error(`AI error: ${aiResponse.status} ${t}`);
      }

      if (!thread_id) {
        return new Response(aiResponse.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Consume stream, accumulate, then save AI message to DB
      const reader = aiResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      const stream = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6).trim();
              if (json === "[DONE]") continue;
              try {
                const parsed = JSON.parse(json);
                const chunk = parsed.choices?.[0]?.delta?.content;
                if (chunk) fullText += chunk;
              } catch { /* partial */ }
            }
          }
          controller.close();

          if (fullText) {
            await adminClient.from("messages").insert({
              thread_id, content_text: fullText, sender_id: null,
              is_ai_generated: true, delivery_status: "sent",
            });
            await adminClient.from("chat_threads")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", thread_id);
          }
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Thread-Id": thread_id },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown request type" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ronin-ai error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
