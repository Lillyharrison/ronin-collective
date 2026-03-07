import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────
// Split into: OBSERVATION (auto-execute in loop), WRITE (require confirmation), SILENT (auto, no feedback)
const OBSERVATION_TOOL_NAMES = ["search_tasks", "search_assets", "get_calendar_events"];
const WRITE_TOOL_NAMES = ["create_task", "update_task_status", "log_asset", "send_staff_message"];
const SILENT_TOOL_NAMES = ["save_memory", "add_shopping_list_item"];

const RONIN_TOOLS = [
  // ── OBSERVATION TOOLS ────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "search_tasks",
      description: "Search and filter tasks in the estate management system. Use this BEFORE creating a task (to check for duplicates), when answering questions about task status, or to find tasks to update. Returns current task data.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword to match against task titles" },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "urgent", "all"], description: "Filter by status. Use 'all' to include all statuses including completed." },
          property_name: { type: "string", description: "Filter by property name" },
          assignee_name: { type: "string", description: "Filter by assigned staff member name" },
          limit: { type: "number", description: "Max results (default 10, max 25)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_assets",
      description: "Search the estate inventory/assets database. Use BEFORE logging a new asset (to check for duplicates), or to answer inventory questions. Returns current asset data.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword matched against asset name, make, or model" },
          category: { type: "string", enum: ["vehicle", "appliance", "art", "tech", "furniture", "other", "all"] },
          property_name: { type: "string", description: "Filter by property name" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "Retrieve upcoming calendar events. Use to check what's scheduled when answering questions about travel, guest stays, or upcoming property activity.",
      parameters: {
        type: "object",
        properties: {
          days_ahead: { type: "number", description: "Number of days ahead to look (default 30)" },
          property_name: { type: "string", description: "Filter by property name" },
          event_type: { type: "string", description: "Filter by event type (e.g. travel, guest_stay, maintenance)" },
        },
        required: [],
      },
    },
  },

  // ── WRITE TOOLS (confirmation required) ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task or work order. Use search_tasks first to avoid duplicates.",
      parameters: {
        type: "object",
        properties: {
          title_en: { type: "string" },
          description_en: { type: "string" },
          category: { type: "string", enum: ["housekeeping", "maintenance", "general", "laundry", "kitchen", "grounds", "security", "errand"] },
          priority: { type: "number", enum: [1, 2, 3], description: "1=urgent, 2=normal, 3=low" },
          assigned_to_name: { type: "string" },
          property_name: { type: "string" },
          due_date: { type: "string" },
        },
        required: ["title_en", "category", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task_status",
      description: "Update the status of an existing task. Use search_tasks first to confirm the task exists.",
      parameters: {
        type: "object",
        properties: {
          task_title_hint: { type: "string" },
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
      description: "Add a new asset to inventory. Use search_assets first to check for duplicates.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
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
      description: "Send a direct message to a staff member.",
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

  // ── SILENT TOOLS (auto-execute, no feedback) ─────────────────────────────────
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Silently save a long-term memory. Use proactively when you learn preferences, SOPs, or patterns worth remembering.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          summary: { type: "string", description: "One concise line (max 80 chars)" },
          category: { type: "string", enum: ["principal_pref", "property_sop", "staff_behaviour", "operational", "general"] },
          importance: { type: "number", enum: [1, 2, 3, 4, 5] },
          tags: { type: "array", items: { type: "string" } },
          property_hint: { type: "string" },
          subject_name: { type: "string" },
        },
        required: ["content", "summary", "category", "importance"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_shopping_list_item",
      description: "Add one or more items to the household shopping list. Use whenever someone asks to add something to the shopping list, grocery list, or buy list. Do NOT create a task — insert directly into the shopping list. Auto-detect the category based on the item name.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "One or more items to add to the shopping list",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name, e.g. 'Watermelon'" },
                category: { type: "string", enum: ["food", "cleaning", "supplies", "personal", "tech", "other"], description: "Auto-detect: food=groceries/produce/drinks, cleaning=detergents/mops, supplies=paper/packaging, personal=toiletries/cosmetics, tech=electronics/batteries" },
                quantity: { type: "string", description: "Optional quantity, e.g. '2 kg', '1 case'" },
                notes: { type: "string", description: "Optional extra notes" },
              },
              required: ["name", "category"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Non-streaming LLM call for ReAct loop iterations */
async function callLLMSync(
  messages: unknown[],
  tools: unknown[],
  apiKey: string,
  model = "google/gemini-2.5-flash"
): Promise<{
  choices: Array<{
    finish_reason: string;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
  }>;
}> {
  const body: Record<string, unknown> = { model, messages, stream: false };
  if (tools.length > 0) { body.tools = tools; body.tool_choice = "auto"; }
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LLM sync error ${resp.status}: ${t}`);
  }
  return resp.json();
}

type ContextData = {
  props: Array<Record<string, unknown>>;
  staff: Array<Record<string, unknown>>;
};

/** Execute a read-only observation tool and return structured results */
async function executeObservationTool(
  name: string,
  args: Record<string, unknown>,
  adminClient: ReturnType<typeof createClient>,
  ctx: ContextData
): Promise<unknown> {
  const propNameMap = Object.fromEntries(ctx.props.map(p => [p.id as string, p.name as string]));
  const staffNameMap = Object.fromEntries(ctx.staff.map(s => [s.id as string, (s.full_name as string) ?? "Unknown"]));

  const resolvePropertyId = (hint?: unknown): string | null => {
    if (!hint) return null;
    const lower = (hint as string).toLowerCase();
    return ctx.props.find(p => (p.name as string).toLowerCase().includes(lower))?.id as string ?? null;
  };

  if (name === "search_tasks") {
    let q = adminClient.from("tasks")
      .select("id, title_en, status, priority, category, due_date, assigned_to, property_id");
    const s = args.status as string | undefined;
    if (s && s !== "all") q = q.eq("status", s);
    if (args.keyword) q = q.ilike("title_en", `%${args.keyword}%`);
    const propId = resolvePropertyId(args.property_name);
    if (propId) q = q.eq("property_id", propId);
    if (args.assignee_name) {
      const lower = (args.assignee_name as string).toLowerCase();
      const match = ctx.staff.find(s => (s.full_name as string ?? "").toLowerCase().includes(lower));
      if (match) q = q.eq("assigned_to", match.id as string);
    }
    const limit = Math.min((args.limit as number) ?? 10, 25);
    q = q.order("priority").limit(limit);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      tasks: data?.map(t => ({
        id: t.id, title: t.title_en, status: t.status, priority: t.priority,
        category: t.category, due_date: t.due_date ?? "none",
        assigned_to: staffNameMap[t.assigned_to] ?? t.assigned_to ?? "unassigned",
        property: propNameMap[t.property_id] ?? t.property_id ?? "unassigned",
      })),
    };
  }

  if (name === "search_assets") {
    let q = adminClient.from("assets")
      .select("id, name, category, make, model, serial_number, current_property_id");
    if (args.keyword) {
      const kw = `%${args.keyword}%`;
      q = q.or(`name.ilike.${kw},make.ilike.${kw},model.ilike.${kw}`);
    }
    if (args.category && args.category !== "all") q = q.eq("category", args.category);
    const propId = resolvePropertyId(args.property_name);
    if (propId) q = q.eq("current_property_id", propId);
    q = q.limit(15);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      assets: data?.map(a => ({
        name: a.name, category: a.category, make: a.make, model: a.model,
        serial_number: a.serial_number,
        property: propNameMap[a.current_property_id] ?? a.current_property_id ?? "unassigned",
      })),
    };
  }

  if (name === "get_calendar_events") {
    const daysAhead = (args.days_ahead as number) ?? 30;
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);
    let q = adminClient.from("calendar_events")
      .select("id, title, event_type, start_date, end_date, property_id, description, status, location")
      .gte("start_date", new Date().toISOString())
      .lte("start_date", future.toISOString())
      .order("start_date")
      .limit(15);
    const propId = resolvePropertyId(args.property_name);
    if (propId) q = q.eq("property_id", propId);
    if (args.event_type) q = q.eq("event_type", args.event_type as string);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      events: data?.map(e => ({
        title: e.title, type: e.event_type, start: e.start_date, end: e.end_date,
        property: propNameMap[e.property_id] ?? e.property_id ?? "N/A",
        description: e.description, status: e.status, location: e.location,
      })),
    };
  }

  return { error: `Unknown observation tool: ${name}` };
}

/** Silently save a memory to the knowledge base */
async function saveMemorySilently(
  args: Record<string, unknown>,
  adminClient: ReturnType<typeof createClient>
): Promise<void> {
  try {
    const [pRes, sRes] = await Promise.all([
      adminClient.from("properties").select("id, name"),
      adminClient.from("profiles").select("id, full_name"),
    ]);
    const memPropId = args.property_hint
      ? (pRes.data ?? []).find((p: { id: string; name: string }) =>
          p.name.toLowerCase().includes((args.property_hint as string).toLowerCase()))?.id ?? null
      : null;
    const memSubjectId = args.subject_name
      ? (sRes.data ?? []).find((s: { id: string; full_name: string | null }) =>
          (s.full_name ?? "").toLowerCase().includes((args.subject_name as string).toLowerCase()))?.id ?? null
      : null;
    await adminClient.from("ronin_memories").insert({
      content: args.content, summary: args.summary,
      category: args.category, importance: args.importance,
      tags: args.tags ?? [], property_id: memPropId,
      subject_user_id: memSubjectId, source: "conversation",
    });
  } catch (e) {
    console.error("Memory save failed:", e);
  }
}

/** Add items to the shopping list */
async function addShoppingListItemsSilently(
  args: Record<string, unknown>,
  callerUserId: string | null,
  adminClient: ReturnType<typeof createClient>
): Promise<string> {
  try {
    const items = args.items as Array<{ name: string; category: string; quantity?: string; notes?: string }>;
    if (!items?.length) return "⚠️ No items provided.";
    const rows = items.map(item => ({
      name: item.name,
      category: item.category,
      quantity: item.quantity ?? null,
      notes: item.notes ?? null,
      created_by: callerUserId,
      is_checked: false,
    }));
    const { error } = await adminClient.from("shopping_list_items").insert(rows);
    if (error) throw error;
    const names = items.map(i => `**${i.name}**`).join(", ");
    return `🛒 Added to the shopping list: ${names}. You can view the full list in **Orders → Shopping List**.`;
  } catch (e) {
    console.error("Shopping list insert failed:", e);
    return "⚠️ Failed to add item(s) to the shopping list.";
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── AUTH ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    let callerUserId: string | null = null;
    let callerProfile: Record<string, unknown> | null = null;
    let callerProperties: string[] = [];
    let callerRole = "staff";

    if (authHeader?.startsWith("Bearer ")) {
      const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anonClient.auth.getUser();
      if (user) {
        callerUserId = user.id;
        const { data: profile } = await adminClient.from("profiles").select("*").eq("id", user.id).single();
        if (profile) { callerProfile = profile; callerProperties = (profile.assigned_property_ids as string[]) ?? []; }
        const { data: roleRow } = await adminClient.from("user_roles").select("role").eq("user_id", user.id).single();
        if (roleRow) callerRole = roleRow.role;
      }
    }

    const body = await req.json();
    const { type, content, thread_id, csv_content, property_id, action } = body;

    // ─── INVITE USER ──────────────────────────────────────────────────────────
    if (action === "invite_user") {
      if (!["master_admin", "admin"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { email, full_name, job_title, level, department, role, start_date, birthday, notes, phone, assigned_property_ids, section_permissions } = body;
      if (!email || !full_name || !level || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Derive redirect URL from request origin so it works on any domain (preview, production, custom)
      const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/") || "https://id-preview--733ed5ee-915b-45c9-8d99-a2a9c67f228b.lovable.app";
      const redirectTo = body.redirect_url || `${origin}/reset-password`;
      const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo });
      if (inviteErr || !inviteData?.user) {
        return new Response(JSON.stringify({ error: inviteErr?.message ?? "Failed to invite user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const uid = inviteData.user.id;
      await adminClient.from("profiles").upsert({
        id: uid, full_name, job_title: job_title || null, level,
        department: department || null, start_date: start_date || null,
        birthday: birthday || null, notes: notes || null,
        phone: phone || null,
        assigned_property_ids: assigned_property_ids || [],
        section_permissions: section_permissions || null,
      });
      const { data: existingRole } = await adminClient.from("user_roles").select("id").eq("user_id", uid).maybeSingle();
      if (!existingRole) await adminClient.from("user_roles").insert({ user_id: uid, role });
      else await adminClient.from("user_roles").update({ role }).eq("user_id", uid);
      await adminClient.from("user_stats").insert({ user_id: uid }).select().maybeSingle();
      await adminClient.from("system_events").insert({ event_type: "user_invited", entity_type: "profile", entity_id: uid, triggered_by: callerUserId, payload: { email, full_name, level, role }, processed_by_ai: false });
      return new Response(JSON.stringify({ success: true, user_id: uid }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── RESEND INVITATION ────────────────────────────────────────────────────
    if (action === "resend_invitation") {
      if (!["master_admin", "admin"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Accept either a direct email OR a target_user_id (look up their email)
      let emailToInvite: string | null = body.email || null;
      if (!emailToInvite && body.target_user_id) {
        const { data: userData } = await adminClient.auth.admin.getUserById(body.target_user_id);
        emailToInvite = userData?.user?.email ?? null;
      }
      if (!emailToInvite) return new Response(JSON.stringify({ error: "Could not resolve email for this user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/") || "https://id-preview--733ed5ee-915b-45c9-8d99-a2a9c67f228b.lovable.app";
      const redirectTo = body.redirect_url || `${origin}/reset-password`;
      // Use generateLink with type 'recovery' — works for existing users unlike inviteUserByEmail
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: emailToInvite,
        options: { redirectTo },
      });
      if (linkErr) {
        return new Response(JSON.stringify({ error: linkErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Send the email via Supabase's built-in mailer by hitting the action link
      const actionLink = linkData?.properties?.action_link;
      if (actionLink) {
        await fetch(actionLink, { method: "GET" });
      }
      return new Response(JSON.stringify({ success: true, user_id: linkData?.user?.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── DELETE USER ──────────────────────────────────────────────────────────
    if (action === "delete_user") {
      if (callerRole !== "master_admin") {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { target_user_id } = body;
      if (!target_user_id) return new Response(JSON.stringify({ error: "Missing target_user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (target_user_id === callerUserId) return new Response(JSON.stringify({ error: "You cannot delete yourself" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(target_user_id);
      if (deleteErr) return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── TOOL EXECUTION (confirmed by user) ───────────────────────────────────
    if (action === "execute_tool") {
      if (!callerUserId) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!["master_admin", "admin", "manager"].includes(callerRole)) return new Response(JSON.stringify({ error: "Insufficient permissions." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { tool_name, tool_args } = body;
      const [propsRes, staffRes] = await Promise.all([adminClient.from("properties").select("id, name"), adminClient.from("profiles").select("id, full_name")]);
      const props = propsRes.data ?? [];
      const staff = staffRes.data ?? [];
      const resolvePropertyId = (name?: string) => {
        if (!name) return null;
        const lower = name.toLowerCase();
        return props.find((p: { id: string; name: string }) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()))?.id ?? null;
      };
      const resolveStaffId = (name?: string) => {
        if (!name) return null;
        return staff.find((s: { id: string; full_name: string | null }) => (s.full_name ?? "").toLowerCase().includes(name.toLowerCase()))?.id ?? null;
      };

      let resultMessage = "";

      if (tool_name === "create_task") {
        const { data: task, error: taskErr } = await adminClient.from("tasks").insert({ title_en: tool_args.title_en, description_en: tool_args.description_en ?? null, category: tool_args.category, priority: tool_args.priority, status: tool_args.priority === 1 ? "urgent" : "pending", assigned_to: resolveStaffId(tool_args.assigned_to_name), property_id: resolvePropertyId(tool_args.property_name), due_date: tool_args.due_date ?? null, created_by: callerUserId }).select("id").single();
        if (taskErr) throw new Error(`Failed to create task: ${taskErr.message}`);
        await adminClient.from("system_events").insert({ event_type: "task_created_by_ai", entity_type: "task", entity_id: task.id, triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
        const priorityLabel = tool_args.priority === 1 ? "🔴 Urgent" : tool_args.priority === 2 ? "🟡 Normal" : "🟢 Low";
        resultMessage = `✅ **Task created.**\n\n**${tool_args.title_en}**${tool_args.assigned_to_name ? ` — ${tool_args.assigned_to_name}` : ""}${tool_args.property_name ? ` @ ${tool_args.property_name}` : ""}\nPriority: ${priorityLabel} | Category: ${tool_args.category}\n\nVisible in the Tasks section.`;

      } else if (tool_name === "update_task_status") {
        const { data: tasks } = await adminClient.from("tasks").select("id, title_en").ilike("title_en", `%${tool_args.task_title_hint}%`).limit(1);
        if (!tasks?.length) { resultMessage = `⚠️ No task matching **"${tool_args.task_title_hint}"** found.`; }
        else {
          await adminClient.from("tasks").update({ status: tool_args.new_status, completed_at: tool_args.new_status === "completed" ? new Date().toISOString() : null }).eq("id", tasks[0].id);
          await adminClient.from("system_events").insert({ event_type: "task_status_updated_by_ai", entity_type: "task", entity_id: tasks[0].id, triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
          const statusEmoji: Record<string, string> = { pending: "⏳", in_progress: "🔄", completed: "✅", urgent: "🔴" };
          resultMessage = `${statusEmoji[tool_args.new_status] ?? "📋"} **Task updated.**\n\n**${tasks[0].title_en}** → **${(tool_args.new_status as string).replace("_", " ")}**`;
        }

      } else if (tool_name === "log_asset") {
        const { data: asset, error: assetErr } = await adminClient.from("assets").insert({ name: tool_args.name, category: tool_args.category, make: tool_args.make ?? null, model: tool_args.model ?? null, serial_number: tool_args.serial_number ?? null, description: tool_args.description ?? null, current_property_id: resolvePropertyId(tool_args.property_name), purchase_value: tool_args.purchase_value ?? null }).select("id").single();
        if (assetErr) throw new Error(`Failed to log asset: ${assetErr.message}`);
        await adminClient.from("system_events").insert({ event_type: "asset_logged_by_ai", entity_type: "asset", entity_id: asset.id, triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
        const makeModel = [tool_args.make, tool_args.model].filter(Boolean).join(" ");
        resultMessage = `✅ **Asset logged.**\n\n**${tool_args.name}**${makeModel ? ` (${makeModel})` : ""}${tool_args.property_name ? ` @ ${tool_args.property_name}` : ""}\nCategory: ${tool_args.category}\n\nVisible in Inventory.`;

      } else if (tool_name === "send_staff_message") {
        const recipientId = resolveStaffId(tool_args.recipient_name);
        if (!recipientId) { resultMessage = `⚠️ Staff member **"${tool_args.recipient_name}"** not found.`; }
        else {
          const { data: existingThreads } = await adminClient.from("chat_threads").select("id, participant_ids").eq("type", "private");
          let dmThreadId: string | null = null;
          for (const t of existingThreads ?? []) {
            const participants = t.participant_ids as string[];
            if (participants.includes(callerUserId) && participants.includes(recipientId)) { dmThreadId = t.id; break; }
          }
          if (!dmThreadId) {
            const { data: newThread } = await adminClient.from("chat_threads").insert({ type: "private", participant_ids: [callerUserId, recipientId], created_by: callerUserId }).select("id").single();
            dmThreadId = newThread?.id ?? null;
          }
          if (dmThreadId) {
            await adminClient.from("messages").insert({ thread_id: dmThreadId, sender_id: callerUserId, content_text: tool_args.message_text, is_ai_generated: false, delivery_status: "sent" });
            await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", dmThreadId);
          }
          await adminClient.from("system_events").insert({ event_type: "message_sent_by_ai", entity_type: "message", triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
          resultMessage = `✅ **Message sent to ${tool_args.recipient_name}.**\n\n> "${tool_args.message_text}"\n\nVisible in Messages.`;
        }

      } else if (tool_name === "save_memory") {
        await saveMemorySilently(tool_args, adminClient);
        resultMessage = `🧠 **Memory saved.**`;
      } else {
        resultMessage = `⚠️ Unknown tool: ${tool_name}`;
      }

      if (thread_id && resultMessage) {
        await adminClient.from("messages").insert({ thread_id, sender_id: null, is_ai_generated: true, content_text: resultMessage, delivery_status: "sent" });
        await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", thread_id);
      }
      return new Response(JSON.stringify({ success: true, result: resultMessage }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── BUILD SYSTEM PROMPT ──────────────────────────────────────────────────
    const systemPrompt = `# SYSTEM IDENTITY: RONIN AI ESTATE MANAGER

You are **Ronin AI** — the intelligent operations backbone of the Ronin Collective estate management platform. A seasoned, world-class Estate Manager with decades of experience running ultra-high-net-worth private residences.

## PERSONA & TONE
- Professional, discreet, proactive. Speak like a trusted Chief of Staff.
- Action-oriented — identify problems and recommend concrete next steps.
- Use industry vocabulary naturally: SOP, Turnover, Show-Ready, Par Level, Preventive Maintenance, Work Order.
- Match the caller's language exactly (EN/ES). Never mix.
- Concise and structured — use bullet points, headers, and bold text.
- **NEVER output your internal reasoning, thinking steps, THINK/OBSERVE/REASON tags, or chain-of-thought in your final reply.** Your reasoning is internal only. Only the clean, final answer reaches the user.

## DISCRETION FRAMEWORK (NEVER VIOLATE)
1. NEVER share Principal travel, financial, or personal data with staff/manager/admin roles.
2. Staff only receive information about their assigned properties.
3. NEVER fabricate platform data (tasks, assets, people, events). For platform-specific questions, only report what is in LIVE PLATFORM DATA. If absent, say so.
4. For general knowledge questions (wine, food, etiquette, hospitality, travel, lifestyle, recommendations) — use your extensive LLM training knowledge freely and confidently. You are a world-class estate manager with deep expertise. Do NOT say "I don't have access to a database" for common knowledge topics.
5. ALWAYS check your LONG-TERM MEMORY first — if a preference has been saved (e.g. the Principal likes Dom Pérignon), lead with that personalised insight before giving general advice.
6. Always confirm before destructive operations.

## CALLER CONTEXT
- **User ID**: ${callerUserId ?? "anonymous"}
- **Name**: ${(callerProfile?.full_name as string) ?? "Unknown"}
- **System Role**: ${callerRole}
- **Assigned Properties**: ${callerProperties.length ? callerProperties.join(", ") : "none (or all, if admin)"}
- **Active Property Context**: ${property_id ?? "none selected"}

## REASONING APPROACH — ReAct Pattern (MANDATORY)
You operate in a multi-step reasoning loop. BEFORE taking any write action or answering a data question, you MUST:

1. **THINK**: What information do I need to answer accurately or act correctly?
2. **OBSERVE**: Call the appropriate observation tool(s) to gather current data.
3. **REASON**: Based on what you observed, decide the best course of action.
4. **ACT or RESPOND**: Call a write tool (with confirmation) or give a data-informed response.

### OBSERVATION TOOLS — call without asking permission:
- **search_tasks**: Before creating any task, ALWAYS search first to check for duplicates. Also use for task status questions.
- **search_assets**: Before logging any asset, ALWAYS search first to check if it already exists.
- **get_calendar_events**: Use when asked about upcoming schedules, travel, or property activity.

### WRITE TOOLS — confirmation required before executing:
- **create_task**, **update_task_status**, **log_asset**, **send_staff_message**

### SILENT TOOL — execute without asking:
- **save_memory**: Use proactively when you learn preferences, SOPs, or patterns. Never announce you saved a memory.

## CONFIRMATION-FIRST PROTOCOL (for write tools)
1. State what you are about to do (include what you found from observations)
2. List exact parameters
3. End with: **"Shall I proceed?"**
4. Wait for confirmation before calling the tool.

## CAPABILITIES
- Full read access: Properties, Tasks, Team, Assets, Events, Memories.
- Bilingual (EN/ES). Write actions: create tasks, update task status, log assets, send messages, save memories.`;

    // ─── CSV IMPORT MODE ───────────────────────────────────────────────────────
    if (type === "csv_import") {
      if (!["master_admin", "admin"].includes(callerRole)) return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const parseResp = await callLLMSync([{ role: "user", content: `Parse this CSV into a JSON array of: { title_en, description_en, category (housekeeping/maintenance/general), priority (1-3), property_hint }. Return ONLY valid JSON array.\n\nCSV:\n${csv_content}` }], [], LOVABLE_API_KEY, "google/gemini-2.5-flash");
      let rawJson = parseResp.choices?.[0]?.message?.content ?? "[]";
      rawJson = rawJson.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      let parsedTasks: Array<{ title_en: string; description_en?: string; category?: string; priority?: number; property_hint?: string }> = [];
      try { parsedTasks = JSON.parse(rawJson); } catch { throw new Error("AI returned invalid JSON"); }

      const { data: allProps } = await adminClient.from("properties").select("id, name");
      const propertyMap: Record<string, string> = {};
      (allProps ?? []).forEach((p: { id: string; name: string }) => { propertyMap[p.name.toLowerCase()] = p.id; });

      const taskRows = parsedTasks.map((t) => {
        let resolvedPropId: string | null = property_id ?? null;
        if (!resolvedPropId && t.property_hint) {
          const hint = t.property_hint.toLowerCase();
          for (const [name, id] of Object.entries(propertyMap)) {
            if (name.includes(hint) || hint.includes(name)) { resolvedPropId = id; break; }
          }
        }
        return { title_en: t.title_en, description_en: t.description_en ?? null, category: t.category ?? "general", priority: t.priority ?? 2, property_id: resolvedPropId, status: "pending" as const, created_by: callerUserId! };
      });

      const { data: inserted, error: insertError } = await adminClient.from("tasks").insert(taskRows).select("id");
      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);
      const taskCount = inserted?.length ?? 0;

      if (thread_id) {
        await adminClient.from("messages").insert({ thread_id, sender_id: null, is_ai_generated: true, content_text: `🤖 **Ronin AI** — Import complete. **${taskCount} new tasks** added. Visible in Tasks section.` });
      }
      await adminClient.from("system_events").insert({ event_type: "csv_import", entity_type: "tasks", property_id: property_id ?? null, triggered_by: callerUserId, payload: { task_count: taskCount }, processed_by_ai: true });
      return new Response(JSON.stringify({ success: true, task_count: taskCount, summary: `Imported ${taskCount} tasks.` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        adminClient.from("ronin_memories").select("id, summary, content, category, importance, tags, property_id, subject_user_id").order("importance", { ascending: false }).order("last_referenced_at", { ascending: false, nullsFirst: false }).limit(20),
      ]);

      const contextSections: string[] = [];
      const props = propsRes.data ?? [];
      const staff = staffRes.data ?? [];
      const rolesMap: Record<string, string> = {};
      (rolesRes.data ?? []).forEach((r: { user_id: string; role: string }) => { rolesMap[r.user_id] = r.role; });
      const propNameMap = Object.fromEntries(props.map((p: Record<string, unknown>) => [p.id as string, p.name as string]));
      const staffNameMap = Object.fromEntries(staff.map((s: Record<string, unknown>) => [s.id as string, (s.full_name as string) ?? "Unknown"]));

      contextSections.push(props.length > 0
        ? `PROPERTIES (${props.length}):\n${props.map((p: Record<string, unknown>) => `  - [ID:${p.id}] ${p.name} | ${p.city ?? p.address}, ${p.country ?? ""} | Status: ${p.status} | Occupied by: ${p.occupied_by ?? "N/A"} | Timezone: ${p.timezone}`).join("\n")}`
        : "PROPERTIES: None.");

      contextSections.push(staff.length > 0
        ? `TEAM (${staff.length}):\n${staff.map((s: Record<string, unknown>) => `  - [ID:${s.id}] ${s.full_name ?? "Unknown"} | Role: ${rolesMap[s.id as string] ?? "staff"} | Title: ${s.job_title ?? "N/A"} | Dept: ${s.department ?? "N/A"} | Level: ${s.level ?? "N/A"}`).join("\n")}`
        : "TEAM: None.");

      const tasks = tasksRes.data ?? [];
      contextSections.push(tasks.length > 0
        ? `OPEN TASKS (${tasks.length}):\n${tasks.map((t: Record<string, unknown>) => `  - [${t.status}] ${t.title_en} | P${t.priority} | ${t.category ?? "general"} | Due: ${t.due_date ?? "none"} | Assigned: ${staffNameMap[t.assigned_to as string] ?? "unassigned"} | Property: ${propNameMap[t.property_id as string] ?? "unassigned"}`).join("\n")}`
        : "OPEN TASKS: None.");

      const assets = assetsRes.data ?? [];
      if (assets.length > 0) contextSections.push(`ASSETS (${assets.length}):\n${assets.map((a: Record<string, unknown>) => `  - ${a.name} | ${a.category} | ${a.make ?? ""} ${a.model ?? ""} | Property: ${propNameMap[a.current_property_id as string] ?? "unassigned"}`).join("\n")}`);

      const events = eventsRes.data ?? [];
      if (events.length > 0) contextSections.push(`RECENT EVENTS:\n${events.map((e: Record<string, unknown>) => `  - [${e.event_type}] ${e.entity_type ?? ""} @ ${e.created_at}`).join("\n")}`);

      const memories = memoriesRes.data ?? [];
      if (memories.length > 0) {
        contextSections.push(`RONIN'S LONG-TERM MEMORY (${memories.length} entries — personalise every response using these):\n${memories.map((m: Record<string, unknown>) => `  - ${"⭐".repeat(m.importance as number)} [${m.category}]${m.property_id ? ` [${propNameMap[m.property_id as string] ?? ""}]` : ""}${m.subject_user_id ? ` [About: ${staffNameMap[m.subject_user_id as string] ?? ""}]` : ""}: ${m.content}`).join("\n")}`);
        // Update last_referenced_at (fire & forget)
        adminClient.from("ronin_memories").update({ last_referenced_at: new Date().toISOString() }).in("id", memories.map((m: Record<string, unknown>) => m.id as string)).then(() => {/**/});
      } else {
        contextSections.push("RONIN'S LONG-TERM MEMORY: Empty. Use save_memory to build your knowledge base as you learn.");
      }

      const contextNote = "\n\n=== LIVE PLATFORM DATA ===\n" + contextSections.join("\n\n") + "\n=== END LIVE DATA ===";

      const visionAddition = isVisionRequest ? `

## VISION MODE — INVENTORY CAPTURE ACTIVE
1. Analyse the photo: identify name, make/brand, model, category, condition, serial numbers.
2. Structure your analysis — what you can vs cannot determine.
3. Use search_assets first to check if this item already exists in inventory.
4. Ask only for critical missing info (property, value) then use log_asset with confirmation.
5. If image reveals Principal preferences, save a memory.` : "";

      type MsgContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      const currentUserMessage: { role: string; content: MsgContent } = isVisionRequest
        ? { role: "user", content: [{ type: "text", text: content || "Please analyse this image and help me log it to the estate inventory." }, { type: "image_url", image_url: { url: image_url } }] }
        : { role: "user", content };

      const baseSystemMsg = { role: "system", content: systemPrompt + visionAddition + contextNote };
      const initialMessages: unknown[] = [baseSystemMsg, ...conversationHistory, currentUserMessage];

      // ── ReAct Loop (thread_id: non-streaming, synchronous) ─────────────────
      if (thread_id) {
        const ctx: ContextData = { props, staff };
        const MAX_ITERATIONS = 5;
        let loopMessages: unknown[] = [...initialMessages];
        let finalText = "";
        let pendingWriteTool: { name: string; args: Record<string, unknown> } | null = null;

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          // Observation iterations use flash (fast & cheap), final pass uses pro (quality)
          const model = i < MAX_ITERATIONS - 1 ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro";
          const resp = await callLLMSync(loopMessages, RONIN_TOOLS, LOVABLE_API_KEY, model);
          const choice = resp.choices?.[0];
          if (!choice) break;

          const toolCalls = choice.message?.tool_calls ?? [];
          if (!toolCalls.length) {
            // No tool calls — this is the final text response
            finalText = choice.message?.content ?? "";
            break;
          }

          // Add assistant's message (with tool_calls) to loop context
          loopMessages = [...loopMessages, {
            role: "assistant",
            content: choice.message.content ?? null,
            tool_calls: toolCalls,
          }];

          const toolResults: unknown[] = [];
          let hitWriteTool = false;

          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            let toolArgs: Record<string, unknown> = {};
            try { toolArgs = JSON.parse(tc.function.arguments ?? "{}"); } catch { /* */ }

            if (OBSERVATION_TOOL_NAMES.includes(toolName)) {
              // Execute observation tool — feed result back into loop
              const result = await executeObservationTool(toolName, toolArgs, adminClient, ctx);
              toolResults.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });

            } else if (SILENT_TOOL_NAMES.includes(toolName)) {
              // Silent tool — execute immediately, no user feedback
              if (toolName === "add_shopping_list_item") {
                await addShoppingListItemsSilently(toolArgs, callerUserId, adminClient);
              } else {
                await saveMemorySilently(toolArgs, adminClient);
              }
              toolResults.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ saved: true }) });

            } else if (WRITE_TOOL_NAMES.includes(toolName)) {
              // Write tool detected — break loop, build confirmation
              pendingWriteTool = { name: toolName, args: toolArgs };
              toolResults.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ status: "pending_confirmation" }) });
              hitWriteTool = true;
            }
          }

          loopMessages = [...loopMessages, ...toolResults];

          if (hitWriteTool) {
            // Ask LLM to generate the human-readable confirmation text (no tools — force text)
            const confirmResp = await callLLMSync(loopMessages, [], LOVABLE_API_KEY, "google/gemini-2.5-flash");
            finalText = confirmResp.choices?.[0]?.message?.content
              ?? buildConfirmationMessage(pendingWriteTool!.name, pendingWriteTool!.args);
            break;
          }
        }

        // Persist to DB
        if (pendingWriteTool) {
          await adminClient.from("messages").insert({
            thread_id, sender_id: null, is_ai_generated: true,
            content_text: finalText || buildConfirmationMessage(pendingWriteTool.name, pendingWriteTool.args),
            delivery_status: "sent",
            reactions: { __pending_tool: { name: pendingWriteTool.name, args: pendingWriteTool.args } } as unknown as never,
          });
        } else if (finalText) {
          await adminClient.from("messages").insert({
            thread_id, content_text: finalText, sender_id: null, is_ai_generated: true, delivery_status: "sent",
          });
        }
        await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", thread_id);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── No thread_id: use ReAct loop then stream final answer ─────────────
      // Previously this just piped raw streaming output, which meant tool calls
      // (including save_memory) were NEVER executed. Now we run a sync ReAct loop
      // first to handle all tool calls, then stream the final clean response.
      const ctx: ContextData = { props, staff };
      const MAX_ITER = 5;
      let loopMessages: unknown[] = [...initialMessages];
      let precomputedFinal: string | null = null;

      for (let i = 0; i < MAX_ITER; i++) {
        const iterResp = await callLLMSync(loopMessages, RONIN_TOOLS, LOVABLE_API_KEY, "google/gemini-2.5-flash");
        const choice = iterResp.choices?.[0];
        if (!choice) break;

        const toolCalls = choice.message?.tool_calls ?? [];
        if (!toolCalls.length) {
          // No tool calls — use this text as-is only if we're still in early loop
          // For the final stream we'll re-run with pro model below
          break;
        }

        loopMessages = [...loopMessages, {
          role: "assistant",
          content: choice.message.content ?? null,
          tool_calls: toolCalls,
        }];

        const toolResults: unknown[] = [];
        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          let toolArgs: Record<string, unknown> = {};
          try { toolArgs = JSON.parse(tc.function.arguments ?? "{}"); } catch { /* */ }

          if (OBSERVATION_TOOL_NAMES.includes(toolName)) {
            const result = await executeObservationTool(toolName, toolArgs, adminClient, ctx);
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
          } else if (SILENT_TOOL_NAMES.includes(toolName)) {
            // Execute silently
            if (toolName === "add_shopping_list_item") {
              await addShoppingListItemsSilently(toolArgs, callerUserId, adminClient);
            } else {
              await saveMemorySilently(toolArgs, adminClient);
            }
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ saved: true }) });
          } else if (WRITE_TOOL_NAMES.includes(toolName)) {
            // Write tools need confirmation — surface the confirmation as the response
            const confirmResp = await callLLMSync(
              [...loopMessages, { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ status: "pending_confirmation" }) }],
              [], LOVABLE_API_KEY, "google/gemini-2.5-flash"
            );
            precomputedFinal = confirmResp.choices?.[0]?.message?.content ?? buildConfirmationMessage(toolName, toolArgs);
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ status: "pending_confirmation" }) });
          }
        }
        loopMessages = [...loopMessages, ...toolResults];
        if (precomputedFinal) break;
      }

      // If we have a pre-built confirmation message, stream it as a fake SSE response
      if (precomputedFinal) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const words = precomputedFinal!.split(/(?<=\s)/);
            for (const word of words) {
              const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`;
              controller.enqueue(encoder.encode(chunk));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        });
        return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
      }

      // Final answer — stream with pro model using enriched context (all observations done)
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-pro", messages: loopMessages, stream: true }),
      });
      if (!aiResponse.ok) {
        if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI error: ${aiResponse.status} ${await aiResponse.text()}`);
      }
      return new Response(aiResponse.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    return new Response(JSON.stringify({ error: "Unknown request type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ronin-ai error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const statusEmoji: Record<string, string> = { pending: "⏳", in_progress: "🔄", completed: "✅", urgent: "🔴" };
      return `${statusEmoji[args.new_status as string] ?? "📋"} **I'm ready to update the task:**\n\n**Task:** "${args.task_title_hint}"\n**New Status:** ${(args.new_status as string).replace("_", " ")}\n\n**Shall I proceed?**`;
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
