import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin, Clock, CheckSquare, TriangleAlert,
  UserCheck, Package, ChevronRight, Activity, Trophy,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  status: "occupied" | "vacant" | "maintenance";
  image_url: string | null;
}

const statusConfig = {
  occupied:    { label: "Occupied",    labelEs: "Ocupado",     className: "status-done" },
  vacant:      { label: "Vacant",      labelEs: "Vacante",     className: "status-vacant" },
  maintenance: { label: "Maintenance", labelEs: "Mantenimiento", className: "status-progress" },
};

const quickActions = [
  { labelKey: "myTasks" as const,     labelEs: "Mis Tareas",          icon: <CheckSquare size={26} />, section: "tasks" as const },
  { labelKey: "reportIssue" as const, labelEs: "Reportar Problema",   icon: <TriangleAlert size={26} />, section: "maintenance" as const },
  { labelKey: "houseManual" as const, labelEs: "Logros",             icon: <Trophy size={26} />, section: "achievements" as const },
  { labelKey: "calendar" as const,    labelEs: "Calendario",          icon: <Clock size={26} />, section: "calendar" as const },
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

export function Dashboard() {
  const { language, t } = useLanguage();
  const { setActiveSection } = useNavigation();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("properties")
      .select("id, name, city, country, timezone, status, image_url")
      .then(({ data }) => {
        if (data) setProperties(data as Property[]);
        setLoading(false);
      });
  }, []);

  const greeting = getGreeting(language);
  const dateStr = formatDate(language);

  return (
    <div className="animate-fade-in pb-4">
      {/* Greeting banner */}
      <div className="bg-charcoal px-5 pt-6 pb-5 border-b border-charcoal-light">
        <p className="text-cream/50 text-xs tracking-widest uppercase mb-1">{dateStr}</p>
        <h1 className="font-display text-3xl text-cream leading-tight">
          {greeting}, <span className="text-gold">Lilly</span>
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
          <div className="rounded-lg bg-[hsl(var(--status-done)/0.08)] border border-[hsl(var(--status-done)/0.2)] px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={14} className="text-status-done" />
              <span className="text-[10px] uppercase tracking-wider text-status-done font-semibold">
                {language === "es" ? "Estado" : "Principal"}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {language === "es" ? "Dueño Presente" : "Owner On-Site"}
            </p>
          </div>
          <div className="rounded-lg bg-gold/5 border border-gold/20 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <Package size={14} className="text-gold" />
              <span className="text-[10px] uppercase tracking-wider text-gold font-semibold">
                {language === "es" ? "Vendedores" : "Vendors"}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">3 {language === "es" ? "activos" : "active"}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          {language === "es" ? "Acciones Rápidas" : "Quick Actions"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => (
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

        {loading ? (
          <div className="grid grid-cols-1 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
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
                  {/* Property thumbnail placeholder */}
                  <div className="w-14 h-14 rounded-lg bg-charcoal flex items-center justify-center flex-shrink-0">
                    <span className="font-display text-gold text-xl">
                      {prop.name.charAt(0)}
                    </span>
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

      {/* Global Feed */}
      <div className="mx-4 mt-6 rounded-xl bg-charcoal border border-charcoal-light overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-charcoal-light">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-status-done animate-pulse" />
            <span className="text-cream text-xs font-semibold tracking-widest uppercase">
              {language === "es" ? "Feed Global" : "Global Feed"}
            </span>
          </div>
          <span className="text-cream/30 text-[10px]">
            {language === "es" ? "Sólo para Admin" : "Admin Only"}
          </span>
        </div>
        <div className="divide-y divide-charcoal-light">
          {[
            { time: "09:42", prop: "Malibu", msg: language === "es" ? "Tarea completada: Limpieza de cocina" : "Task completed: Kitchen cleaning", color: "bg-status-done" },
            { time: "09:15", prop: "Montana", msg: language === "es" ? "Problema reportado: Calefacción" : "Issue reported: Heating system", color: "bg-status-urgent" },
            { time: "08:50", prop: "New York", msg: language === "es" ? "Proveedor llegó: HVAC" : "Vendor arrived: HVAC service", color: "bg-gold" },
          ].map((feed, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${feed.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-cream/80 text-xs truncate">{feed.msg}</p>
                <p className="text-cream/30 text-[10px] mt-0.5">{feed.prop} · {feed.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
