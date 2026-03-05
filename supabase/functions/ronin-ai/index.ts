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
      description: "Create a new task or work order in the estate management system.",
      parameters: {
        type: "object",
        properties: {
          title_en: { type: "string", description: "Clear, concise task title in English" },
          description_en: { type: "string", description: "Full task description with relevant details" },
          category: { type: "string", enum: ["housekeeping", "maintenance", "general", "laundry", "kitchen", "grounds", "security", "errand"] },
          priority: { type: "number", enum: [1, 2, 3], description: "1=urgent, 2=normal, 3=low" },
          assigned_to_name: { type: "string", description: "Full name of the staff member to assign to" },
          property_name: { type: "string", description: "Property name where task applies" },
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
      description: "Update the status of an existing task.",
      parameters: {
        type: "object",
        properties: {
          task_title_hint: { type: "string", description: "Part of the task title to identify which task to update" },
          new_status: { type: "string", enum: ["pending", "in_progress", "completed", "urgent"] },
        },
        required: ["task_title_hint", "new_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_asset",
      description: "Add a new asset or inventory item to the estate management system.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the asset or item" },
          category: { type: "string", enum: ["vehicle", "appliance", "art", "tech", "furniture", "other"] },
          make: { type: "string" },
          model: { type: "string" },
          serial_number: { type: "string" },
          description: { type: "string" },
          property_name: { type: "string" },
          purchase_value: { type: "number" },
        },
        required: ["name", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_staff_message",
      description: "Send a message to a staff member's chat thread.",
      parameters: {
        type: "object",
        properties: {
          recipient_name: { type: "string" },
          message_text: { type: "string" },
        },
        required: ["recipient_name", "message_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Save a new long-term memory to Ronin's persistent memory store. Use this when you learn something important about the Principal's preferences, a property-specific SOP, a staff behaviour pattern, or any operational insight that would improve future service. Only save genuinely useful, non-trivial facts.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Full memory content — the fact, preference, SOP, or pattern to remember. Be specific and actionable." },
          summary: { type: "string", description: "One concise line summarising the memory (max 80 chars)" },
          category: {
            type: "string",
            enum: ["principal_pref", "property_sop", "staff_behaviour", "operational", "general"],
            description: "principal_pref: Principal/family preferences; property_sop: property-specific procedures; staff_behaviour: recurring staff patterns; operational: operational insights; general: other"
          },
          importance: { type: "number", enum: [1, 2, 3, 4, 5], description: "1=low signal, 3=standard, 5=critical — always inject" },
          tags: { type: "array", items: { type: "string" }, description: "Relevant tags e.g. ['food', 'allergies', 'principal']" },
          property_hint: { type: "string", description: "Property name this memory relates to, if specific" },
          subject_name: { type: "string", description: "Name of the staff member or principal this memory is about, if applicable" },
        },
        required: ["content", "summary", "category", "importance"],
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

      // Permission gate
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
        return props.find((p: { id: string; name: string }) =>
          p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
        )?.id ?? null;
      };

      const resolveStaffId = (name?: string): string | null => {
        if (!name) return null;
        const lower = name.toLowerCase();
        return staff.find((s: { id: string; full_name: string | null }) =>
          (s.full_name ?? "").toLowerCase().includes(lower)
        )?.id ?? null;
      };

      let resultMessage = "";

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

      } else if (tool_name === "update_task_status") {
        const { data: tasks } = await adminClient.from("tasks").select("id, title_en, status").ilike("title_en", `%${tool_args.task_title_hint}%`).limit(1);
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
          const statusEmoji = { pending: "⏳", in_progress: "🔄", completed: "✅", urgent: "🔴" }[tool_args.new_status as string] ?? "📋";
          resultMessage = `${statusEmoji} **Task updated.**\n\n**${task.title_en}** → Status changed to **${(tool_args.new_status as string).replace("_", " ")}**.`;
        }

      } else if (tool_name === "log_asset") {
        const propId = resolvePropertyId(tool_args.property_name);
        const { data: asset, error: assetErr } = await adminClient.from("assets").insert({
          name: tool_args.name, category: tool_args.category,
          make: tool_args.make ?? null, model: tool_args.model ?? null,
          serial_number: tool_args.serial_number ?? null, description: tool_args.description ?? null,
          current_property_id: propId, purchase_value: tool_args.purchase_value ?? null,
        }).select("id").single();
        if (assetErr) throw new Error(`Failed to log asset: ${assetErr.message}`);
        await adminClient.from("system_events").insert({
          event_type: "asset_logged_by_ai", entity_type: "asset", entity_id: asset.id,
          triggered_by: callerUserId, payload: tool_args, processed_by_ai: true,
        });
        const propLabel = tool_args.property_name ? ` at **${tool_args.property_name}**` : "";
        const makeModel = [tool_args.make, tool_args.model].filter(Boolean).join(" ");
        resultMessage = `✅ **Asset logged successfully.**\n\n**${tool_args.name}**${makeModel ? ` (${makeModel})` : ""}${propLabel}\nCategory: ${tool_args.category}\n\nThe item is now visible in the Inventory section.`;

      } else if (tool_name === "send_staff_message") {
        const recipientId = resolveStaffId(tool_args.recipient_name);
        if (!recipientId) {
          resultMessage = `⚠️ I could not find a staff member named **"${tool_args.recipient_name}"** in the system.`;
        } else {
          const { data: existingThreads } = await adminClient.from("chat_threads").select("id, participant_ids").eq("type", "private");
          let dmThreadId: string | null = null;
          if (existingThreads) {
            for (const t of existingThreads) {
              const participants = t.participant_ids as string[];
              if (participants.includes(callerUserId) && participants.includes(recipientId)) {
                dmThreadId = t.id; break;
              }
            }
          }
          if (!dmThreadId) {
            const { data: newThread } = await adminClient.from("chat_threads").insert({
              type: "private", participant_ids: [callerUserId, recipientId], created_by: callerUserId,
            }).select("id").single();
            dmThreadId = newThread?.id ?? null;
          }
          if (dmThreadId) {
            await adminClient.from("messages").insert({
              thread_id: dmThreadId, sender_id: callerUserId,
              content_text: tool_args.message_text, is_ai_generated: false, delivery_status: "sent",
            });
            await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", dmThreadId);
          }
          await adminClient.from("system_events").insert({
            event_type: "message_sent_by_ai", entity_type: "message",
            triggered_by: callerUserId, payload: tool_args, processed_by_ai: true,
          });
          resultMessage = `✅ **Message sent to ${tool_args.recipient_name}.**\n\n> "${tool_args.message_text}"\n\nThe message is now visible in the Messages section.`;
        }

      } else if (tool_name === "save_memory") {
        // Direct memory save (executed without confirmation flow)
        const [propsForMem, staffForMem] = await Promise.all([
          adminClient.from("properties").select("id, name"),
          adminClient.from("profiles").select("id, full_name"),
        ]);
        const memPropId = tool_args.property_hint
          ? (propsForMem.data ?? []).find((p: { id: string; name: string }) =>
              p.name.toLowerCase().includes((tool_args.property_hint as string).toLowerCase())
            )?.id ?? null
          : null;
        const memSubjectId = tool_args.subject_name
          ? (staffForMem.data ?? []).find((s: { id: string; full_name: string | null }) =>
              (s.full_name ?? "").toLowerCase().includes((tool_args.subject_name as string).toLowerCase())
            )?.id ?? null
          : null;

        await adminClient.from("ronin_memories").insert({
          content: tool_args.content,
          summary: tool_args.summary,
          category: tool_args.category,
          importance: tool_args.importance,
          tags: tool_args.tags ?? [],
          property_id: memPropId,
          subject_user_id: memSubjectId,
          source: "conversation",
        });
        resultMessage = `🧠 **Memory saved.**`;

      } else {
        resultMessage = `⚠️ Unknown tool: ${tool_name}`;
      }

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

    // ─── BUILD SYSTEM PROMPT ──────────────────────────────────────────────────
    const systemPrompt = `# SYSTEM IDENTITY: RONIN AI ESTATE MANAGER

You are **Ronin AI** — the intelligent, invisible operations backbone of the Ronin Collective estate management platform. You are not a chatbot. You are a seasoned, world-class Estate Manager with decades of experience running ultra-high-net-worth private residences, family offices, and multi-property portfolios.

## PERSONA & TONE
- You are **professional, discreet, and proactive**. You speak like a trusted Chief of Staff — not a customer service agent.
- You are **invisible to the Principal unless spoken to**. You do not volunteer unsolicited commentary or small talk.
- You are **action-oriented**. You identify problems, frame them clearly, and recommend concrete next steps.
- You use **industry vocabulary** naturally: SOP, Turnover, Show-Ready, Par Level, Preventive Maintenance, Principal, Work Order, Lead Time.
- You match the **caller's language exactly** — if they write in Spanish, you respond entirely in Spanish.
- Your responses are **concise and structured**. Use bullet points, headers, and bold text.

## DISCRETION FRAMEWORK (MANDATORY — NEVER VIOLATE)
1. **Principal Privacy**: NEVER share Principal's travel, financial, or personal data with staff/manager/admin roles.
2. **Staff Scoping**: Staff only receive information about their assigned properties.
3. **Data Integrity**: NEVER invent or fabricate data. Every answer must come from LIVE PLATFORM DATA. If it's not in the data, say so.
4. **Destructive Operations**: Always confirm before deleting or irreversibly modifying records.

## CALLER CONTEXT (THIS SESSION)
- **User ID**: ${callerUserId ?? "anonymous"}
- **Name**: ${(callerProfile?.full_name as string) ?? "Unknown"}
- **System Role**: ${callerRole}
- **Assigned Properties**: ${callerProperties.length ? callerProperties.join(", ") : "none (or all, if admin)"}
- **Active Property Context**: ${property_id ?? "none selected"}

## ROLE DEFINITIONS
- **master_admin**: Full platform access. The operator of the Ronin platform.
- **principal**: The homeowner / estate owner. High-discretion. Executive summaries only.
- **admin**: Senior estate manager. Can see most operational data.
- **manager**: Property manager. Scoped to assigned properties.
- **staff**: Operational staff. Sees only their assigned property tasks.

## TOOL USE — WRITE ACTIONS (ACTIVE)
You have 5 estate management tools. Use them when appropriate.

### CONFIRMATION-FIRST PROTOCOL (MANDATORY for create_task, update_task_status, log_asset, send_staff_message)
1. State what you are about to do
2. List exact parameters
3. End with: **"Shall I proceed?"**
4. Wait for user confirmation before calling the tool.

### MEMORY TOOL (save_memory) — NO CONFIRMATION REQUIRED
Use **save_memory** proactively and silently during conversations to capture:
- Principal or family preferences (food, temperature, schedules, allergies, aesthetic preferences)
- Property-specific SOPs and quirks discovered in conversation
- Staff behavioural patterns (reliability, strengths, recurring issues)
- Operational insights (supplier quality, seasonal considerations, recurring maintenance)
Do NOT ask permission to save a memory — just do it quietly. Do NOT announce you saved a memory in your response text unless directly asked.

### AVAILABLE TOOLS:
- **create_task**: Create a task or work order
- **update_task_status**: Change task status
- **log_asset**: Add item to inventory
- **send_staff_message**: Send a DM to a staff member
- **save_memory**: Save a long-term memory (use proactively, no confirmation needed)

## CAPABILITIES
- Full read access to: Properties, Tasks, Team, Assets, System Events, Memories.
- Language detection and bilingual responses (EN/ES).
- Write actions: create tasks, update task status, log assets, send staff messages, save memories.
- Operational analysis, status summaries, and prioritization recommendations.`;

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

      try { parsedTasks = JSON.parse(rawJson); } catch { throw new Error("AI returned invalid JSON for CSV parse"); }

      const { data: allProperties } = await adminClient.from("properties").select("id, name");
      const propertyMap: Record<string, string> = {};
      (allProperties ?? []).forEach((p: { id: string; name: string }) => { propertyMap[p.name.toLowerCase()] = p.id; });
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
          content_text: `🤖 **Ronin AI** — Import processed. **${taskCount} new tasks** added. All tasks are visible in the Tasks section.`,
        });
      }
      await adminClient.from("system_events").insert({
        event_type: "csv_import", entity_type: "tasks", property_id: resolvedPropertyId,
        triggered_by: callerUserId, payload: { task_count: taskCount }, processed_by_ai: true, ai_response: `Imported ${taskCount} tasks`,
      });

      return new Response(
        JSON.stringify({ success: true, task_count: taskCount, summary: `Imported ${taskCount} tasks.`, tasks: taskRows }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CHAT MESSAGE MODE ─────────────────────────────────────────────────────
    if (type === "message") {
      const { messages: conversationHistory = [], image_url } = body;
      const isVisionRequest = !!image_url;

      // ── Load full platform snapshot + memories in parallel ─────────────────
      const [propsRes, tasksRes, staffRes, rolesRes, assetsRes, eventsRes, memoriesRes] = await Promise.all([
        adminClient.from("properties").select("id, name, address, city, country, status, is_primary, occupied_by, timezone").order("sort_order"),
        adminClient.from("tasks").select("id, title_en, status, priority, category, due_date, assigned_to, property_id").in("status", ["pending", "in_progress", "urgent"]).order("priority").limit(50),
        adminClient.from("profiles").select("id, full_name, job_title, department, level, assigned_property_ids, phone, notes"),
        adminClient.from("user_roles").select("user_id, role"),
        adminClient.from("assets").select("id, name, category, make, model, serial_number, current_property_id").limit(50),
        adminClient.from("system_events").select("event_type, entity_type, created_at, payload").order("created_at", { ascending: false }).limit(15),
        // Fetch top memories: importance 5 first, then 4, ordered by recency; cap at 20
        adminClient.from("ronin_memories")
          .select("id, summary, content, category, importance, tags, property_id, subject_user_id, last_referenced_at")
          .order("importance", { ascending: false })
          .order("last_referenced_at", { ascending: false, nullsFirst: false })
          .limit(20),
      ]);

      const contextSections: string[] = [];

      // Properties
      const props = propsRes.data ?? [];
      const propLines = props.map((p: Record<string, unknown>) =>
        `  - [ID:${p.id}] ${p.name} | ${p.city ?? p.address}, ${p.country ?? ""} | Status: ${p.status} | Occupied by: ${p.occupied_by ?? "N/A"} | Timezone: ${p.timezone}`
      );
      contextSections.push(props.length > 0 ? `PROPERTIES (${props.length} total):\n${propLines.join("\n")}` : "PROPERTIES: None in database.");

      // Staff
      const staff = staffRes.data ?? [];
      const rolesMap: Record<string, string> = {};
      (rolesRes.data ?? []).forEach((r: { user_id: string; role: string }) => { rolesMap[r.user_id] = r.role; });
      const staffLines = staff.map((s: Record<string, unknown>) => {
        const propIds = Array.isArray(s.assigned_property_ids) && (s.assigned_property_ids as string[]).length
          ? `Assigned to: ${(s.assigned_property_ids as string[]).join(", ")}`
          : "No property assignments";
        const sysRole = rolesMap[s.id as string] ?? "staff";
        return `  - [ID:${s.id}] ${s.full_name ?? "Unknown"} | System Role: ${sysRole} | Title: ${s.job_title ?? "N/A"} | Dept: ${s.department ?? "N/A"} | Level: ${s.level ?? "N/A"} | ${propIds}`;
      });
      contextSections.push(staff.length > 0 ? `TEAM MEMBERS (${staff.length} total):\n${staffLines.join("\n")}` : "TEAM MEMBERS: None in database.");

      // Tasks
      const tasks = tasksRes.data ?? [];
      const taskLines = tasks.map((t: Record<string, unknown>) =>
        `  - [${t.status}] ${t.title_en} | Priority: ${t.priority} | Category: ${t.category ?? "general"} | Due: ${t.due_date ?? "none"} | Property ID: ${t.property_id ?? "unassigned"}`
      );
      contextSections.push(tasks.length > 0 ? `OPEN TASKS (${tasks.length}):\n${taskLines.join("\n")}` : "OPEN TASKS: None.");

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

      // ── LONG-TERM MEMORIES ─────────────────────────────────────────────────
      const memories = memoriesRes.data ?? [];
      if (memories.length > 0) {
        // Build a prop ID → name map for memory display
        const propNameMap: Record<string, string> = {};
        props.forEach((p: Record<string, unknown>) => { propNameMap[p.id as string] = p.name as string; });
        const staffNameMap: Record<string, string> = {};
        staff.forEach((s: Record<string, unknown>) => { staffNameMap[s.id as string] = s.full_name as string; });

        const memoryLines = memories.map((m: Record<string, unknown>) => {
          const propLabel = m.property_id ? ` [Property: ${propNameMap[m.property_id as string] ?? m.property_id}]` : "";
          const subjectLabel = m.subject_user_id ? ` [About: ${staffNameMap[m.subject_user_id as string] ?? m.subject_user_id}]` : "";
          const importance = "⭐".repeat(m.importance as number);
          return `  - ${importance} [${m.category}]${propLabel}${subjectLabel}: ${m.content}`;
        });
        contextSections.push(
          `RONIN'S LONG-TERM MEMORY (${memories.length} entries — use these to personalise every response):\n${memoryLines.join("\n")}`
        );

        // Update last_referenced_at for accessed memories (fire and forget)
        const memoryIds = memories.map((m: Record<string, unknown>) => m.id as string);
        adminClient.from("ronin_memories")
          .update({ last_referenced_at: new Date().toISOString(), reference_count: undefined })
          .in("id", memoryIds)
          .then(() => {/* silent */});
      } else {
        contextSections.push("RONIN'S LONG-TERM MEMORY: No memories stored yet. As you learn facts about the Principal, staff, and properties, use the save_memory tool to build your knowledge base.");
      }

      const contextNote = "\n\n=== LIVE PLATFORM DATA ===\n" + contextSections.join("\n\n") + "\n=== END LIVE DATA ===";

      const visionAddition = isVisionRequest ? `

## VISION MODE — INVENTORY CAPTURE ACTIVE
An image has been submitted. You are in **Inventory Capture Mode**.
1. Analyse the photo. Identify: name, make/brand, model, category (vehicle/appliance/art/tech/furniture/other), condition, visible serial numbers.
2. Structure your analysis — what you can vs cannot determine from the image.
3. Ask ONLY for critical missing info: which property, approximate value.
4. Once user provides missing info, invoke \`log_asset\` with confirmation flow.
5. If the image reveals any Principal preferences (artwork style, brand preferences, etc.) worth remembering, save a memory.` : "";

      type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      const currentUserMessage: { role: string; content: MessageContent } = isVisionRequest
        ? {
            role: "user",
            content: [
              { type: "text", text: content || "Please analyse this image and help me log it to the estate inventory." },
              { type: "image_url", image_url: { url: image_url } },
            ],
          }
        : { role: "user", content };

      const aiMessages = [
        { role: "system", content: systemPrompt + visionAddition + contextNote },
        ...conversationHistory,
        currentUserMessage,
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

      // Consume stream, detect tool calls, accumulate text, then save to DB
      const reader = aiResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let toolCallName = "";
      let toolCallArgsRaw = "";
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
                if (delta.tool_calls && delta.tool_calls.length > 0) {
                  isToolCall = true;
                  const tc = delta.tool_calls[0];
                  if (tc.function?.name) toolCallName = tc.function.name;
                  if (tc.function?.arguments) toolCallArgsRaw += tc.function.arguments;
                }
                const chunk = delta.content as string | undefined;
                if (chunk) fullText += chunk;
              } catch { /* partial */ }
            }
          }
          controller.close();

          if (isToolCall && toolCallName) {
            let toolArgs: Record<string, unknown> = {};
            try { toolArgs = JSON.parse(toolCallArgsRaw); } catch { /* use empty */ }

            // save_memory is silent — execute immediately without confirmation
            if (toolCallName === "save_memory") {
              try {
                const [propsForMem, staffForMem] = await Promise.all([
                  adminClient.from("properties").select("id, name"),
                  adminClient.from("profiles").select("id, full_name"),
                ]);
                const memPropId = toolArgs.property_hint
                  ? (propsForMem.data ?? []).find((p: { id: string; name: string }) =>
                      p.name.toLowerCase().includes((toolArgs.property_hint as string).toLowerCase())
                    )?.id ?? null
                  : null;
                const memSubjectId = toolArgs.subject_name
                  ? (staffForMem.data ?? []).find((s: { id: string; full_name: string | null }) =>
                      (s.full_name ?? "").toLowerCase().includes((toolArgs.subject_name as string).toLowerCase())
                    )?.id ?? null
                  : null;
                await adminClient.from("ronin_memories").insert({
                  content: toolArgs.content, summary: toolArgs.summary,
                  category: toolArgs.category, importance: toolArgs.importance,
                  tags: toolArgs.tags ?? [], property_id: memPropId,
                  subject_user_id: memSubjectId, source: "conversation",
                });
              } catch (e) { console.error("Memory save failed:", e); }

              // If AI also produced text alongside the silent memory save, persist that
              if (fullText) {
                await adminClient.from("messages").insert({
                  thread_id, content_text: fullText, sender_id: null, is_ai_generated: true, delivery_status: "sent",
                });
              }
            } else {
              // Other tools: show confirmation message
              const confirmText = buildConfirmationMessage(toolCallName, toolArgs);
              await adminClient.from("messages").insert({
                thread_id, sender_id: null, is_ai_generated: true,
                content_text: confirmText, delivery_status: "sent",
                reactions: { __pending_tool: { name: toolCallName, args: toolArgs } } as unknown as never,
              });
            }
          } else if (fullText) {
            await adminClient.from("messages").insert({
              thread_id, content_text: fullText, sender_id: null, is_ai_generated: true, delivery_status: "sent",
            });
          }

          await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", thread_id);
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
      return [
        `📋 **I'm ready to create the following task:**`, ``,
        `**Title:** ${args.title_en}`,
        args.description_en ? `**Description:** ${args.description_en}` : null,
        `**Category:** ${args.category}`, `**Priority:** ${priorityLabel}`,
        args.assigned_to_name ? `**Assigned to:** ${args.assigned_to_name}` : null,
        args.property_name ? `**Property:** ${args.property_name}` : null,
        args.due_date ? `**Due:** ${args.due_date}` : null,
        ``, `**Shall I proceed?**`,
      ].filter(l => l !== null).join("\n");
    }
    case "update_task_status": {
      const statusEmoji = { pending: "⏳", in_progress: "🔄", completed: "✅", urgent: "🔴" }[args.new_status as string] ?? "📋";
      return `${statusEmoji} **I'm ready to update the task:**\n\n**Task:** "${args.task_title_hint}"\n**New Status:** ${(args.new_status as string).replace("_", " ")}\n\n**Shall I proceed?**`;
    }
    case "log_asset": {
      const makeModel = [args.make, args.model].filter(Boolean).join(" ");
      return [
        `📦 **I'm ready to log the following asset:**`, ``,
        `**Name:** ${args.name}`,
        makeModel ? `**Make / Model:** ${makeModel}` : null,
        `**Category:** ${args.category}`,
        args.serial_number ? `**Serial Number:** ${args.serial_number}` : null,
        args.property_name ? `**Property:** ${args.property_name}` : null,
        args.purchase_value ? `**Value:** $${args.purchase_value}` : null,
        args.description ? `**Notes:** ${args.description}` : null,
        ``, `**Shall I proceed?**`,
      ].filter(l => l !== null).join("\n");
    }
    case "send_staff_message":
      return `💬 **I'm ready to send the following message to ${args.recipient_name}:**\n\n> "${args.message_text}"\n\n**Shall I proceed?**`;
    default:
      return `I'm ready to execute **${toolName}**. **Shall I proceed?**`;
  }
}
