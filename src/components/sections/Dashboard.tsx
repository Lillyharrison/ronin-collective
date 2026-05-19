import { useEffect, useState, useRef, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import type { ActiveSection } from "@/contexts/NavigationContext";
import {
  Clock, ShoppingBag, TriangleAlert, CheckSquare,
  Activity, Zap, Shield, ClipboardList, X, Bell,
  Pencil, Check, ExternalLink, MapPin, Car, CalendarClock,
} from "lucide-react";
import { useActiveRulesForDashboard } from "@/hooks/usePropertyRules";
import { cn } from "@/lib/utils";

import { IssueModal } from "@/components/maintenance/IssueModal";
import { useMaintenanceIssues } from "@/hooks/useMaintenanceIssues";

interface FeedEvent {
  id: string;
  event_type: string;
  entity_type: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  property_id: string | null;
  propertyName?: string;
}

interface DashNotification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  created_at: string;
  action_url: string | null;
  entity_id: string | null;
  entity_type: string | null;
  user_id?: string;
}

interface PrincipalLocation {
  name: string;
  propertyName: string;
  propertyId: string;
}

const SECTION_DEEP_LINK: Partial<Record<string, ActiveSection>> = {
  maintenance_issue: "maintenance",
  task:              "tasks",
  order:             "orders",
  calendar_event:    "calendar",
  message:           "messages",
  property_rule:     "rules",
  checklist:         "checklists",
};

// Quick actions shown to all users, filtered by per-user canSee permissions
const ALL_QUICK_ACTIONS_DASHBOARD = [
  { key: "checklists",  labelKey: "checklists" as const,   labelEs: "Listas",            icon: <ClipboardList size={26} />, section: "checklists" as const },
  { key: "orders",      labelKey: "orders" as const,       labelEs: "Pedidos",           icon: <ShoppingBag size={26} />,  section: "orders" as const },
  { key: "reportIssue", labelKey: "reportIssue" as const,  labelEs: "Reportar Problema", icon: <TriangleAlert size={26} />,section: "maintenance" as const },
  { key: "calendar",    labelKey: "calendar" as const,     labelEs: "Calendario",        icon: <Clock size={26} />,        section: "calendar" as const },
  { key: "staffSchedule", labelKey: "staffSchedule" as const, labelEs: "Horario del Personal", icon: <CalendarClock size={26} />, section: "staff-schedule" as const },
  { key: "tasks",       labelKey: "tasks" as const,        labelEs: "Tareas",            icon: <CheckSquare size={26} />,  section: "tasks" as const },
  { key: "maintenance", labelKey: "maintenance" as const,  labelEs: "Mantenimiento",     icon: <Zap size={26} />,          section: "maintenance" as const },
  { key: "messages",    labelKey: "messages" as const,     labelEs: "Mensajes",          icon: <Activity size={26} />,     section: "messages" as const },
  { key: "inventory",   labelKey: "inventory" as const,    labelEs: "Inventario",        icon: <ShoppingBag size={26} />,  section: "inventory" as const },
  { key: "carWash",     labelKey: "carWash" as const,      labelEs: "Lavado de Autos",   icon: <Car size={26} />,          section: "car-wash" as const },
];

const TYPE_STYLES: Record<string, { dot: string; border: string }> = {
  success: { dot: "bg-[hsl(var(--status-done))]",     border: "border-l-[hsl(var(--status-done))]" },
  warning: { dot: "bg-[hsl(var(--status-urgent))]",   border: "border-l-[hsl(var(--status-urgent))]" },
  alert:   { dot: "bg-[hsl(var(--status-urgent))]",   border: "border-l-[hsl(var(--status-urgent))]" },
  task:    { dot: "bg-[hsl(var(--gold))]",            border: "border-l-[hsl(var(--gold))]" },
  message: { dot: "bg-accent",                         border: "border-l-accent" },
  ai:      { dot: "bg-purple-400",                     border: "border-l-purple-400" },
  info:    { dot: "bg-muted-foreground",               border: "border-l-muted-foreground" },
};

function getGreeting(language: string) {
  const hour = new Date().getHours();
  if (hour < 12) return language === "es" ? "Buenos días" : "Good Morning";
  if (hour < 18) return language === "es" ? "Buenas tardes" : "Good Afternoon";
  return language === "es" ? "Buenas noches" : "Good Evening";
}

function formatDate(language: string) {
  return new Date().toLocaleDateString(language === "es" ? "es-ES" : "en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

/** Returns a smart tagline based on the current date (holidays, etc.) */
function getSmartTagline(language: string): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based
  const day = now.getDate();

  // Holiday detection
  if (month === 12 && day >= 24 && day <= 26) return language === "es" ? "¡Feliz Navidad! 🎄" : "Merry Christmas! 🎄";
  if (month === 12 && (day === 31 || day === 30)) return language === "es" ? "¡Feliz Año Nuevo! 🥂" : "Happy New Year's Eve! 🥂";
  if (month === 1 && day === 1) return language === "es" ? "¡Feliz Año Nuevo! 🎉" : "Happy New Year! 🎉";
  if (month === 2 && day === 14) return language === "es" ? "Feliz Día de San Valentín ❤️" : "Happy Valentine's Day ❤️";
  if (month === 10 && day === 31) return language === "es" ? "¡Feliz Halloween! 🎃" : "Happy Halloween! 🎃";
  if (month === 4 && day === 1) return language === "es" ? "¡Cuidado hoy! 😄" : "April Fools — watch out! 😄";
  if (month === 3 && day === 17) return language === "es" ? "¡Feliz Día de San Patricio! 🍀" : "Happy St. Patrick's Day! 🍀";
  if (month === 12 && day >= 1 && day <= 23) return language === "es" ? "La temporada navideña está aquí 🎅" : "The festive season is here 🎅";

  return language === "es" ? "Que tengas un gran día" : "Have a great day";
}

interface TaglineOverride {
  text: string;
  expiresAt: string | null; // ISO date string or null (permanent until cleared)
}

function friendlyEventLabel(event: FeedEvent, language: string): string {
  const type = event.event_type;
  const prop = event.propertyName ?? "—";
  const map: Record<string, [string, string]> = {
    task_created:   ["Task created",              "Tarea creada"],
    task_completed: ["Task completed",             "Tarea completada"],
    task_updated:   ["Task updated",              "Tarea actualizada"],
    csv_import:     ["Tasks imported via CSV",    "Tareas importadas por CSV"],
    user_invited:   ["New team member invited",   "Nuevo miembro invitado"],
    issue_reported: ["Issue reported",            "Problema reportado"],
  };
  const [en, es] = map[type] ?? [type, type];
  const label = language === "es" ? es : en;
  return prop !== "—" ? `${label} — ${prop}` : label;
}

function eventDotColor(eventType: string): string {
  if (eventType.includes("completed")) return "bg-status-done";
  if (eventType.includes("urgent") || eventType.includes("issue")) return "bg-status-urgent";
  if (eventType.includes("import") || eventType.includes("invited")) return "bg-gold";
  return "bg-muted-foreground";
}

export function Dashboard() {
  const { language, t } = useLanguage();
  const { setActiveSection, setPendingMaintenanceIssueId } = useNavigation();
  const { isMasterAdmin, isAdmin, userId, fullName, canSee, assignedPropertyIds, loading: permLoading } = usePermissions();
  const activeRules = useActiveRulesForDashboard(assignedPropertyIds, isMasterAdmin);
  const { categories: maintenanceCategories, createIssue } = useMaintenanceIssues();

  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [userQuickActions, setUserQuickActions] = useState<string[] | null>(null);
  const [qaLoading, setQaLoading] = useState(true);
  const [principalLocation, setPrincipalLocation] = useState<PrincipalLocation | null | undefined>(undefined);

  // Notifications widget on dashboard (unread)
  const [dashNotifs, setDashNotifs] = useState<DashNotification[]>([]);

  // Smart tagline — loaded from DB (shared across all users)
  const [taglineOverride, setTaglineOverride] = useState<TaglineOverride | null>(null);
  const [editingTagline, setEditingTagline] = useState(false);
  const [taglineDraft, setTaglineDraft] = useState("");
  const [taglineDuration, setTaglineDuration] = useState<"today" | "date" | "permanent">("today");
  const [taglineEndDate, setTaglineEndDate] = useState("");
  const taglineInputRef = useRef<HTMLInputElement>(null);

  // ── Single batched load: all dashboard data in one Promise.all ───────────────
  // This replaces 6 separate useEffects that each fired independently, causing
  // a waterfall of sequential or near-simultaneous DB hits on every dashboard open.
  const loadDashNotifs = useCallback(async () => {
    if (!userId || permLoading) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, type, created_at, action_url, entity_id, entity_type, user_id")
      .eq("user_id", userId)
      .not("acknowledged_by", "cs", `{${userId}}`)
      .order("created_at", { ascending: false })
      .limit(10);
    setDashNotifs((data as DashNotification[]) ?? []);
  }, [userId, permLoading]);

  useEffect(() => {
    if (!userId || permLoading) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = supabase as any;

    Promise.all([
      // 1. Pending tasks (count only — very fast HEAD request)
      // Admins see all active tasks; others see only their assignments
      (() => {
        let q = supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "in_progress", "urgent"])
          .eq("is_draft", false);
        if (!isAdmin && !isMasterAdmin) {
          q = q.eq("assigned_to", userId);
        }
        return q;
      })(),

      // 2. Quick action prefs from profile
      supabase
        .from("profiles")
        .select("quick_actions")
        .eq("id", userId)
        .maybeSingle(),

      // 3. Dashboard notifications (unread)
      supabase
        .from("notifications")
        .select("id, title, body, type, created_at, action_url, entity_id, entity_type, user_id")
        .eq("user_id", userId)
        .not("acknowledged_by", "cs", `{${userId}}`)
        .order("created_at", { ascending: false })
        .limit(10),

      // 4. Tagline override
      supa.from("system_settings")
        .select("value")
        .eq("key", "dashboard_tagline")
        .maybeSingle(),

      // 5. Principal user_id setting
      supa.from("system_settings")
        .select("value")
        .eq("key", "principal_user_id")
        .maybeSingle(),

      // 6. Activity feed (admins only — null result ignored below)
      isAdmin
        ? supabase
            .from("system_events")
            .select("id, event_type, entity_type, payload, created_at, property_id")
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: null }),
    ]).then(async ([
      { count: taskCount },
      { data: profileData },
      { data: notifsData },
      { data: taglineSetting },
      { data: principalSetting },
      { data: eventsData },
    ]) => {
      // 1. Pending count
      setPendingCount(taskCount ?? 0);

      // 2. Quick actions
      const qa = (profileData as { quick_actions?: string[] } | null)?.quick_actions;
      if (Array.isArray(qa) && qa.length > 0) setUserQuickActions(qa);
      setQaLoading(false);

      // 3. Notifications
      setDashNotifs((notifsData as DashNotification[]) ?? []);

      // 4. Tagline
      if (taglineSetting?.value) {
        const v = taglineSetting.value as TaglineOverride;
        if (v.expiresAt && new Date(v.expiresAt) < new Date()) {
          supa.from("system_settings").delete().eq("key", "dashboard_tagline");
        } else {
          setTaglineOverride(v);
        }
      }

      // 5 + principal location (needs follow-up queries but we run them in parallel too)
      let principalUserId: string | null = (principalSetting?.value as string) ?? null;
      if (!principalUserId) {
        const { data: roleData } = await supabase
          .from("user_roles").select("user_id").eq("role", "principal").limit(1).maybeSingle();
        principalUserId = roleData?.user_id ?? null;
      }
      if (principalUserId) {
        const [{ data: principalProfile }, { data: occupiedProps }] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", principalUserId).maybeSingle(),
          supabase.from("properties").select("id, name, occupied_by_profile_ids")
            .contains("occupied_by_profile_ids", [principalUserId]),
        ]);
        const firstName = principalProfile?.full_name?.split(" ")[0] ?? "Principal";
        const visibleOccupied = (isAdmin || isMasterAdmin)
          ? (occupiedProps ?? [])
          : (occupiedProps ?? []).filter(p => assignedPropertyIds.includes(p.id));
        const prop = visibleOccupied[0];
        setPrincipalLocation(prop ? { name: firstName, propertyName: prop.name, propertyId: prop.id } : null);
      } else {
        setPrincipalLocation(null);
      }

      // 6. Activity feed
      if (eventsData) {
        const canSeeAllProps = isAdmin || isMasterAdmin;
        // Scope feed to events on properties the user has visibility into (events with no property stay visible).
        const scopedEvents = canSeeAllProps
          ? eventsData
          : eventsData.filter((e: { property_id: string | null }) =>
              !e.property_id || assignedPropertyIds.includes(e.property_id));
        const propIds = [...new Set(scopedEvents.map((e: { property_id: string | null }) => e.property_id).filter(Boolean))] as string[];
        let propNames: Record<string, string> = {};
        if (propIds.length) {
          const { data: props } = await supabase.from("properties").select("id, name").in("id", propIds);
          (props ?? []).forEach((p: { id: string; name: string }) => { propNames[p.id] = p.name; });
        }
        setFeedEvents(scopedEvents.map((e: FeedEvent) => ({
          ...e,
          payload: e.payload as Record<string, unknown> | null,
          propertyName: e.property_id ? propNames[e.property_id] : undefined,
        })));
      }
      setFeedLoading(false);
    });
  }, [userId, isAdmin, permLoading]);

  // Realtime: refresh dashboard notifications when new ones arrive
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("dash-notifs")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, () => loadDashNotifs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadDashNotifs]);

  const greeting = getGreeting(language);
  const dateStr = formatDate(language);
  const smartTagline = taglineOverride ? taglineOverride.text : getSmartTagline(language);

  const dismissNotif = async (id: string, notifUserId?: string) => {
    await supabase.rpc("acknowledge_notification", { _notif_id: id });
    if (notifUserId === userId) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    }
    setDashNotifs(prev => prev.filter(n => n.id !== id));
  };

  const handleNotifClick = async (n: DashNotification) => {
    await dismissNotif(n.id, n.user_id);
    const targetSection: ActiveSection | undefined =
      (n.entity_type ? SECTION_DEEP_LINK[n.entity_type] : undefined) ??
      (n.action_url as ActiveSection | undefined);
    if (n.entity_type === "maintenance_issue" && n.entity_id) {
      setPendingMaintenanceIssueId(n.entity_id);
    }
    if (targetSection) setActiveSection(targetSection);
  };

  const saveTaglineOverride = async () => {
    if (!taglineDraft.trim()) {
      // Clear override
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("system_settings").delete().eq("key", "dashboard_tagline");
      setTaglineOverride(null);
      setEditingTagline(false);
      return;
    }
    let expiresAt: string | null = null;
    if (taglineDuration === "today") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      expiresAt = tomorrow.toISOString();
    } else if (taglineDuration === "date" && taglineEndDate) {
      expiresAt = new Date(taglineEndDate + "T23:59:59").toISOString();
    }
    const override: TaglineOverride = { text: taglineDraft, expiresAt };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("system_settings").upsert({ key: "dashboard_tagline", value: override, updated_at: new Date().toISOString() });
    setTaglineOverride(override);
    setEditingTagline(false);
  };

  const startEditTagline = () => {
    setTaglineDraft(taglineOverride?.text ?? smartTagline);
    setTaglineDuration("today");
    setTaglineEndDate("");
    setEditingTagline(true);
    setTimeout(() => taglineInputRef.current?.focus(), 50);
  };

  const clearTaglineOverride = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("system_settings").delete().eq("key", "dashboard_tagline");
    setTaglineOverride(null);
  };

  return (
    <div className="animate-fade-in pb-4">
      {/* Quick-log Report Issue modal — triggered from dashboard quick action */}
      {reportIssueOpen && (
        <IssueModal
          open={reportIssueOpen}
          onClose={() => setReportIssueOpen(false)}
          onSave={async (payload) => {
            if (!userId) return;
            await createIssue({ ...payload, reported_by: userId } as Parameters<typeof createIssue>[0]);
          }}
          categories={maintenanceCategories}
          properties={[]}
          profiles={[]}
          mode="create"
        />
      )}

      {/* Greeting banner */}
      <div className="bg-charcoal px-5 pt-6 pb-5 border-b border-charcoal-light">
        <p className="text-cream/50 text-xs tracking-widest uppercase mb-1">{dateStr}</p>
        <h1 className="font-display text-3xl text-cream leading-tight">
          {fullName ? <>{greeting}, <span className="text-gold">{fullName.split(" ")[0]}</span></> : greeting}
        </h1>

        {/* Smart tagline — editable inline for master admin */}
        {editingTagline ? (
          <div className="mt-2 space-y-2">
            <input
              ref={taglineInputRef}
              value={taglineDraft}
              onChange={e => setTaglineDraft(e.target.value)}
              placeholder="Type a message…"
              className="w-full bg-charcoal-light border border-gold/30 rounded-lg px-3 py-2 text-cream text-sm outline-none focus:border-gold/60"
              onKeyDown={e => { if (e.key === "Enter") saveTaglineOverride(); if (e.key === "Escape") setEditingTagline(false); }}
            />
            <div className="flex gap-2 flex-wrap">
              {[
                { value: "today" as const,    label: "Today only" },
                { value: "date" as const,     label: "Until date" },
                { value: "permanent" as const,label: "Until I clear it" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTaglineDuration(opt.value)}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors",
                    taglineDuration === opt.value
                      ? "bg-gold/20 border-gold/50 text-gold"
                      : "border-charcoal-light text-cream/50 hover:border-gold/30"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {taglineDuration === "date" && (
              <input
                type="date"
                value={taglineEndDate}
                onChange={e => setTaglineEndDate(e.target.value)}
                className="bg-charcoal-light border border-gold/30 rounded-lg px-3 py-1.5 text-cream text-xs outline-none focus:border-gold/60"
              />
            )}
            <div className="flex gap-2">
              <button onClick={saveTaglineOverride} className="flex items-center gap-1 px-3 py-1.5 bg-gold/20 border border-gold/40 rounded-lg text-gold text-xs font-semibold hover:bg-gold/30 transition-colors">
                <Check size={12} /> Save
              </button>
              <button onClick={() => setEditingTagline(false)} className="flex items-center gap-1 px-3 py-1.5 border border-charcoal-light rounded-lg text-cream/50 text-xs hover:border-gold/30 transition-colors">
                <X size={12} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1 group">
            <p className="text-cream/40 text-xs tracking-wide">{smartTagline}</p>
            {isMasterAdmin && (
              <button
                onClick={startEditTagline}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gold/50 hover:text-gold"
                title="Edit message"
              >
                <Pencil size={10} />
              </button>
            )}
            {isMasterAdmin && taglineOverride && (
              <button onClick={clearTaglineOverride} className="opacity-0 group-hover:opacity-100 transition-opacity text-cream/30 hover:text-cream/70" title="Clear override">
                <X size={10} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Today's Snapshot */}
      <div className="mx-4 mt-4 rounded-xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {language === "es" ? "Resumen de Hoy" : "Today's Snapshot"}
          </span>
          <Activity size={14} className="text-gold" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setActiveSection("tasks")}
            className="rounded-lg bg-[hsl(var(--status-done)/0.08)] border border-[hsl(var(--status-done)/0.2)] px-3 py-2.5 text-left hover:bg-[hsl(var(--status-done)/0.14)] transition-colors active:scale-95"
          >
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare size={14} className="text-status-done" />
              <span className="text-[10px] uppercase tracking-wider text-status-done font-semibold">
                {language === "es" ? "Pendientes" : "My Tasks"}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {pendingCount === null ? "—" : pendingCount === 0
                ? (language === "es" ? "Al día" : "All clear")
                : `${pendingCount} ${language === "es" ? "activas" : "active"}`}
            </p>
          </button>
          {/* Alerts tile — replaces Properties, navigates to Manuals > Rules */}
          <button
    onClick={() => setActiveSection("alerts")}
            className="rounded-lg bg-[hsl(var(--status-urgent)/0.08)] border border-[hsl(var(--status-urgent)/0.25)] px-3 py-2.5 text-left hover:bg-[hsl(var(--status-urgent)/0.14)] transition-colors active:scale-95"
          >
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className="text-[hsl(var(--status-urgent))]" />
              <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--status-urgent))] font-semibold">
                {language === "es" ? "Alertas" : "Alerts"}
              </span>
              {activeRules.length > 0 && (
                <span className="ml-auto text-[9px] font-bold bg-[hsl(var(--status-urgent))] text-white px-1.5 py-0.5 rounded-full">
                  {activeRules.length}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {activeRules.length === 0
                ? (language === "es" ? "Sin alertas" : "No alerts")
                : `${activeRules.length} ${language === "es" ? "activa(s)" : "active"}`}
            </p>
            {activeRules.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {activeRules[0].icon} {activeRules[0].title}
                {activeRules.length > 1 ? ` +${activeRules.length - 1}` : ""}
              </p>
            )}
          </button>
        </div>

        {/* Principal location tile — full width below the 2-col grid */}
        {canSee("principal-location") && principalLocation !== undefined && (
          <div className="mt-3">
            {principalLocation === null ? (
              <div className="rounded-lg bg-muted/30 border border-border px-3 py-2.5 flex items-center gap-2">
                <MapPin size={13} className="text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {language === "es" ? "Ubicación del principal no disponible" : "Principal location unknown"}
                </span>
              </div>
            ) : (
              <div className="rounded-lg bg-[hsl(var(--gold)/0.08)] border border-[hsl(var(--gold)/0.25)] px-3 py-2.5 flex items-center gap-2.5">
                <MapPin size={14} className="text-gold flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    <span className="text-gold">{principalLocation.name}</span>
                    {" "}
                    <span className="text-muted-foreground font-normal">
                      {language === "es" ? "está en" : "is at"}
                    </span>
                    {" "}
                    {principalLocation.propertyName}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        {canSee("principal-location") && principalLocation === undefined && (
          <div className="mt-3 rounded-lg bg-muted/20 border border-border h-9 animate-pulse" />
        )}

      </div>


      {/* Notifications widget — always visible, shows "all clear" when empty */}
      <div className="mx-4 mt-4 rounded-xl bg-card border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell size={13} className="text-[hsl(var(--gold))]" />
            <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {language === "es" ? "Notificaciones" : "Notifications"}
            </span>
            {dashNotifs.length > 0 && (
              <span className="text-[10px] bg-status-urgent text-white font-bold px-1.5 py-0.5 rounded-full">
                {dashNotifs.length}
              </span>
            )}
          </div>
          {dashNotifs.length > 0 && (
            <button
              onClick={() => dashNotifs.forEach(n => dismissNotif(n.id, n.user_id))}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {language === "es" ? "Limpiar todas" : "Clear all"}
            </button>
          )}
        </div>
        {dashNotifs.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-4">
            <span className="text-base">✅</span>
            <span className="text-xs text-muted-foreground">
              {language === "es" ? "Todo despejado" : "All clear — no new notifications"}
            </span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dashNotifs.map(n => {
              const styles = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
              const isClickable = !!(n.action_url || (n.entity_type && SECTION_DEEP_LINK[n.entity_type]));
              return (
                <div
                  key={n.id}
                  onClick={isClickable ? () => handleNotifClick(n) : undefined}
                  role={isClickable ? "button" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2 border-l-2 group",
                    styles.border,
                    isClickable ? "cursor-pointer hover:bg-muted/40 active:scale-[0.99] transition-colors" : ""
                  )}
                >
                  <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", styles.dot)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground leading-snug truncate">{n.title}</p>
                    <p className="text-[10px] text-muted-foreground leading-none mt-0.5 truncate">
                      {n.body ? `${n.body} · ` : ""}Added {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissNotif(n.id, n.user_id); }}
                    className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5"
                    aria-label="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          {language === "es" ? "Acciones Rápidas" : "Quick Actions"}
        </p>
        {/* Wait until user prefs are loaded to avoid flashing unfiltered actions */}
        {(permLoading || qaLoading) ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 min-h-[88px] animate-pulse" />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-3">
          {ALL_QUICK_ACTIONS_DASHBOARD
            .filter(a => {
              if (!isMasterAdmin && !canSee(a.section)) return false;
              // If user has saved prefs, respect them; otherwise show defaults filtered by canSee
              if (userQuickActions !== null) return userQuickActions.includes(a.key);
              // Default: show first 4 that user can see
              return true;
            })
            .map((action) => (
            <button
              key={action.key}
              onClick={() => {
                if (action.key === "reportIssue") {
                  setReportIssueOpen(true);
                } else {
                  setActiveSection(action.section);
                }
              }}
              className="flex flex-col items-center justify-center gap-2 bg-card border border-border rounded-xl p-4 min-h-[88px] hover:border-gold/40 hover:bg-gold/5 transition-all active:scale-95"
            >
              <span className="text-gold">{action.icon}</span>
              <span className="text-xs font-medium text-foreground text-center leading-tight">
                {language === "es" ? action.labelEs : t(action.labelKey)}
              </span>
            </button>
          ))}
        </div>
        )}
      </div>


      {/* Global Feed — admin only */}
      {isAdmin && (
        <div className="mx-4 mt-6 rounded-xl bg-charcoal border border-charcoal-light overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-charcoal-light">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-done animate-pulse" />
              <span className="text-cream text-xs font-semibold tracking-widest uppercase">
                {language === "es" ? "Feed Global" : "Global Feed"}
              </span>
            </div>
            <span className="text-cream/30 text-[10px] flex items-center gap-1">
              <Zap size={10} /> {language === "es" ? "En vivo" : "Live"}
            </span>
          </div>

          {feedLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-charcoal-light animate-pulse" />)}
            </div>
          ) : feedEvents.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-cream/30 text-xs">{language === "es" ? "Sin actividad aún" : "No activity yet"}</p>
            </div>
          ) : (
            <div className="divide-y divide-charcoal-light">
              {feedEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${eventDotColor(event.event_type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-cream/80 text-xs truncate">{friendlyEventLabel(event, language)}</p>
                    <p className="text-cream/30 text-[10px] mt-0.5">
                      {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
