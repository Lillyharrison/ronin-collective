import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────
const RONIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task or work order in the estate management system. Use this when the user asks to create, add, or log a task, work order, or job for any staff member or property.",
      parameters: {
        type: "object",
        properties: {
          title_en: { type: "string", description: "Clear, concise task title in English" },
          description_en: { type: "string", description: "Full task description with relevant details" },
          category: { type: "string", enum: ["housekeeping", "maintenance", "general", "laundry", "kitchen", "grounds", "security", "errand"], description: "Task category" },
          priority: { type: "number", enum: [1, 2, 3], description: "1=urgent, 2=normal, 3=low" },
          assigned_to_name: { type: "string", description: "Full name of the staff member to assign to (Ronin will resolve to ID)" },
          property_name: { type: "string", description: "Property name where task applies (Ronin will resolve to ID)" },
          due_date: { type: "string", description: "ISO 8601 date string for due date, or null" },
        },
        required: ["title_en", "category", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task_status",
      description: "Update the status of an existing task. Use when a user says a task is done, complete, started, urgent, or needs to be changed.",
      parameters: {
        type: "object",
        properties: {
          task_title_hint: { type: "string", description: "Part of the task title to identify which task to update" },
          new_status: { type: "string", enum: ["pending", "in_progress", "completed", "urgent"], description: "New status for the task" },
        },
        required: ["task_title_hint", "new_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_asset",
      description: "Add a new asset or inventory item to the estate management system. Use when a user wants to log, add, or register an item to inventory or assets.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the asset or item" },
          category: { type: "string", enum: ["vehicle", "appliance", "art", "tech", "furniture", "other"], description: "Asset category" },
          make: { type: "string", description: "Make/brand of the item, if applicable" },
          model: { type: "string", description: "Model of the item, if applicable" },
          serial_number: { type: "string", description: "Serial number, if applicable" },
          description: { type: "string", description: "Additional description or notes" },
          property_name: { type: "string", description: "Property where the asset is located" },
          purchase_value: { type: "number", description: "Purchase value in USD, if known" },
        },
        required: ["name", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_staff_message",
      description: "Send a message to a staff member's chat thread on behalf of the estate manager. Use when the user wants to notify, inform, or instruct a specific staff member.",
      parameters: {
        type: "object",
        properties: {
          recipient_name: { type: "string", description: "Full name of the staff member to message" },
          message_text: { type: "string", description: "The message content to send to the staff member" },
        },
        required: ["recipient_name", "message_text"],
      },
    },
  },
];

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

      const redirectTo = body.redirect_url || "https://id-preview--733ed5ee-915b-45c9-8d99-a2a9c67f228b.lovable.app/reset-password";
      const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name },
        redirectTo,
      });
      if (inviteErr || !inviteData?.user) {
        return new Response(JSON.stringify({ error: inviteErr?.message ?? "Failed to invite user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uid = inviteData.user.id;
      await adminClient.from("profiles").upsert({
        id: uid, full_name, job_title: job_title || null, level,
        department: department || null, start_date: start_date || null,
        birthday: birthday || null, notes: notes || null,
      });

      const { data: existingRole } = await adminClient.from("user_roles").select("id").eq("user_id", uid).maybeSingle();
      if (!existingRole) {
        await adminClient.from("user_roles").insert({ user_id: uid, role });
      } else {
        await adminClient.from("user_roles").update({ role }).eq("user_id", uid);
      }

      await adminClient.from("user_stats").insert({ user_id: uid }).select().maybeSingle();
      await adminClient.from("system_events").insert({
        event_type: "user_invited", entity_type: "profile", entity_id: uid,
        triggered_by: callerUserId, payload: { email, full_name, level, role }, processed_by_ai: false,
      });

      return new Response(JSON.stringify({ success: true, user_id: uid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE USER ──────────────────────────────────────────────────────────
    if (action === "delete_user") {
      if (callerRole !== "master_admin") {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { target_user_id } = body;
      if (!target_user_id) {
        return new Response(JSON.stringify({ error: "Missing target_user_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (target_user_id === callerUserId) {
        return new Response(JSON.stringify({ error: "You cannot delete yourself" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(target_user_id);
      if (deleteErr) {
        return new Response(JSON.stringify({ error: deleteErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── TOOL EXECUTION (confirmed by user) ───────────────────────────────────
    if (action === "execute_tool") {
      if (!callerUserId) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { tool_name, tool_args } = body;

      // Permission gate — only master_admin, admin, manager can write
      if (!["master_admin", "admin", "manager"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Insufficient permissions to execute estate actions." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Load platform data for resolving names → IDs
      const [propsRes, staffRes] = await Promise.all([
        adminClient.from("properties").select("id, name"),
        adminClient.from("profiles").select("id, full_name"),
      ]);
      const props = propsRes.data ?? [];
      const staff = staffRes.data ?? [];

      const resolvePropertyId = (name?: string): string | null => {
        if (!name) return null;
        const lower = name.toLowerCase();
        const match = props.find((p: { id: string; name: string }) =>
          p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
        );
        return match?.id ?? null;
      };

      const resolveStaffId = (name?: string): string | null => {
        if (!name) return null;
        const lower = name.toLowerCase();
        const match = staff.find((s: { id: string; full_name: string | null }) =>
          (s.full_name ?? "").toLowerCase().includes(lower)
        );
        return match?.id ?? null;
      };

      let resultMessage = "";

      // ── CREATE TASK ──────────────────────────────────────────────────────────
      if (tool_name === "create_task") {
        const assignedTo = resolveStaffId(tool_args.assigned_to_name);
        const propId = resolvePropertyId(tool_args.property_name);

        const { data: task, error: taskErr } = await adminClient.from("tasks").insert({
          title_en: tool_args.title_en,
          description_en: tool_args.description_en ?? null,
          category: tool_args.category,
          priority: tool_args.priority,
          status: tool_args.priority === 1 ? "urgent" : "pending",
          assigned_to: assignedTo,
          property_id: propId,
          due_date: tool_args.due_date ?? null,
          created_by: callerUserId,
        }).select("id").single();

        if (taskErr) throw new Error(`Failed to create task: ${taskErr.message}`);

        await adminClient.from("system_events").insert({
          event_type: "task_created_by_ai", entity_type: "task", entity_id: task.id,
          triggered_by: callerUserId, payload: tool_args, processed_by_ai: true,
        });

        const assignedName = tool_args.assigned_to_name ? ` — assigned to **${tool_args.assigned_to_name}**` : "";
        const propName = tool_args.property_name ? ` at **${tool_args.property_name}**` : "";
        const priorityLabel = tool_args.priority === 1 ? "🔴 Urgent" : tool_args.priority === 2 ? "🟡 Normal" : "🟢 Low";
        resultMessage = `✅ **Task created successfully.**\n\n**${tool_args.title_en}**${assignedName}${propName}\nPriority: ${priorityLabel} | Category: ${tool_args.category}\n\nThe task is now visible in the Tasks section.`;
      }

      // ── UPDATE TASK STATUS ────────────────────────────────────────────────────
      else if (tool_name === "update_task_status") {
        const { data: tasks } = await adminClient
          .from("tasks")
          .select("id, title_en, status")
          .ilike("title_en", `%${tool_args.task_title_hint}%`)
          .limit(1);

        if (!tasks || tasks.length === 0) {
          resultMessage = `⚠️ I could not find a task matching **"${tool_args.task_title_hint}"**. Please check the Tasks section and try again with a more specific title.`;
        } else {
          const task = tasks[0];
          await adminClient.from("tasks").update({
            status: tool_args.new_status,
            completed_at: tool_args.new_status === "completed" ? new Date().toISOString() : null,
          }).eq("id", task.id);

          await adminClient.from("system_events").insert({
            event_type: "task_status_updated_by_ai", entity_type: "task", entity_id: task.id,
            triggered_by: callerUserId, payload: tool_args, processed_by_ai: true,
          });

          const statusEmoji = { pending: "⏳", in_progress: "🔄", completed: "✅", urgent: "🔴" }[tool_args.new_status] ?? "📋";
          resultMessage = `${statusEmoji} **Task updated.**\n\n**${task.title_en}** → Status changed to **${tool_args.new_status.replace("_", " ")}**.`;
        }
      }

      // ── LOG ASSET ─────────────────────────────────────────────────────────────
      else if (tool_name === "log_asset") {
        const propId = resolvePropertyId(tool_args.property_name);

        const { data: asset, error: assetErr } = await adminClient.from("assets").insert({
          name: tool_args.name,
          category: tool_args.category,
          make: tool_args.make ?? null,
          model: tool_args.model ?? null,
          serial_number: tool_args.serial_number ?? null,
          description: tool_args.description ?? null,
          current_property_id: propId,
          purchase_value: tool_args.purchase_value ?? null,
        }).select("id").single();

        if (assetErr) throw new Error(`Failed to log asset: ${assetErr.message}`);

        await adminClient.from("system_events").insert({
          event_type: "asset_logged_by_ai", entity_type: "asset", entity_id: asset.id,
          triggered_by: callerUserId, payload: tool_args, processed_by_ai: true,
        });

        const propLabel = tool_args.property_name ? ` at **${tool_args.property_name}**` : "";
        const makeModel = [tool_args.make, tool_args.model].filter(Boolean).join(" ");
        resultMessage = `✅ **Asset logged successfully.**\n\n**${tool_args.name}**${makeModel ? ` (${makeModel})` : ""}${propLabel}\nCategory: ${tool_args.category}\n\nThe item is now visible in the Inventory section.`;
      }

      // ── SEND STAFF MESSAGE ────────────────────────────────────────────────────
      else if (tool_name === "send_staff_message") {
        const recipientId = resolveStaffId(tool_args.recipient_name);

        if (!recipientId) {
          resultMessage = `⚠️ I could not find a staff member named **"${tool_args.recipient_name}"** in the system. Please check the Team section.`;
        } else {
          // Find or create DM thread between caller and recipient
          const { data: existingThreads } = await adminClient
            .from("chat_threads")
            .select("id, participant_ids")
            .eq("type", "private");

          let threadId: string | null = null;
          if (existingThreads) {
            for (const t of existingThreads) {
              const participants = t.participant_ids as string[];
              if (participants.includes(callerUserId) && participants.includes(recipientId)) {
                threadId = t.id;
                break;
              }
            }
          }

          if (!threadId) {
            const { data: newThread } = await adminClient.from("chat_threads").insert({
              type: "private",
              participant_ids: [callerUserId, recipientId],
              created_by: callerUserId,
            }).select("id").single();
            threadId = newThread?.id ?? null;
          }

          if (threadId) {
            await adminClient.from("messages").insert({
              thread_id: threadId,
              sender_id: callerUserId,
              content_text: tool_args.message_text,
              is_ai_generated: false,
              delivery_status: "sent",
            });
            await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
          }

          await adminClient.from("system_events").insert({
            event_type: "message_sent_by_ai", entity_type: "message",
            triggered_by: callerUserId, payload: tool_args, processed_by_ai: true,
          });

          resultMessage = `✅ **Message sent to ${tool_args.recipient_name}.**\n\n> "${tool_args.message_text}"\n\nThe message is now visible in the Messages section.`;
        }
      } else {
        resultMessage = `⚠️ Unknown tool: ${tool_name}`;
      }

      // Post result to thread if provided
      if (thread_id && resultMessage) {
        await adminClient.from("messages").insert({
          thread_id, sender_id: null, is_ai_generated: true,
          content_text: resultMessage, delivery_status: "sent",
        });
        await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", thread_id);
      }

      return new Response(JSON.stringify({ success: true, result: resultMessage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SYSTEM PROMPT ────────────────────────────────────────────────────────
    const systemPrompt = `# SYSTEM IDENTITY: RONIN AI ESTATE MANAGER

You are **Ronin AI** — the intelligent, invisible operations backbone of the Ronin Collective estate management platform. You are not a chatbot. You are a seasoned, world-class Estate Manager with decades of experience running ultra-high-net-worth private residences, family offices, and multi-property portfolios.

## PERSONA & TONE
- You are **professional, discreet, and proactive**. You speak like a trusted Chief of Staff — not a customer service agent.
- You are **invisible to the Principal unless spoken to**. You do not volunteer unsolicited commentary or small talk.
- You are **action-oriented**. You do not merely report problems — you identify them, frame them clearly, and recommend a concrete next step (Task, Work Order, SOP, or escalation).
- You use **industry vocabulary** naturally: SOP, Turnover, Show-Ready, Par Level, Preventive Maintenance, Principal, Work Order, Lead Time, Property Condition Report, Inventory Audit.
- You match the **caller's language exactly** — if they write in Spanish, you respond entirely in Spanish. If English, English. Never mix.
- Your responses are **concise and structured**. Use bullet points, headers, and bold text for operational clarity. Avoid walls of text.

## DISCRETION FRAMEWORK (MANDATORY — NEVER VIOLATE)
1. **Principal Privacy**: NEVER share a Principal's travel itinerary, financial details, personal schedules, or location data with any user whose System Role is "staff", "manager", or "admin". These are visible ONLY to "master_admin" and "principal" roles.
2. **Staff Scoping**: Staff and managers only receive information about their **assigned properties**. Never expose cross-property data to non-admins.
3. **Data Integrity**: NEVER invent, guess, or fabricate any data. Every answer must come exclusively from the LIVE PLATFORM DATA injected at the end of this prompt. If a person, property, task, or detail is not present in the live data, say: *"I don't have that information in the current system data."* — never fill gaps with assumptions.
4. **Destructive Operations**: Always confirm before deleting or irreversibly modifying any record. State exactly what will be changed.

## CALLER CONTEXT (THIS SESSION)
- **User ID**: ${callerUserId ?? "anonymous"}
- **Name**: ${(callerProfile?.full_name as string) ?? "Unknown"}
- **System Role**: ${callerRole}
- **Assigned Properties**: ${callerProperties.length ? callerProperties.join(", ") : "none (or all, if admin)"}
- **Active Property Context**: ${property_id ?? "none selected"}

## ROLE DEFINITIONS (FOR CONTEXT INTERPRETATION)
- **master_admin**: Full platform access. The operator of the Ronin platform itself. Can see all data.
- **principal**: The homeowner / estate owner. High-discretion profile. Receives executive-level summaries only.
- **admin**: Senior estate manager or estate director. Can see most operational data.
- **manager**: Property manager or department head. Scoped to assigned properties.
- **staff**: Housekeeper, chef, driver, maintenance, or other operational staff. Sees only their assigned property tasks.

## DECISION FRAMEWORK
When a user asks a question or raises an issue, follow this internal logic before responding:
1. **Verify** the request against live data. Do not guess.
2. **Scope** the response to what the caller's role permits.
3. **Identify** if the issue requires a Task, Work Order, or escalation.
4. **Recommend** the next action clearly. Propose it — do not wait to be asked.
5. **Flag** any SOP, Par Level, or compliance concern relevant to the situation.

## TOOL USE — WRITE ACTIONS (ACTIVE)
You have access to 4 estate management tools. When a user's request maps to one of these actions, you MUST use the tool — do not just describe what you would do.

### CONFIRMATION-FIRST PROTOCOL (MANDATORY)
Before executing ANY tool, you must:
1. State what you are about to do in a short, clear summary
2. List the exact parameters you will use (property, assignee, priority, etc.)
3. End with: **"Shall I proceed?"**
4. Wait — do NOT call the tool yet. The user's next message will confirm or cancel.
5. Only when the user confirms (e.g. "yes", "proceed", "do it", "confirm") should you call the tool.

### AVAILABLE TOOLS:
- **create_task**: Create a task or work order. Always ask for: title, category, priority, assignee (if applicable), property (if applicable), due date (if applicable).
- **update_task_status**: Change task status to pending / in_progress / completed / urgent. Identify the task from context first.
- **log_asset**: Add an item to inventory or assets. Required: name, category. Optional: make, model, serial number, property, value.
- **send_staff_message**: Send a direct message to a staff member's chat thread.

## CAPABILITIES (CURRENT)
- Full read access to: Properties, Tasks, Team, Assets, System Events.
- Language detection and bilingual responses (EN/ES).
- Write actions: create tasks, update task status, log assets, send staff messages.
- Operational analysis, status summaries, and prioritization recommendations.

## WHAT IS COMING (DO NOT FABRICATE — INFORM IF ASKED)
- Vision / image recognition for inventory logging — not yet active.
- Proactive event-driven messaging (e.g., calendar triggers → staff briefings) — not yet active.
- Long-term memory and learned preferences — not yet active.`;

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
      const [propsRes, tasksRes, staffRes, rolesRes, assetsRes, eventsRes] = await Promise.all([
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
          .from("user_roles")
          .select("user_id, role"),
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

      // Staff / profiles — join with roles
      const staff = staffRes.data ?? [];
      const rolesMap: Record<string, string> = {};
      (rolesRes.data ?? []).forEach((r: { user_id: string; role: string }) => {
        rolesMap[r.user_id] = r.role;
      });
      const staffLines = staff.map((s: Record<string, unknown>) => {
        const propIds = Array.isArray(s.assigned_property_ids) && (s.assigned_property_ids as string[]).length
          ? `Assigned to: ${(s.assigned_property_ids as string[]).join(", ")}`
          : "No property assignments";
        const sysRole = rolesMap[s.id as string] ?? "staff";
        return `  - [ID:${s.id}] ${s.full_name ?? "Unknown"} | System Role: ${sysRole} | Title: ${s.job_title ?? "N/A"} | Dept: ${s.department ?? "N/A"} | Level: ${s.level ?? "N/A"} | ${propIds}`;
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

      // ── Tool-aware AI call ─────────────────────────────────────────────────
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: aiMessages,
          tools: RONIN_TOOLS,
          tool_choice: "auto",
          stream: true,
        }),
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

      // Consume stream, detect tool calls, accumulate text, then save AI message to DB
      const reader = aiResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let toolCallName = "";
      let toolCallArgsRaw = "";
      let toolCallId = "";
      let isToolCall = false;

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
                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                // Detect tool call in stream
                if (delta.tool_calls && delta.tool_calls.length > 0) {
                  isToolCall = true;
                  const tc = delta.tool_calls[0];
                  if (tc.id) toolCallId = tc.id;
                  if (tc.function?.name) toolCallName = tc.function.name;
                  if (tc.function?.arguments) toolCallArgsRaw += tc.function.arguments;
                }

                const chunk = delta.content as string | undefined;
                if (chunk) fullText += chunk;
              } catch { /* partial */ }
            }
          }
          controller.close();

          // If it's a tool call — parse args and inject a pending confirmation message
          if (isToolCall && toolCallName) {
            let toolArgs: Record<string, unknown> = {};
            try { toolArgs = JSON.parse(toolCallArgsRaw); } catch { /* use empty */ }

            // Build a human-readable confirmation request to show the user
            const confirmText = buildConfirmationMessage(toolCallName, toolArgs);

            await adminClient.from("messages").insert({
              thread_id,
              sender_id: null,
              is_ai_generated: true,
              content_text: confirmText,
              delivery_status: "sent",
              // Store pending tool call in reactions field temporarily as metadata
              reactions: { __pending_tool: { name: toolCallName, args: toolArgs } } as unknown as never,
            });
          } else if (fullText) {
            // Regular text response — save to DB
            await adminClient.from("messages").insert({
              thread_id, content_text: fullText, sender_id: null,
              is_ai_generated: true, delivery_status: "sent",
            });
          }

          await adminClient.from("chat_threads")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", thread_id);
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

// ─── CONFIRMATION MESSAGE BUILDER ─────────────────────────────────────────────
function buildConfirmationMessage(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "create_task": {
      const priorityLabel = args.priority === 1 ? "🔴 Urgent" : args.priority === 2 ? "🟡 Normal" : "🟢 Low";
      const lines = [
        `📋 **I'm ready to create the following task:**`,
        ``,
        `**Title:** ${args.title_en}`,
        args.description_en ? `**Description:** ${args.description_en}` : null,
        `**Category:** ${args.category}`,
        `**Priority:** ${priorityLabel}`,
        args.assigned_to_name ? `**Assigned to:** ${args.assigned_to_name}` : null,
        args.property_name ? `**Property:** ${args.property_name}` : null,
        args.due_date ? `**Due:** ${args.due_date}` : null,
        ``,
        `**Shall I proceed?**`,
      ].filter(l => l !== null).join("\n");
      return lines;
    }
    case "update_task_status": {
      const statusEmoji = { pending: "⏳", in_progress: "🔄", completed: "✅", urgent: "🔴" }[args.new_status as string] ?? "📋";
      return `${statusEmoji} **I'm ready to update the task:**\n\n**Task:** "${args.task_title_hint}"\n**New Status:** ${(args.new_status as string).replace("_", " ")}\n\n**Shall I proceed?**`;
    }
    case "log_asset": {
      const makeModel = [args.make, args.model].filter(Boolean).join(" ");
      const lines = [
        `📦 **I'm ready to log the following asset:**`,
        ``,
        `**Name:** ${args.name}`,
        makeModel ? `**Make / Model:** ${makeModel}` : null,
        `**Category:** ${args.category}`,
        args.serial_number ? `**Serial Number:** ${args.serial_number}` : null,
        args.property_name ? `**Property:** ${args.property_name}` : null,
        args.purchase_value ? `**Value:** $${args.purchase_value}` : null,
        args.description ? `**Notes:** ${args.description}` : null,
        ``,
        `**Shall I proceed?**`,
      ].filter(l => l !== null).join("\n");
      return lines;
    }
    case "send_staff_message": {
      return `💬 **I'm ready to send the following message to ${args.recipient_name}:**\n\n> "${args.message_text}"\n\n**Shall I proceed?**`;
    }
    default:
      return `I'm ready to execute **${toolName}**. **Shall I proceed?**`;
  }
}
