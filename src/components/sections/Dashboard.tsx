import { useEffect, useState, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin, Clock, CheckSquare, TriangleAlert,
  UserCheck, ChevronRight, Activity, Zap, Shield, ClipboardList, X, Bell,
  Pencil, Check,
} from "lucide-react";
import { useActiveRulesForDashboard } from "@/hooks/usePropertyRules";
import { cn } from "@/lib/utils";

interface Property {
  id: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  status: "occupied" | "vacant" | "maintenance" | "under_construction";
  image_url: string | null;
}

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
}

const statusConfig: Record<string, { label: string; labelEs: string; className: string }> = {
  occupied:           { label: "Occupied",          labelEs: "Ocupado",           className: "status-done" },
  vacant:             { label: "Vacant",            labelEs: "Vacante",           className: "status-vacant" },
  maintenance:        { label: "Maintenance",       labelEs: "Mantenimiento",     className: "status-pending" },
  under_construction: { label: "Under Construction",labelEs: "En Construcción",   className: "status-pending" },
};

// Quick actions shown to all users, filtered by per-user canSee permissions
const quickActions = [
  { labelKey: "checklists" as const,   labelEs: "Listas",            icon: <ClipboardList size={26} />, section: "checklists" as const },
  { labelKey: "myTasks" as const,      labelEs: "Mis Tareas",        icon: <CheckSquare size={26} />,  section: "tasks" as const },
  { labelKey: "reportIssue" as const,  labelEs: "Reportar Problema", icon: <TriangleAlert size={26} />,section: "maintenance" as const },
  { labelKey: "calendar" as const,     labelEs: "Calendario",        icon: <Clock size={26} />,        section: "calendar" as const },
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

// localStorage key for admin tagline override
const TAGLINE_STORAGE_KEY = "ronin_dashboard_tagline";

interface TaglineOverride {
  text: string;
  expiresAt: string | null; // ISO date string or null (permanent until cleared)
}

function loadTaglineOverride(): TaglineOverride | null {
  try {
    const raw = localStorage.getItem(TAGLINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: TaglineOverride = JSON.parse(raw);
    if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
      localStorage.removeItem(TAGLINE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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
  const { setActiveSection, setTargetPropertyId } = useNavigation();
  const { isMasterAdmin, isAdmin, userId, fullName, canSee, assignedPropertyIds, loading: permLoading } = usePermissions();
  const activeRules = useActiveRulesForDashboard(assignedPropertyIds);

  const [properties, setProperties] = useState<Property[]>([]);
  const [propLoading, setPropLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Notifications widget on dashboard (unread)
  const [dashNotifs, setDashNotifs] = useState<DashNotification[]>([]);

  // Smart tagline
  const [taglineOverride, setTaglineOverride] = useState<TaglineOverride | null>(loadTaglineOverride);
  const [editingTagline, setEditingTagline] = useState(false);
  const [taglineDraft, setTaglineDraft] = useState("");
  const [taglineDuration, setTaglineDuration] = useState<"today" | "date" | "permanent">("today");
  const [taglineEndDate, setTaglineEndDate] = useState("");
  const taglineInputRef = useRef<HTMLInputElement>(null);

  // Load properties
  useEffect(() => {
    if (permLoading) return;
    let query = supabase.from("properties").select("id, name, city, country, timezone, status, image_url");
    if (!isAdmin && assignedPropertyIds.length > 0) {
      query = query.in("id", assignedPropertyIds);
    } else if (!isAdmin && assignedPropertyIds.length === 0) {
      setProperties([]);
      setPropLoading(false);
      return;
    }
    query.then(({ data }) => {
      if (data) setProperties(data as Property[]);
      setPropLoading(false);
    });
  }, [isAdmin, assignedPropertyIds, permLoading]);

  // Load pending task count
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "in_progress"])
      .eq("assigned_to", userId)
      .then(({ count }) => setPendingCount(count ?? 0));
  }, [userId]);

  // Load global feed (admin only)
  useEffect(() => {
    if (permLoading) return;
    if (!isAdmin) { setFeedLoading(false); return; }
    supabase
      .from("system_events")
      .select("id, event_type, entity_type, payload, created_at, property_id")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(async ({ data }) => {
        if (!data) { setFeedLoading(false); return; }
        const propIds = [...new Set(data.map((e) => e.property_id).filter(Boolean))] as string[];
        let propNames: Record<string, string> = {};
        if (propIds.length) {
          const { data: props } = await supabase.from("properties").select("id, name").in("id", propIds);
          (props ?? []).forEach((p: { id: string; name: string }) => { propNames[p.id] = p.name; });
        }
        setFeedEvents(data.map((e) => ({
          ...e,
          payload: e.payload as Record<string, unknown> | null,
          propertyName: e.property_id ? propNames[e.property_id] : undefined,
        })));
        setFeedLoading(false);
      });
  }, [isAdmin, permLoading]);

  // Load unread notifications for the dashboard widget
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("notifications")
      .select("id, title, body, type, created_at, action_url")
      .eq("user_id", userId)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setDashNotifs((data as DashNotification[]) ?? []));
  }, [userId]);

  const greeting = getGreeting(language);
  const dateStr = formatDate(language);
  const smartTagline = taglineOverride ? taglineOverride.text : getSmartTagline(language);

  const dismissNotif = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setDashNotifs(prev => prev.filter(n => n.id !== id));
  };

  const saveTaglineOverride = () => {
    if (!taglineDraft.trim()) {
      // Clear override
      localStorage.removeItem(TAGLINE_STORAGE_KEY);
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
    localStorage.setItem(TAGLINE_STORAGE_KEY, JSON.stringify(override));
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

  const clearTaglineOverride = () => {
    localStorage.removeItem(TAGLINE_STORAGE_KEY);
    setTaglineOverride(null);
  };

  return (
    <div className="animate-fade-in pb-4">
      {/* Greeting banner */}
      <div className="bg-charcoal px-5 pt-6 pb-5 border-b border-charcoal-light">
        <p className="text-cream/50 text-xs tracking-widest uppercase mb-1">{dateStr}</p>
        <h1 className="font-display text-3xl text-cream leading-tight">
          {greeting}, <span className="text-gold">{fullName?.split(" ")[0] ?? "there"}</span>
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
          <div className="rounded-lg bg-[hsl(var(--status-done)/0.08)] border border-[hsl(var(--status-done)/0.2)] px-3 py-2.5">
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
          </div>
          <div className="rounded-lg bg-gold/5 border border-gold/20 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={14} className="text-gold" />
              <span className="text-[10px] uppercase tracking-wider text-gold font-semibold">
                {language === "es" ? "Propiedades" : "Properties"}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {propLoading ? "—" : `${properties.length} total`}
            </p>
          </div>
        </div>

        {/* Active Rules alert */}
        {activeRules.length > 0 && (
          <div className="mt-3 space-y-2">
            {activeRules.map(rule => (
              <div key={rule.id} className="flex items-start gap-2 rounded-lg bg-[hsl(var(--status-progress)/0.08)] border border-[hsl(var(--status-progress)/0.25)] px-3 py-2.5">
                <Shield size={13} className="text-[hsl(var(--status-progress))] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[hsl(var(--status-progress))] truncate">{rule.icon} {rule.title}</p>
                  {rule.propertyName && <p className="text-[10px] text-muted-foreground mt-0.5">{rule.propertyName}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notifications widget — shows unread alerts, dismissable */}
      {dashNotifs.length > 0 && (
        <div className="mx-4 mt-4 rounded-xl bg-card border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-[hsl(var(--gold))]" />
              <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                {language === "es" ? "Notificaciones" : "Notifications"}
              </span>
              <span className="text-[10px] bg-status-urgent text-white font-bold px-1.5 py-0.5 rounded-full">
                {dashNotifs.length}
              </span>
            </div>
            <button
              onClick={() => dashNotifs.forEach(n => dismissNotif(n.id))}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {language === "es" ? "Limpiar todas" : "Clear all"}
            </button>
          </div>
          <div className="divide-y divide-border">
            {dashNotifs.map(n => {
              const styles = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
              return (
                <div
                  key={n.id}
                  className={cn("flex items-start gap-3 px-4 py-3 border-l-2", styles.border)}
                >
                  <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", styles.dot)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                    {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>}
                  </div>
                  <button
                    onClick={() => dismissNotif(n.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 p-1"
                    aria-label="Dismiss"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="px-4 mt-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          {language === "es" ? "Acciones Rápidas" : "Quick Actions"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.filter(a => isMasterAdmin || canSee(a.section)).map((action) => (
            <button
              key={action.labelKey}
              onClick={() => setActiveSection(action.section)}
              className="flex flex-col items-center justify-center gap-2 bg-card border border-border rounded-xl p-4 min-h-[88px] hover:border-gold/40 hover:bg-gold/5 transition-all active:scale-95"
            >
              <span className="text-gold">{action.icon}</span>
              <span className="text-xs font-medium text-foreground text-center leading-tight">
                {language === "es" ? action.labelEs : t(action.labelKey)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Properties */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {language === "es" ? "Propiedades" : "Properties"}
          </p>
          <button onClick={() => setActiveSection("property")} className="flex items-center gap-1 text-gold text-xs">
            {language === "es" ? "Ver todo" : "View all"} <ChevronRight size={12} />
          </button>
        </div>

        {propLoading ? (
          <div className="grid grid-cols-1 gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-xl bg-card border border-border p-6 text-center">
            <p className="text-muted-foreground text-sm">{language === "es" ? "Sin propiedades aún" : "No properties yet"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {properties.map((prop) => {
              const cfg = statusConfig[prop.status];
              return (
                <button
                  key={prop.id}
                  onClick={() => { setTargetPropertyId(prop.id); setActiveSection("property"); }}
                  className="w-full flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-gold/30 transition-all active:scale-[0.99] text-left"
                >
                  <div className="w-14 h-14 rounded-lg bg-charcoal flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {prop.image_url
                      ? <img src={prop.image_url} alt={prop.name} className="w-full h-full object-cover" />
                      : <span className="font-display text-gold text-xl">{prop.name.charAt(0)}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{prop.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin size={11} className="text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">{prop.city}, {prop.country}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${cfg.className}`}>
                    {language === "es" ? cfg.labelEs : cfg.label}
                  </span>
                </button>
              );
            })}
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
