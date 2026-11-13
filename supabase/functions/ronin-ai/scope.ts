// Caller-scoped assistant helpers. Every query here runs on `userDb`
// (anon key + the caller's JWT), so the database's row rules decide what exists.
import { describeEventWhen } from "../_shared/eventTime.ts";

/** Identical wording whether the house doesn't exist or the caller isn't assigned to it. */
export const NO_HOUSE_MESSAGE = "I can't find that house in your access";

// deno-lint-ignore no-explicit-any
type Db = any;
type House = { id: string; name: string };

const normalize = (s: string) => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

/** Match a house name against the caller's accessible houses only. */
export function resolveHouse(props: House[], hint?: unknown): string | null {
  if (typeof hint !== "string" || !hint.trim()) return null;
  const needle = normalize(hint);
  let match = props.find(p => normalize(p.name) === needle);
  if (!match) match = props.find(p => { const hay = normalize(p.name); return hay.includes(needle) || needle.includes(hay); });
  if (!match) { const words = needle.split(" ").filter(Boolean); match = props.find(p => words.every(w => normalize(p.name).includes(w))); }
  return match?.id ?? null;
}

/** none = no house asked for; found = accessible house; missing = not found in caller's access. */
export function lookupHouse(props: House[], hint?: unknown): { kind: "none" } | { kind: "found"; id: string } | { kind: "missing" } {
  if (typeof hint !== "string" || !hint.trim()) return { kind: "none" };
  const id = resolveHouse(props, hint);
  return id ? { kind: "found", id } : { kind: "missing" };
}

export const ADMIN_PEOPLE_COLUMNS = "id, full_name, job_title, department, level, assigned_property_ids, phone, notes";
export const LIMITED_PEOPLE_COLUMNS = "id, full_name, job_title, department, avatar_url";
export const peopleColumns = (isAdmin: boolean) => isAdmin ? ADMIN_PEOPLE_COLUMNS : LIMITED_PEOPLE_COLUMNS;
export const memoriesAllowed = (isAdmin: boolean) => isAdmin;

/** Account administration: needs adminDb (auth admin API), so is gated here first. */
export const ADMIN_ACTIONS = new Set(["invite_user", "create_profile_only", "save_draft_user", "resend_invitation", "csv_import"]);
export const MASTER_ACTIONS = new Set(["send_password_reset", "delete_user"]);
export function canRunAction(action: string, who: { isAdmin: boolean; isMaster: boolean }): boolean {
  if (MASTER_ACTIONS.has(action)) return who.isMaster;
  if (ADMIN_ACTIONS.has(action)) return who.isAdmin;
  return true;
}

/** Tools only admins may be offered / run. */
export const ADMIN_ONLY_TOOLS = new Set(["save_memory", "update_occupancy"]);
export function toolsFor<T extends { function: { name: string } }>(tools: T[], isAdmin: boolean): T[] {
  return isAdmin ? tools : tools.filter(t => !ADMIN_ONLY_TOOLS.has(t.function.name));
}

/** Load the model's live context through the caller's own access. Memories only for admins. */
export async function loadAssistantContext(userDb: Db, isAdmin: boolean) {
  const [propsRes, tasksRes, staffRes, rolesRes, assetsRes, eventsRes, memoriesRes, maintenanceRes] = await Promise.all([
    userDb.from("properties").select("id, name, address, city, country, status, is_primary, occupied_by, timezone").order("sort_order").limit(200),
    userDb.from("tasks").select("id, title_en, status, priority, category, due_date, assigned_to, property_id").in("status", ["pending", "in_progress", "urgent"]).order("priority").limit(50),
    userDb.from("profiles").select(peopleColumns(isAdmin)).eq("is_archived", false).limit(300),
    isAdmin ? userDb.from("user_roles").select("user_id, role").limit(500) : Promise.resolve({ data: [] }),
    userDb.from("assets").select("id, name, category, make, model, serial_number, current_property_id").limit(50),
    isAdmin ? userDb.from("system_events").select("event_type, entity_type, created_at, payload").order("created_at", { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
    memoriesAllowed(isAdmin)
      ? userDb.from("ronin_memories").select("id, summary, content, category, importance, tags, property_id, subject_user_id").order("importance", { ascending: false }).order("last_referenced_at", { ascending: false, nullsFirst: false }).limit(20)
      : Promise.resolve({ data: [] }),
    userDb.from("maintenance_issues").select("id, title, status, priority, category, created_at, property_id").in("status", ["reported", "approved", "scheduled", "in_progress"]).order("created_at", { ascending: false }).limit(20),
  ]);
  return {
    props: (propsRes.data ?? []) as Array<Record<string, unknown>>,
    tasks: (tasksRes.data ?? []) as Array<Record<string, unknown>>,
    staff: (staffRes.data ?? []) as Array<Record<string, unknown>>,
    roles: (rolesRes.data ?? []) as Array<{ user_id: string; role: string }>,
    assets: (assetsRes.data ?? []) as Array<Record<string, unknown>>,
    events: (eventsRes.data ?? []) as Array<Record<string, unknown>>,
    memories: (memoriesRes.data ?? []) as Array<Record<string, unknown>>,
    maintenance: (maintenanceRes.data ?? []) as Array<Record<string, unknown>>,
  };
}

export type ContextData = { props: Array<Record<string, unknown>>; staff: Array<Record<string, unknown>> };

const noHouse = () => ({ total: 0, message: NO_HOUSE_MESSAGE });

/** Read-only tools, run under the caller's access. */
export async function executeObservationTool(name: string, args: Record<string, unknown>, userDb: Db, ctx: ContextData): Promise<unknown> {
  const houses = ctx.props as unknown as House[];
  const propNameMap = Object.fromEntries(ctx.props.map(p => [p.id as string, p.name as string]));
  const staffNameMap = Object.fromEntries(ctx.staff.map(s => [s.id as string, (s.full_name as string) ?? "Unknown"]));
  const house = lookupHouse(houses, args.property_name);
  const houseBound = ["search_tasks", "search_assets", "get_calendar_events", "search_maintenance_issues", "search_planned_maintenance"].includes(name);
  if (houseBound && house.kind === "missing") return noHouse();
  const propId = house.kind === "found" ? house.id : null;

  if (name === "search_tasks") {
    let q = userDb.from("tasks").select("id, title_en, status, priority, category, due_date, assigned_to, property_id");
    const s = args.status as string | undefined;
    if (s && s !== "all") q = q.eq("status", s);
    if (args.keyword) q = q.ilike("title_en", `%${args.keyword}%`);
    if (propId) q = q.eq("property_id", propId);
    if (args.assignee_name) {
      const lower = String(args.assignee_name).toLowerCase();
      const match = ctx.staff.find(p => String(p.full_name ?? "").toLowerCase().includes(lower));
      if (match) q = q.eq("assigned_to", match.id as string);
    }
    const { data, error } = await q.order("priority").limit(Math.min((args.limit as number) ?? 10, 25));
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      tasks: (data ?? []).map((t: Record<string, string>) => ({
        id: t.id, title: t.title_en, status: t.status, priority: t.priority, category: t.category, due_date: t.due_date ?? "none",
        assigned_to: staffNameMap[t.assigned_to] ?? (t.assigned_to ? "someone" : "unassigned"),
        property: propNameMap[t.property_id] ?? "unassigned",
      })),
    };
  }

  if (name === "search_assets") {
    let q = userDb.from("assets").select("id, name, category, make, model, serial_number, current_property_id");
    if (args.keyword) { const kw = `%${args.keyword}%`; q = q.or(`name.ilike.${kw},make.ilike.${kw},model.ilike.${kw}`); }
    if (args.category && args.category !== "all") q = q.eq("category", args.category);
    if (propId) q = q.eq("current_property_id", propId);
    const { data, error } = await q.limit(15);
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      assets: (data ?? []).map((a: Record<string, string>) => ({
        name: a.name, category: a.category, make: a.make, model: a.model, serial_number: a.serial_number,
        property: propNameMap[a.current_property_id] ?? "unassigned",
      })),
    };
  }

  if (name === "get_calendar_events") {
    const future = new Date(); future.setDate(future.getDate() + ((args.days_ahead as number) ?? 30));
    let q = userDb.from("calendar_events").select("id, title, event_type, start_date, end_date, all_day, property_id, description, status, location")
      .gte("start_date", new Date().toISOString()).lte("start_date", future.toISOString()).order("start_date").limit(15);
    if (propId) q = q.eq("property_id", propId);
    if (args.event_type) q = q.eq("event_type", args.event_type as string);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      events: (data ?? []).map((e: Record<string, unknown>) => ({
        title: e.title, type: e.event_type, start: e.start_date, end: e.end_date, all_day: e.all_day,
        when: describeEventWhen(e as never, null), property: propNameMap[e.property_id as string] ?? "N/A",
        description: e.description, status: e.status, location: e.location,
      })),
    };
  }

  if (name === "search_maintenance_issues") {
    let q = userDb.from("maintenance_issues").select("id, title, status, priority, category, created_at, property_id, description");
    if (args.keyword) q = q.or(`title.ilike.%${args.keyword}%,description.ilike.%${args.keyword}%`);
    const s = args.status as string | undefined;
    if (s && s !== "all") q = q.eq("status", s);
    if (propId) q = q.eq("property_id", propId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(15);
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      issues: (data ?? []).map((i: Record<string, string>) => ({
        id: i.id, title: i.title, status: i.status, priority: i.priority, category: i.category, created_at: i.created_at,
        description: i.description ?? "none", property: propNameMap[i.property_id] ?? "unassigned",
      })),
    };
  }

  if (name === "search_planned_maintenance") {
    let q = userDb.from("planned_maintenance").select("id, title, description, status, property_id, last_service_date, date_type, scheduled_date, scheduled_month, scheduled_year, recurrence_months, vendors(name)");
    if (args.keyword) q = q.or(`title.ilike.%${args.keyword}%,description.ilike.%${args.keyword}%`);
    if (propId) q = q.eq("property_id", propId);
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(25);
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      // deno-lint-ignore no-explicit-any
      items: (data ?? []).map((i: any) => ({
        title: i.title, status: i.status, description: i.description ?? "none", property: propNameMap[i.property_id] ?? "unassigned",
        last_serviced: i.last_service_date ?? "no record",
        next_due: i.scheduled_date ?? (i.scheduled_month ? `${i.scheduled_year}-${String(i.scheduled_month).padStart(2, "0")}` : "not set"),
        repeats_every_months: i.recurrence_months, vendor: i.vendors?.name ?? "none",
      })),
    };
  }

  if (name === "search_vendors") {
    let q = userDb.from("vendors").select("id, name, company, category, phone, email, website, description, is_active");
    if (args.keyword) { const kw = `%${args.keyword}%`; q = q.or(`name.ilike.${kw},company.ilike.${kw},description.ilike.${kw}`); }
    if (args.category) q = q.eq("category", args.category as string);
    const { data, error } = await q.order("name").limit(20);
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      vendors: (data ?? []).map((v: Record<string, unknown>) => ({
        name: v.name, company: v.company ?? "—", category: v.category, phone: v.phone ?? "—", email: v.email ?? "—",
        website: v.website ?? "—", description: v.description ?? "—", is_active: v.is_active,
      })),
    };
  }

  if (name === "search_product") {
    const query = String(args.query ?? "");
    const encoded = encodeURIComponent(query);
    const isGrocery = ["grocery", "household", "cleaning"].includes((args.category as string) ?? "general");
    return {
      query, category: (args.category as string) ?? "general",
      retailers: [
        { name: "Amazon", search_url: `https://www.amazon.com/s?k=${encoded}`, icon: "🛒", note: "Wide selection, Prime delivery" },
        { name: "Walmart", search_url: `https://www.walmart.com/search?q=${encoded}`, icon: "🏬", note: "In-store pickup or delivery" },
        ...(isGrocery ? [{ name: "Instacart", search_url: `https://www.instacart.com/store/search_v3/search?search_term=${encoded}`, icon: "🥬", note: "Same-day grocery delivery" }] : []),
      ],
      instruction: "Present each retailer link on its own line with the full URL visible so the user can tap it. Use this format: **Amazon**: <url> — note. Do NOT hide URLs behind markdown link syntax.",
    };
  }

  if (name === "search_library_item") {
    const keyword = String(args.keyword ?? "").trim();
    if (!keyword) return { error: "keyword is required" };
    const cols = "id, name, category, status, notes, default_quantity, size, purchase, website_url, image_url, substitutions_allowed, search_aliases";
    const kw = `%${keyword}%`;
    let q = userDb.from("order_library_items").select(cols).or(`name.ilike.${kw},notes.ilike.${kw}`);
    const status = (args.status as string) ?? "preferred";
    if (status !== "all") q = q.eq("status", status);
    if (args.category) q = q.eq("category", args.category as string);
    const { data, error } = await q.order("status", { ascending: true }).order("name", { ascending: true }).limit(15);
    if (error) return { error: error.message };
    const { data: aliasHits } = await userDb.from("order_library_items").select(cols).contains("search_aliases", [keyword.toLowerCase()]).limit(10);
    const seen = new Set<string>();
    const merged = [...(data ?? []), ...(aliasHits ?? [])].filter((r: Record<string, unknown>) => { const id = r.id as string; if (seen.has(id)) return false; seen.add(id); return true; });
    return {
      total: merged.length,
      items: merged.map((i: Record<string, unknown>) => ({
        id: i.id, name: i.name, category: i.category, status: i.status, notes: i.notes ?? null, default_quantity: i.default_quantity ?? null,
        size: i.size ?? null, purchase: i.purchase ?? null, website_url: i.website_url ?? null, image_url: i.image_url ?? null, substitutions_allowed: i.substitutions_allowed,
      })),
      hint: merged.length === 0 ? "No library match — proceed with the user's described item." : "If one of these is a clear match, pass its `id` as `library_item_id` in add_shopping_list_item.",
    };
  }

  return { error: `Unknown observation tool: ${name}` };
}
