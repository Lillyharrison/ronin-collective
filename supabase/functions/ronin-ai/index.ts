import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────
// Split into: OBSERVATION (auto-execute in loop), WRITE (require confirmation), SILENT (auto, no feedback)
const OBSERVATION_TOOL_NAMES = ["search_tasks", "search_assets", "get_calendar_events", "search_maintenance_issues", "search_vendors"];
const WRITE_TOOL_NAMES = ["create_task", "update_task_status", "log_asset", "send_staff_message", "log_maintenance_issue", "log_vendor"];
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
  {
    type: "function",
    function: {
      name: "search_maintenance_issues",
      description: "Search existing maintenance issues. Use BEFORE logging a new maintenance issue to check for duplicates. Returns current maintenance data.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword matched against issue title or description" },
          status: { type: "string", enum: ["reported", "approved", "assigned", "scheduled", "in_progress", "resolved", "all"] },
          property_name: { type: "string", description: "Filter by property name" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_vendors",
      description: "Search existing vendors/contacts directory. Use BEFORE logging a new vendor to check for duplicates. Returns vendor names, companies, categories, and contacts.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword matched against vendor name, company, or description" },
          category: { type: "string", description: "Filter by category (e.g. cleaning, maintenance, security)" },
        },
        required: [],
      },
    },
  },

  // ── WRITE TOOLS (confirmation required) ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "log_maintenance_issue",
      description: "Log a new maintenance issue in the platform. This is the CORRECT tool to use when a user reports a maintenance problem (broken item, leak, damage, etc.). Use search_maintenance_issues first to avoid duplicates. If an admin/master_admin is approving the issue (not just reporting it), the issue should be logged as 'approved' immediately. If the user attached a photo in this conversation, include its URL in photo_url. IMPORTANT: If the issue was originally reported by someone else in the conversation (not the person clicking approve), pass their name in reported_by_name so they get proper credit.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Clear, concise issue title (e.g. 'Broken lamp in master bedroom')" },
          description: { type: "string", description: "Detailed description of the issue" },
          category: { type: "string", enum: ["Plumbing", "Electrical / Tech", "Climate / HVAC", "Outdoor / Grounds", "Appliances", "Structural", "Security", "General"], description: "Issue category — must match exactly. Use 'General' if unsure." },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level: urgent=safety risk, high=urgent, medium=normal, low=can wait" },
          property_name: { type: "string", description: "Property where the issue is located" },
          location_detail: { type: "string", description: "Specific room or area (e.g. 'Master bedroom', 'Kitchen', 'Pool area')" },
          photo_url: { type: "string", description: "Public URL of the photo attached in the conversation (from content_media_url). Include whenever the user shared an image related to this issue." },
          reported_by_name: { type: "string", description: "Full name of the person who originally reported/described the issue in the conversation. Only set if different from the person executing the approval (e.g. Lynn reported it, Lilly approved it → set this to 'Lynn')." },
        },
        required: ["title", "category", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task or work order. Use search_tasks first to avoid duplicates. For maintenance issues (broken items, damage, repairs) use log_maintenance_issue instead.",
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
      description: "Send a direct message to a staff member. Use only for genuine communications, NOT for logging maintenance issues or creating tasks.",
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
      name: "log_vendor",
      description: "Add a new vendor or service provider to the contacts directory. Use this when the user pastes or describes contact details (name, phone, email, company, website) for a vendor, contractor, service provider, or any business contact. Use search_vendors first to avoid duplicates.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Vendor or primary contact full name" },
          company: { type: "string", description: "Company or business name" },
          phone: { type: "string", description: "Phone number" },
          email: { type: "string", description: "Email address" },
          website: { type: "string", description: "Website URL" },
          category: { type: "string", enum: ["general", "cleaning", "maintenance", "landscaping", "security", "catering", "tech", "transport", "medical", "legal", "construction", "other"], description: "Service category" },
          description: { type: "string", description: "What they do for the estate (max 1-2 sentences)" },
          notes: { type: "string", description: "Any additional notes or context" },
          address: { type: "string", description: "Business address if provided" },
        },
        required: ["name"],
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

/** Strip Gemini thinking/reasoning blocks that should never reach the user */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/^THINK:.*$/gim, "")
    .replace(/^OBSERVE:.*$/gim, "")
    .replace(/^REASON:.*$/gim, "")
    .replace(/^ACT:.*$/gim, "")
    .replace(/^RESPOND:.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Non-streaming LLM call for ReAct loop iterations */
async function callLLMSync(
  messages: unknown[],
  tools: unknown[],
  apiKey: string,
  model = "google/gemini-3-flash-preview"
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

  if (name === "search_maintenance_issues") {
    let q = adminClient.from("maintenance_issues")
      .select("id, title, status, priority, category, created_at, property_id, description");
    if (args.keyword) q = q.or(`title.ilike.%${args.keyword}%,description.ilike.%${args.keyword}%`);
    const s = args.status as string | undefined;
    if (s && s !== "all") q = q.eq("status", s);
    const propId = resolvePropertyId(args.property_name);
    if (propId) q = q.eq("property_id", propId);
    q = q.order("created_at", { ascending: false }).limit(15);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      issues: data?.map(i => ({
        id: i.id, title: i.title, status: i.status, priority: i.priority,
        category: i.category, created_at: i.created_at,
        description: i.description ?? "none",
        property: propNameMap[i.property_id] ?? "unassigned",
      })),
    };
  }

  if (name === "search_vendors") {
    let q = adminClient.from("vendors")
      .select("id, name, company, category, phone, email, website, description, is_active");
    if (args.keyword) {
      const kw = `%${args.keyword}%`;
      q = q.or(`name.ilike.${kw},company.ilike.${kw},description.ilike.${kw}`);
    }
    if (args.category) q = q.eq("category", args.category as string);
    q = q.order("name").limit(20);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      vendors: data?.map((v: Record<string, unknown>) => ({
        name: v.name, company: v.company ?? "—", category: v.category,
        phone: v.phone ?? "—", email: v.email ?? "—", website: v.website ?? "—",
        description: v.description ?? "—", is_active: v.is_active,
      })),
    };
  }

  return { error: `Unknown observation tool: ${name}` };
}

/** Silently save a memory to the knowledge base.
 *  Accepts optional pre-loaded props/staff arrays to avoid redundant DB fetches. */
async function saveMemorySilently(
  args: Record<string, unknown>,
  adminClient: ReturnType<typeof createClient>,
  ctxProps?: Array<Record<string, unknown>>,
  ctxStaff?: Array<Record<string, unknown>>,
): Promise<void> {
  try {
    // Only fetch if no context was passed in
    let props = ctxProps;
    let staff = ctxStaff;
    if (!props || !staff) {
      const [pRes, sRes] = await Promise.all([
        adminClient.from("properties").select("id, name"),
        adminClient.from("profiles").select("id, full_name"),
      ]);
      props = pRes.data ?? [];
      staff = sRes.data ?? [];
    }
    const memPropId = args.property_hint
      ? (props).find((p) => (p.name as string).toLowerCase().includes((args.property_hint as string).toLowerCase()))?.id as string ?? null
      : null;
    const memSubjectId = args.subject_name
      ? (staff).find((s) => ((s.full_name as string) ?? "").toLowerCase().includes((args.subject_name as string).toLowerCase()))?.id as string ?? null
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

/** Notify users with relevant section permissions about an action.
 * Always notifies master_admin/admin.
 * Also notifies any user (manager, staff, principal) whose section_permissions[requiredSection].notifications === true.
 */
async function notifyAdminsOfAIAction(
  adminClient: ReturnType<typeof createClient>,
  title: string,
  body: string,
  type: string,
  action_url: string,
  entity_id?: string,
  entity_type?: string,
  excludeUserId?: string | null,
  requiredSection?: string | null,
): Promise<void> {
  try {
    // Get all master_admin and admin user_ids
    const { data: adminRoles } = await adminClient
      .from("user_roles")
      .select("user_id")
      .in("role", ["master_admin", "admin"]);

    const adminIds = new Set((adminRoles ?? []).map(r => r.user_id as string));

    // Also collect any non-admin user who has notifications toggled on for the section
    let extraIds: string[] = [];
    if (requiredSection) {
      const { data: allProfiles } = await adminClient
        .from("profiles")
        .select("id, section_permissions");
      extraIds = (allProfiles ?? [])
        .filter((p: { id: string; section_permissions: unknown }) => {
          if (adminIds.has(p.id)) return false; // already included
          const perms = p.section_permissions as Record<string, { view?: boolean; notifications?: boolean }> | null;
          return perms?.[requiredSection]?.notifications === true;
        })
        .map((p: { id: string }) => p.id);
    }

    const recipientSet = new Set([...adminIds, ...extraIds]);
    if (excludeUserId) recipientSet.delete(excludeUserId);
    const recipients = [...recipientSet];

    if (!recipients.length) return;

    await adminClient.from("notifications").insert(
      recipients.map(user_id => ({
        user_id,
        title,
        body,
        type,
        action_url,
        entity_id: entity_id ?? null,
        entity_type: entity_type ?? null,
      }))
    );
  } catch (e) {
    console.error("Notification send failed:", e);
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

    // ─── CREATE PROFILE ONLY (no auth invite, for family/contacts without login) ─
    if (action === "create_profile_only") {
      if (!["master_admin", "admin"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { full_name, job_title, level, department, role, start_date, birthday, notes, phone, assigned_property_ids, section_permissions } = body;
      if (!full_name || !level || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields: full_name, level, role" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Use a random UUID — no auth account is created
      const newId = crypto.randomUUID();
      const { error: profErr } = await adminClient.from("profiles").insert({
        id: newId, full_name, job_title: job_title || null, level,
        department: department || null, start_date: start_date || null,
        birthday: birthday || null, notes: notes || null,
        phone: phone || null,
        assigned_property_ids: assigned_property_ids || [],
        section_permissions: section_permissions || null,
      });
      if (profErr) {
        return new Response(JSON.stringify({ error: profErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await adminClient.from("user_roles").insert({ user_id: newId, role });
      return new Response(JSON.stringify({ success: true, user_id: newId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── RESEND INVITATION ────────────────────────────────────────────────────
    if (action === "resend_invitation") {
      if (!["master_admin", "admin"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let emailToInvite: string | null = body.email || null;
      if (!emailToInvite && body.target_user_id) {
        const { data: userData } = await adminClient.auth.admin.getUserById(body.target_user_id);
        emailToInvite = userData?.user?.email ?? null;
      }
      if (!emailToInvite) return new Response(JSON.stringify({ error: "Could not resolve email for this user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/") || "https://id-preview--733ed5ee-915b-45c9-8d99-a2a9c67f228b.lovable.app";
      const redirectTo = body.redirect_url || `${origin}/reset-password`;
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: emailToInvite,
        options: { redirectTo },
      });
      if (linkErr) {
        return new Response(JSON.stringify({ error: linkErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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
    // Any authenticated user can execute a write tool — they are only surfaced after
    // the AI stages them in a thread the user can see. No admin-only restriction here.
    if (action === "execute_tool") {
      if (!callerUserId) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

      const callerName = (callerProfile?.full_name as string) ?? "A team member";
      let resultMessage = "";

      // ── log_maintenance_issue ─────────────────────────────────────────────
      if (tool_name === "log_maintenance_issue") {
        const propId = resolvePropertyId(tool_args.property_name);
        // Find the most recent image sent in this thread (before this message) to attach
        let resolvedPhotoUrl: string | null = tool_args.photo_url ?? null;
        if (!resolvedPhotoUrl && ctx.threadId) {
          const { data: recentMedia } = await adminClient
            .from("messages")
            .select("content_media_url")
            .eq("thread_id", ctx.threadId)
            .eq("media_type", "image")
            .not("content_media_url", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          if (recentMedia?.content_media_url) resolvedPhotoUrl = recentMedia.content_media_url;
        }

        // Resolve the original reporter — could be someone else in the thread
        let reportedById: string = callerUserId!;
        if (tool_args.reported_by_name) {
          const resolvedId = resolveStaffId(tool_args.reported_by_name);
          if (resolvedId) reportedById = resolvedId;
        }

        // If the person approving is admin/master_admin, log straight to 'approved'
        const isCallerAdmin = callerRole === "master_admin" || callerRole === "admin";
        const issueStatus = isCallerAdmin ? "approved" : "reported";

        const { data: issue, error: issueErr } = await adminClient.from("maintenance_issues").insert({
          title: tool_args.title,
          description: tool_args.description ?? null,
          category: tool_args.category,
          priority: tool_args.priority,
          status: issueStatus,
          source: "ai_chat",
          reported_by: reportedById,
          property_id: propId,
          location_detail: tool_args.location_detail ?? null,
          photo_url: resolvedPhotoUrl,
        }).select("id").single();

        if (issueErr) throw new Error(`Failed to log maintenance issue: ${issueErr.message}`);

        // Log system event
        await adminClient.from("system_events").insert({
          event_type: "maintenance_reported_by_ai",
          entity_type: "maintenance_issue",
          entity_id: issue.id,
          triggered_by: callerUserId,
          property_id: propId,
          payload: tool_args,
          processed_by_ai: true,
        });

        const priorityEmoji: Record<string, string> = { urgent: "🔴", high: "🟠", medium: "🟡", low: "🟢" };
        const propLabel = tool_args.property_name ? ` @ ${tool_args.property_name}` : "";
        const locationLabel = tool_args.location_detail ? ` — ${tool_args.location_detail}` : "";
        const reporterName = tool_args.reported_by_name ?? callerName;
        const statusLabel = issueStatus === "approved" ? "**Approved** — now visible in the active workflow." : "**Reported** — awaiting admin approval. Visible in the Maintenance section.";
        resultMessage = `✅ **Maintenance issue logged.**\n\n**${tool_args.title}**${propLabel}${locationLabel}\nReported by: ${reporterName} | Priority: ${priorityEmoji[tool_args.priority as string] ?? "🟡"} ${tool_args.priority} | Category: ${tool_args.category}\n\nStatus: ${statusLabel}`;

        // Notify all admins + managers with maintenance permissions
        const notifTitle = issueStatus === "approved"
          ? `🔧 Maintenance issue approved: "${tool_args.title}"`
          : `🔧 New maintenance issue reported`;
        const notifBody = issueStatus === "approved"
          ? `${reporterName} reported via Ronin AI and ${callerName} approved: "${tool_args.title}"${propLabel}. Now active in the workflow.`
          : `${reporterName} reported via Ronin AI: "${tool_args.title}"${propLabel}. Awaiting your approval.`;
        await notifyAdminsOfAIAction(
          adminClient,
          notifTitle,
          notifBody,
          issueStatus === "approved" ? "success" : "warning",
          "maintenance",
          issue.id,
          "maintenance_issue",
          null,
          "maintenance",
        );

      // ── create_task ───────────────────────────────────────────────────────
      } else if (tool_name === "create_task") {
        const { data: task, error: taskErr } = await adminClient.from("tasks").insert({
          title_en: tool_args.title_en,
          description_en: tool_args.description_en ?? null,
          category: tool_args.category,
          priority: tool_args.priority,
          status: tool_args.priority === 1 ? "urgent" : "pending",
          assigned_to: resolveStaffId(tool_args.assigned_to_name),
          property_id: resolvePropertyId(tool_args.property_name),
          due_date: tool_args.due_date ?? null,
          created_by: callerUserId,
        }).select("id").single();

        if (taskErr) throw new Error(`Failed to create task: ${taskErr.message}`);
        await adminClient.from("system_events").insert({ event_type: "task_created_by_ai", entity_type: "task", entity_id: task.id, triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
        const priorityLabel = tool_args.priority === 1 ? "🔴 Urgent" : tool_args.priority === 2 ? "🟡 Normal" : "🟢 Low";
        resultMessage = `✅ **Task created.**\n\n**${tool_args.title_en}**${tool_args.assigned_to_name ? ` — ${tool_args.assigned_to_name}` : ""}${tool_args.property_name ? ` @ ${tool_args.property_name}` : ""}\nPriority: ${priorityLabel} | Category: ${tool_args.category}\n\nVisible in the Tasks section.`;

        // Notify admins
        await notifyAdminsOfAIAction(
          adminClient,
          `📋 Task created by Ronin AI`,
          `${callerName} asked Ronin to create: "${tool_args.title_en}"${tool_args.property_name ? ` @ ${tool_args.property_name}` : ""}.`,
          "task",
          "tasks",
          task.id,
          "task",
          callerUserId,
        );

      // ── update_task_status ────────────────────────────────────────────────
      } else if (tool_name === "update_task_status") {
        const { data: tasks } = await adminClient.from("tasks").select("id, title_en").ilike("title_en", `%${tool_args.task_title_hint}%`).limit(1);
        if (!tasks?.length) {
          resultMessage = `⚠️ No task matching **"${tool_args.task_title_hint}"** found.`;
        } else {
          await adminClient.from("tasks").update({ status: tool_args.new_status, completed_at: tool_args.new_status === "completed" ? new Date().toISOString() : null }).eq("id", tasks[0].id);
          await adminClient.from("system_events").insert({ event_type: "task_status_updated_by_ai", entity_type: "task", entity_id: tasks[0].id, triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
          const statusEmoji: Record<string, string> = { pending: "⏳", in_progress: "🔄", completed: "✅", urgent: "🔴" };
          resultMessage = `${statusEmoji[tool_args.new_status] ?? "📋"} **Task updated.**\n\n**${tasks[0].title_en}** → **${(tool_args.new_status as string).replace("_", " ")}**`;
        }

      // ── log_asset ─────────────────────────────────────────────────────────
      } else if (tool_name === "log_asset") {
        const { data: asset, error: assetErr } = await adminClient.from("assets").insert({
          name: tool_args.name, category: tool_args.category,
          make: tool_args.make ?? null, model: tool_args.model ?? null,
          serial_number: tool_args.serial_number ?? null,
          description: tool_args.description ?? null,
          current_property_id: resolvePropertyId(tool_args.property_name),
          purchase_value: tool_args.purchase_value ?? null,
        }).select("id").single();

        if (assetErr) throw new Error(`Failed to log asset: ${assetErr.message}`);
        await adminClient.from("system_events").insert({ event_type: "asset_logged_by_ai", entity_type: "asset", entity_id: asset.id, triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
        const makeModel = [tool_args.make, tool_args.model].filter(Boolean).join(" ");
        resultMessage = `✅ **Asset logged.**\n\n**${tool_args.name}**${makeModel ? ` (${makeModel})` : ""}${tool_args.property_name ? ` @ ${tool_args.property_name}` : ""}\nCategory: ${tool_args.category}\n\nVisible in Inventory.`;

        // Notify admins
        await notifyAdminsOfAIAction(
          adminClient,
          `📦 Asset logged by Ronin AI`,
          `${callerName} asked Ronin to log asset: "${tool_args.name}"${tool_args.property_name ? ` @ ${tool_args.property_name}` : ""}.`,
          "info",
          "inventory",
          asset.id,
          "asset",
          callerUserId,
        );

      // ── send_staff_message ────────────────────────────────────────────────
      } else if (tool_name === "send_staff_message") {
        const recipientId = resolveStaffId(tool_args.recipient_name);
        if (!recipientId) {
          resultMessage = `⚠️ Staff member **"${tool_args.recipient_name}"** not found.`;
        } else {
          // Find or create DM thread between caller and recipient
          const { data: existingThreads } = await adminClient.from("chat_threads").select("id, participant_ids").eq("type", "private");
          let dmThreadId: string | null = null;
          for (const t of existingThreads ?? []) {
            const participants = t.participant_ids as string[];
            if (participants.includes(callerUserId!) && participants.includes(recipientId)) { dmThreadId = t.id; break; }
          }
          if (!dmThreadId) {
            const { data: newThread } = await adminClient.from("chat_threads").insert({
              type: "private",
              participant_ids: [callerUserId, recipientId],
              created_by: callerUserId,
            }).select("id").single();
            dmThreadId = newThread?.id ?? null;
          }
          if (dmThreadId) {
            // Message appears from the AI (sender_id null, is_ai_generated true) so recipient knows it's from Ronin
            await adminClient.from("messages").insert({
              thread_id: dmThreadId,
              sender_id: null,
              content_text: `**Ronin AI (on behalf of ${callerName}):** ${tool_args.message_text}`,
              is_ai_generated: true,
              delivery_status: "sent",
            });
            await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", dmThreadId);

            // Notify the recipient
            await adminClient.from("notifications").insert({
              user_id: recipientId,
              title: `📨 Message from Ronin AI`,
              body: `${callerName} asked Ronin to send you a message. Check your DMs.`,
              type: "message",
              action_url: "messages",
            });
          }
          await adminClient.from("system_events").insert({ event_type: "message_sent_by_ai", entity_type: "message", triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
          resultMessage = `✅ **Message sent to ${tool_args.recipient_name}.**\n\n> "${tool_args.message_text}"\n\nVisible in their Messages.`;
        }

      } else if (tool_name === "save_memory") {
        await saveMemorySilently(tool_args, adminClient);
        resultMessage = `🧠 **Memory saved.**`;
      } else if (tool_name === "add_shopping_list_item") {
        resultMessage = await addShoppingListItemsSilently(tool_args, callerUserId, adminClient);
      } else if (tool_name === "log_vendor") {
        const { data: vendor, error: vendorErr } = await adminClient.from("vendors").insert({
          name: tool_args.name,
          company: tool_args.company ?? null,
          phone: tool_args.phone ?? null,
          email: tool_args.email ?? null,
          website: tool_args.website ?? null,
          category: tool_args.category ?? "general",
          description: tool_args.description ?? null,
          notes: tool_args.notes ?? null,
          address: tool_args.address ?? null,
          is_active: true,
          created_by: callerUserId,
        }).select("id").single();

        if (vendorErr) throw new Error(`Failed to log vendor: ${vendorErr.message}`);
        await adminClient.from("system_events").insert({ event_type: "vendor_logged_by_ai", entity_type: "vendor", entity_id: vendor.id, triggered_by: callerUserId, payload: tool_args, processed_by_ai: true });
        const details = [tool_args.company, tool_args.phone, tool_args.email].filter(Boolean).join(" · ");
        resultMessage = `✅ **Vendor saved.**\n\n**${tool_args.name}**${tool_args.company ? ` — ${tool_args.company}` : ""}\nCategory: ${tool_args.category ?? "general"}${details ? `\n${details}` : ""}${tool_args.description ? `\n\n_${tool_args.description}_` : ""}\n\nVisible in the **Vendors** section.`;
      } else {
        resultMessage = `⚠️ Unknown tool: ${tool_name}`;
      }

      // Clear __pending_tool from the original AI message so confirm buttons disappear
      if (thread_id) {
        const { data: pendingMsg } = await adminClient
          .from("messages")
          .select("id, reactions")
          .eq("thread_id", thread_id)
          .eq("is_ai_generated", true)
          .not("reactions->__pending_tool", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (pendingMsg) {
          const updatedReactions = { ...(pendingMsg.reactions as Record<string, unknown>) };
          delete updatedReactions.__pending_tool;
          await adminClient.from("messages").update({ reactions: updatedReactions }).eq("id", pendingMsg.id);
        }
      }

      // Post result back to chat
      if (thread_id && resultMessage) {
        await adminClient.from("messages").insert({
          thread_id,
          sender_id: null,
          is_ai_generated: true,
          content_text: resultMessage,
          delivery_status: "sent",
        });
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
- **NEVER output your internal reasoning, thinking steps, THINK/OBSERVE/REASON/ACT/RESPOND tags, or chain-of-thought in your final reply.** Your reasoning is internal only. Only the clean, final answer reaches the user.

## DISCRETION FRAMEWORK (NEVER VIOLATE)
1. NEVER share Principal travel, financial, or personal data with staff/manager/admin roles.
2. Staff only receive information about their assigned properties.
3. NEVER fabricate platform data (tasks, assets, people, events). For platform-specific questions, only report what is in LIVE PLATFORM DATA. If absent, say so.
4. For general knowledge questions (wine, food, etiquette, hospitality, travel, lifestyle, recommendations) — use your extensive LLM training knowledge freely and confidently.
5. ALWAYS check your LONG-TERM MEMORY first — if a preference has been saved, lead with that personalised insight.
6. Always confirm before write operations.

## CALLER CONTEXT
- **User ID**: ${callerUserId ?? "anonymous"}
- **Name**: ${(callerProfile?.full_name as string) ?? "Unknown"}
- **System Role**: ${callerRole}
- **Assigned Properties**: ${callerProperties.length ? callerProperties.join(", ") : "none (or all, if admin)"}
- **Active Property Context**: ${property_id ?? "none selected"}

## REASONING APPROACH — ReAct Pattern (MANDATORY)
You operate in a multi-step reasoning loop. BEFORE taking any write action or answering a data question, you MUST:
1. **Think**: What information do I need?
2. **Observe**: Call observation tool(s) to gather current data.
3. **Reason**: Decide the best course of action.
4. **Act or Respond**: Call a write tool (with confirmation) or give a data-informed response.

### OBSERVATION TOOLS — call without asking permission:
- **search_tasks**: Before creating any task, ALWAYS search first.
- **search_maintenance_issues**: Before logging any maintenance issue, ALWAYS search first to check for duplicates.
- **search_assets**: Before logging any asset, ALWAYS search first.
- **search_vendors**: Before logging a new vendor, ALWAYS search first to check for duplicates.
- **get_calendar_events**: Use for schedule/property activity questions.

### WRITE TOOLS — present confirmation before executing:
- **log_maintenance_issue**: Use THIS (not create_task, not send_staff_message) when someone reports a broken item, damage, leak, or any physical property problem. It creates a proper maintenance work order. Category must be one of: Plumbing, Electrical / Tech, Climate / HVAC, Outdoor / Grounds, Appliances, Structural, Security, General. Priority: urgent/high/medium/low.
  - **REPORTER CREDIT**: If the issue was described by someone else in the conversation (e.g. Lynn said "the curtain rail is broken" and Lilly is approving it), set `reported_by_name` to the original reporter's name (e.g. "Lynn"). Do NOT credit the approver.
  - **AUTO-APPROVE**: If the caller is a master_admin or admin, the issue is logged as 'approved' immediately — no second approval step needed. State this clearly in your confirmation message.
- **create_task**: Use for operational work orders that are NOT physical maintenance issues.
- **log_vendor**: Use when the user shares contact details for a vendor, contractor, service provider, or any business contact. Even from a phone screenshot, pasted vCard, or described verbally. Extract all available fields.
- **update_task_status**, **log_asset**, **send_staff_message**

### SILENT TOOLS — execute without asking:
- **save_memory**: **MANDATORY — ZERO EXCEPTIONS** — You MUST silently call this tool in the SAME response whenever:
  - A user shares a preference, like/dislike, habit, dietary restriction, allergy, or personal fact about anyone
  - A user mentions how something should be done at a property (SOP, procedure, standard)
  - A user corrects you, or tells you to remember something for next time
  - You learn something operationally significant, recurring, or worth personalising future responses with
  - **THE RULE: If you respond with ANY acknowledgement ("noted", "I'll remember", "got it", "understood", "of course") you have ALREADY called save_memory in the same turn. No exceptions. No delays. No "I'll save that." Just save it silently and confirm verbally.**
  - Never announce or describe the tool call to the user. Execute silently, then respond naturally.
  - After saving, always say something like "✓ Noted and saved to my memory." so the user knows it's locked in.
- **add_shopping_list_item**: Use immediately when someone mentions buying something.

## VENDOR PROTOCOL
When a user pastes or describes a contact (phone number, email, name, company):
1. Use **search_vendors** to check for existing match.
2. Extract all available details: name, company, phone, email, website, address.
3. Infer the **category** from context (e.g. "plumber" → maintenance, "chef" → catering).
4. Infer **description** from context — what they do for the estate.
5. Present details and ask **"Shall I proceed?"**

## MAINTENANCE ISSUE PROTOCOL (CRITICAL)
When anyone reports a physical problem with a property (broken item, damage, leak, noise, malfunction):
1. Use **search_maintenance_issues** to check for duplicates.
2. Use **log_maintenance_issue** — NOT create_task, NOT send_staff_message.
3. Present the details (title, category, priority, property, location) and ask **"Shall I proceed?"**
4. **STOP. Do NOT say the issue has been logged, reported, submitted, or entered into the workflow** — that only happens AFTER the user clicks Approve or confirms.
5. Once confirmed, the platform automatically notifies admins. You do NOT need to message anyone separately.

## CONFIRMATION-FIRST PROTOCOL (for write tools)
**CRITICAL — READ CAREFULLY:**
1. Present a clear summary of what you are about to do.
2. List exact parameters (title, category, priority, property, location).
3. End ONLY with: **"Shall I proceed?"**
4. **NEVER say the action has been completed, logged, reported, or submitted at this stage.** The action has NOT happened yet — it is only staged for user approval. Do NOT write "issue has been reported", "I have logged", "has been submitted", etc.
5. Wait for the user to confirm before saying anything is done.

## CAPABILITIES
- Full read access: Properties, Tasks, Team, Assets, Events, Memories, Maintenance Issues, Vendors.
- Bilingual (EN/ES). Write actions: log maintenance issues, create tasks, update task status, log assets, log vendors, send messages, save memories, add to shopping list.`;

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
      // Build clean conversation history — strip any leaked reasoning patterns and limit to recent messages
      const cleanHistory = (msgs: Array<{ id: string; content_text: string | null; is_ai_generated: boolean }>) =>
        msgs
          .filter(m => m.content_text && m.content_text.trim().length > 0)
          .map(m => ({
            role: m.is_ai_generated ? "assistant" as const : "user" as const,
            // Strip leaked thinking prefixes from stored AI messages
            content: m.is_ai_generated
              ? m.content_text!
                  .replace(/^(THINK|OBSERVE|REASON|ACT|RESPOND)[:\s].*/gim, "")
                  .replace(/<think>[\s\S]*?<\/think>/gi, "")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim()
              : m.content_text!,
          }))
          .filter(m => m.content.length > 0)
          .slice(-20); // keep last 20 messages

      const { messages: conversationHistory = [], image_url } = body;

      const isVisionRequest = !!image_url;

      // ── Load full platform snapshot + memories in parallel ─────────────────
      const [propsRes, tasksRes, staffRes, rolesRes, assetsRes, eventsRes, memoriesRes, maintenanceRes] = await Promise.all([
        adminClient.from("properties").select("id, name, address, city, country, status, is_primary, occupied_by, timezone").order("sort_order"),
        adminClient.from("tasks").select("id, title_en, status, priority, category, due_date, assigned_to, property_id").in("status", ["pending", "in_progress", "urgent"]).order("priority").limit(50),
        adminClient.from("profiles").select("id, full_name, job_title, department, level, assigned_property_ids, phone, notes"),
        adminClient.from("user_roles").select("user_id, role"),
        adminClient.from("assets").select("id, name, category, make, model, serial_number, current_property_id").limit(50),
        adminClient.from("system_events").select("event_type, entity_type, created_at, payload").order("created_at", { ascending: false }).limit(15),
        adminClient.from("ronin_memories").select("id, summary, content, category, importance, tags, property_id, subject_user_id").order("importance", { ascending: false }).order("last_referenced_at", { ascending: false, nullsFirst: false }).limit(20),
        adminClient.from("maintenance_issues").select("id, title, status, priority, category, created_at, property_id").in("status", ["reported", "approved", "assigned", "scheduled", "in_progress"]).order("created_at", { ascending: false }).limit(20),
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

      const maintenanceIssues = maintenanceRes.data ?? [];
      if (maintenanceIssues.length > 0) {
        contextSections.push(`OPEN MAINTENANCE ISSUES (${maintenanceIssues.length}):\n${maintenanceIssues.map((i: Record<string, unknown>) => `  - [${i.status}] ${i.title} | ${i.priority} priority | ${i.category} | Property: ${propNameMap[i.property_id as string] ?? "unassigned"}`).join("\n")}`);
      }

      const assets = assetsRes.data ?? [];
      if (assets.length > 0) contextSections.push(`ASSETS (${assets.length}):\n${assets.map((a: Record<string, unknown>) => `  - ${a.name} | ${a.category} | ${a.make ?? ""} ${a.model ?? ""} | Property: ${propNameMap[a.current_property_id as string] ?? "unassigned"}`).join("\n")}`);

      const events = eventsRes.data ?? [];
      if (events.length > 0) contextSections.push(`RECENT EVENTS:\n${events.map((e: Record<string, unknown>) => `  - [${e.event_type}] ${e.entity_type ?? ""} @ ${e.created_at}`).join("\n")}`);

      const memories = memoriesRes.data ?? [];
      if (memories.length > 0) {
        contextSections.push(`RONIN'S LONG-TERM MEMORY (${memories.length} entries — personalise every response using these):\n${memories.map((m: Record<string, unknown>) => `  - ${"⭐".repeat(m.importance as number)} [${m.category}]${m.property_id ? ` [${propNameMap[m.property_id as string] ?? ""}]` : ""}${m.subject_user_id ? ` [About: ${staffNameMap[m.subject_user_id as string] ?? ""}]` : ""}: ${m.content}`).join("\n")}`);
        adminClient.from("ronin_memories").update({ last_referenced_at: new Date().toISOString() }).in("id", memories.map((m: Record<string, unknown>) => m.id as string)).then(() => {/**/});
      } else {
        contextSections.push("RONIN'S LONG-TERM MEMORY: Empty. Use save_memory to build your knowledge base as you learn.");
      }

      const contextNote = "\n\n=== LIVE PLATFORM DATA ===\n" + contextSections.join("\n\n") + "\n=== END LIVE DATA ===";

      const visionAddition = isVisionRequest ? `

## VISION MODE — ACTIVE
Analyse the photo carefully:
1. If you see damage, a broken item, or a maintenance issue → use search_maintenance_issues then log_maintenance_issue.
2. If you see an asset/inventory item → use search_assets then log_asset.
3. Structure your analysis clearly.
4. Ask only for critical missing info (property, location) before calling a write tool.` : "";

      type MsgContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      const currentUserMessage: { role: string; content: MsgContent } = isVisionRequest
        ? { role: "user", content: [{ type: "text", text: content || "Please analyse this image." }, { type: "image_url", image_url: { url: image_url } }] }
        : { role: "user", content };

      const baseSystemMsg = { role: "system", content: systemPrompt + visionAddition + contextNote };

      // ── ReAct Loop (thread_id: non-streaming, synchronous) ─────────────────
      if (thread_id) {
        // Load conversation history directly from DB when thread_id is provided
        // This avoids client-supplied history contaminating the context with leaked thinking
        const { data: dbMessages } = await adminClient
          .from("messages")
          .select("id, content_text, is_ai_generated, sender_id")
          .eq("thread_id", thread_id)
          .order("created_at", { ascending: true })
          .limit(25); // Reduced from 30 — context window efficiency

        const dbHistory = cleanHistory(
          (dbMessages ?? []).filter(m => m.content_text && m.id !== undefined)
        );

        const initialMessages: unknown[] = [baseSystemMsg, ...dbHistory, currentUserMessage];
        const ctx: ContextData = { props, staff };
        const MAX_ITERATIONS = 4; // Reduced: most flows need 1-2 iterations max
        let loopMessages: unknown[] = [...initialMessages];
        let finalText = "";
        let pendingWriteTool: { name: string; args: Record<string, unknown> } | null = null;

        // Use gemini-flash for the ReAct tool-calling loop — it's 3-5x faster and handles
        // tool calls just as well. GPT-5 is reserved for complex reasoning only.
        const LOOP_MODEL = "google/gemini-3-flash-preview";

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const resp = await callLLMSync(loopMessages, RONIN_TOOLS, LOVABLE_API_KEY, LOOP_MODEL);
          const choice = resp.choices?.[0];
          if (!choice) break;

          const toolCalls = choice.message?.tool_calls ?? [];
          if (!toolCalls.length) {
            finalText = stripThinking(choice.message?.content ?? "");
            break;
          }

          loopMessages = [...loopMessages, {
            role: "assistant",
            content: choice.message.content ?? null,
            tool_calls: toolCalls,
          }];

          const toolResults: unknown[] = [];
          let hitWriteTool = false;

          // Execute all tool calls in parallel where possible
          const toolPromises = toolCalls.map(async (tc) => {
            const toolName = tc.function.name;
            let toolArgs: Record<string, unknown> = {};
            try { toolArgs = JSON.parse(tc.function.arguments ?? "{}"); } catch { /* */ }

            if (OBSERVATION_TOOL_NAMES.includes(toolName)) {
              const result = await executeObservationTool(toolName, toolArgs, adminClient, ctx);
              return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) };

            } else if (SILENT_TOOL_NAMES.includes(toolName)) {
              // Pass pre-loaded context to avoid redundant DB fetches
              if (toolName === "add_shopping_list_item") {
                await addShoppingListItemsSilently(toolArgs, callerUserId, adminClient);
              } else {
                await saveMemorySilently(toolArgs, adminClient, props, staff);
              }
              return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ saved: true }) };

            } else if (WRITE_TOOL_NAMES.includes(toolName)) {
              pendingWriteTool = { name: toolName, args: toolArgs };
              hitWriteTool = true;
              return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ status: "pending_confirmation" }) };
            }
            return null;
          });

          const results = await Promise.all(toolPromises);
          for (const r of results) { if (r) toolResults.push(r); }

          loopMessages = [...loopMessages, ...toolResults];

          if (hitWriteTool) {
            // Use the deterministic builder — no extra LLM round-trip needed for confirmations
            finalText = buildConfirmationMessage(pendingWriteTool!.name, pendingWriteTool!.args);
            break;
          }
        }

        // Persist to DB
        if (pendingWriteTool) {
          await adminClient.from("messages").insert({
            thread_id, sender_id: null, is_ai_generated: true,
            content_text: stripThinking(finalText || buildConfirmationMessage(pendingWriteTool.name, pendingWriteTool.args)),
            delivery_status: "sent",
            reactions: { __pending_tool: { name: pendingWriteTool.name, args: pendingWriteTool.args } } as unknown as never,
          });
        } else if (finalText) {
          await adminClient.from("messages").insert({
            thread_id, content_text: stripThinking(finalText), sender_id: null, is_ai_generated: true, delivery_status: "sent",
          });
        }
        await adminClient.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", thread_id);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── No thread_id: sync ReAct loop then stream final answer ──────────────
      // Build initial messages for the streaming path from client-supplied history (cleaned)
      const cleanedClientHistory = cleanHistory(
        (conversationHistory as Array<{ content_text: string | null; is_ai_generated: boolean }>).map((m, i) => ({
          id: String(i),
          content_text: typeof m === "object" && "content" in m ? (m as { content: string }).content : m.content_text,
          is_ai_generated: typeof m === "object" && "role" in m ? (m as { role: string }).role === "assistant" : m.is_ai_generated,
        }))
      );
      const streamInitialMessages: unknown[] = [baseSystemMsg, ...cleanedClientHistory, currentUserMessage];
      const ctx: ContextData = { props, staff };
      const MAX_ITER = 4;
      let loopMessages: unknown[] = [...streamInitialMessages];
      let precomputedFinal: string | null = null;

      for (let i = 0; i < MAX_ITER; i++) {
        const iterResp = await callLLMSync(loopMessages, RONIN_TOOLS, LOVABLE_API_KEY, "google/gemini-3-flash-preview");
        const choice = iterResp.choices?.[0];
        if (!choice) break;

        const toolCalls = choice.message?.tool_calls ?? [];
        if (!toolCalls.length) { break; }

        loopMessages = [...loopMessages, {
          role: "assistant",
          content: choice.message.content ?? null,
          tool_calls: toolCalls,
        }];

        // Execute all tool calls in parallel
        const toolPromises = toolCalls.map(async (tc) => {
          const toolName = tc.function.name;
          let toolArgs: Record<string, unknown> = {};
          try { toolArgs = JSON.parse(tc.function.arguments ?? "{}"); } catch { /* */ }

          if (OBSERVATION_TOOL_NAMES.includes(toolName)) {
            const result = await executeObservationTool(toolName, toolArgs, adminClient, ctx);
            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result), isPending: false };
          } else if (SILENT_TOOL_NAMES.includes(toolName)) {
            if (toolName === "add_shopping_list_item") {
              await addShoppingListItemsSilently(toolArgs, callerUserId, adminClient);
            } else {
              // Pass pre-loaded context — no redundant DB queries
              await saveMemorySilently(toolArgs, adminClient, props, staff);
            }
            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ saved: true }), isPending: false };
          } else if (WRITE_TOOL_NAMES.includes(toolName)) {
            // Use deterministic builder — no extra LLM round-trip
            precomputedFinal = buildConfirmationMessage(toolName, toolArgs);
            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ status: "pending_confirmation" }), isPending: true };
          }
          return null;
        });

        const results = await Promise.all(toolPromises);
        for (const r of results) { if (r) loopMessages = [...loopMessages, { role: r.role, tool_call_id: r.tool_call_id, content: r.content }]; }
        if (precomputedFinal) break;
      }

      if (precomputedFinal) {
        const cleaned = stripThinking(precomputedFinal);
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const words = cleaned.split(/(?<=\s)/);
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

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: loopMessages, stream: true }),
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
    case "log_maintenance_issue": {
      const priorityEmoji: Record<string, string> = { urgent: "🔴", high: "🟠", medium: "🟡", low: "🟢" };
      return [
        `🔧 **I'm ready to log the following maintenance issue:**`, ``,
        `**Title:** ${args.title}`,
        args.description ? `**Description:** ${args.description}` : null,
        `**Category:** ${args.category}`,
        `**Priority:** ${priorityEmoji[args.priority as string] ?? "🟡"} ${args.priority}`,
        args.property_name ? `**Property:** ${args.property_name}` : null,
        args.location_detail ? `**Location:** ${args.location_detail}` : null,
        ``, `This will appear in the **Maintenance** section as **Reported**, awaiting admin approval.`,
        ``, `**Shall I proceed?**`,
      ].filter(l => l !== null).join("\n");
    }
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
