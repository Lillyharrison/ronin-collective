import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin, Clock, CheckSquare, TriangleAlert,
  UserCheck, ChevronRight, Activity, Trophy, Zap,
} from "lucide-react";

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

const statusConfig: Record<string, { label: string; labelEs: string; className: string }> = {
  occupied:           { label: "Occupied",          labelEs: "Ocupado",           className: "status-done" },
  vacant:             { label: "Vacant",            labelEs: "Vacante",           className: "status-vacant" },
  maintenance:        { label: "Maintenance",       labelEs: "Mantenimiento",     className: "status-pending" },
  under_construction: { label: "Under Construction",labelEs: "En Construcción",   className: "status-pending" },
};

const quickActions = [
  { labelKey: "myTasks" as const,      labelEs: "Mis Tareas",        icon: <CheckSquare size={26} />, section: "tasks" as const },
  { labelKey: "reportIssue" as const,  labelEs: "Reportar Problema", icon: <TriangleAlert size={26} />, section: "maintenance" as const },
  { labelKey: "achievements" as const, labelEs: "Logros",            icon: <Trophy size={26} />, section: "achievements" as const },
  { labelKey: "calendar" as const,     labelEs: "Calendario",        icon: <Clock size={26} />, section: "calendar" as const },
];

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

function friendlyEventLabel(event: FeedEvent, language: string): string {
  const type = event.event_type;
  const prop = event.propertyName ?? "—";
  const map: Record<string, [string, string]> = {
    task_created:    ["Task created", "Tarea creada"],
    task_completed:  ["Task completed", "Tarea completada"],
    task_updated:    ["Task updated", "Tarea actualizada"],
    csv_import:      ["Tasks imported via CSV", "Tareas importadas por CSV"],
    user_invited:    ["New team member invited", "Nuevo miembro invitado"],
    issue_reported:  ["Issue reported", "Problema reportado"],
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
  const { setActiveSection } = useNavigation();
  const { isMasterAdmin, isAdmin, userId, fullName, canSee, assignedPropertyIds, loading: permLoading } = usePermissions();

  const [properties, setProperties] = useState<Property[]>([]);
  const [propLoading, setPropLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Load properties — admins see all, others see only their assigned properties
  useEffect(() => {
    if (permLoading) return;
    let query = supabase
      .from("properties")
      .select("id, name, city, country, timezone, status, image_url");

    if (!isAdmin && assignedPropertyIds.length > 0) {
      query = query.in("id", assignedPropertyIds);
    } else if (!isAdmin && assignedPropertyIds.length === 0) {
      // No assigned properties → show nothing
      setProperties([]);
      setPropLoading(false);
      return;
    }

    query.then(({ data }) => {
      if (data) setProperties(data as Property[]);
      setPropLoading(false);
    });
  }, [isAdmin, assignedPropertyIds, permLoading]);

  // Load pending task count for current user
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

        // Enrich with property names
        const propIds = [...new Set(data.map((e) => e.property_id).filter(Boolean))] as string[];
        let propNames: Record<string, string> = {};
        if (propIds.length) {
          const { data: props } = await supabase
            .from("properties")
            .select("id, name")
            .in("id", propIds);
          (props ?? []).forEach((p: { id: string; name: string }) => { propNames[p.id] = p.name; });
        }

        setFeedEvents(
          data.map((e) => ({
            ...e,
            payload: e.payload as Record<string, unknown> | null,
            propertyName: e.property_id ? propNames[e.property_id] : undefined,
          }))
        );
        setFeedLoading(false);
      });
  }, [isAdmin, permLoading]);

  const greeting = getGreeting(language);
  const dateStr = formatDate(language);

  return (
    <div className="animate-fade-in pb-4">
      {/* Greeting banner */}
      <div className="bg-charcoal px-5 pt-6 pb-5 border-b border-charcoal-light">
        <p className="text-cream/50 text-xs tracking-widest uppercase mb-1">{dateStr}</p>
        <h1 className="font-display text-3xl text-cream leading-tight">
          {greeting}, <span className="text-gold">{fullName?.split(" ")[0] ?? "there"}</span>
        </h1>
        <p className="text-cream/40 text-xs mt-1 tracking-wide">
          {language === "es" ? "Centro de Mando — Vista Global" : "Command Center — Global View"}
        </p>
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
          {/* Pending tasks tile */}
          <div className="rounded-lg bg-[hsl(var(--status-done)/0.08)] border border-[hsl(var(--status-done)/0.2)] px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare size={14} className="text-status-done" />
              <span className="text-[10px] uppercase tracking-wider text-status-done font-semibold">
                {language === "es" ? "Pendientes" : "My Tasks"}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {pendingCount === null
                ? "—"
                : pendingCount === 0
                ? language === "es" ? "Al día" : "All clear"
                : `${pendingCount} ${language === "es" ? "activas" : "active"}`}
            </p>
          </div>
          {/* Properties tile */}
          <div className="rounded-lg bg-gold/5 border border-gold/20 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={14} className="text-gold" />
              <span className="text-[10px] uppercase tracking-wider text-gold font-semibold">
                {language === "es" ? "Propiedades" : "Properties"}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {propLoading ? "—" : `${properties.length} ${language === "es" ? "total" : "total"}`}
            </p>
          </div>
        </div>
      </div>

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
          <button
            onClick={() => setActiveSection("property")}
            className="flex items-center gap-1 text-gold text-xs"
          >
            {language === "es" ? "Ver todo" : "View all"} <ChevronRight size={12} />
          </button>
        </div>

        {propLoading ? (
          <div className="grid grid-cols-1 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-xl bg-card border border-border p-6 text-center">
            <p className="text-muted-foreground text-sm">
              {language === "es" ? "Sin propiedades aún" : "No properties yet"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {properties.map((prop) => {
              const cfg = statusConfig[prop.status];
              return (
                <button
                  key={prop.id}
                  onClick={() => setActiveSection("property")}
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
              <p className="text-cream/30 text-xs">
                {language === "es" ? "Sin actividad aún" : "No activity yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-charcoal-light">
              {feedEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${eventDotColor(event.event_type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-cream/80 text-xs truncate">
                      {friendlyEventLabel(event, language)}
                    </p>
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
