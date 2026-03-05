import { usePermissions } from "@/hooks/usePermissions";
import { useActiveRulesForDashboard, PropertyRule } from "@/hooks/usePropertyRules";
import { Shield, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

const COLOR_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  red:    { bg: "bg-[hsl(var(--status-urgent)/0.08)]",   border: "border-[hsl(var(--status-urgent)/0.3)]",   text: "text-[hsl(var(--status-urgent))]",   dot: "bg-[hsl(var(--status-urgent))]" },
  amber:  { bg: "bg-[hsl(var(--status-pending)/0.08)]",  border: "border-[hsl(var(--status-pending)/0.3)]",  text: "text-[hsl(var(--status-pending))]",  dot: "bg-[hsl(var(--status-pending))]" },
  orange: { bg: "bg-[hsl(var(--status-urgent)/0.08)]",   border: "border-[hsl(var(--status-urgent)/0.3)]",   text: "text-[hsl(var(--status-urgent))]",   dot: "bg-[hsl(var(--status-urgent))]" },
  blue:   { bg: "bg-accent/8",                            border: "border-accent/30",                          text: "text-accent",                          dot: "bg-accent" },
  green:  { bg: "bg-[hsl(var(--status-done)/0.08)]",     border: "border-[hsl(var(--status-done)/0.3)]",     text: "text-status-done",                    dot: "bg-status-done" },
  gold:   { bg: "bg-gold/8",                              border: "border-gold/30",                            text: "text-gold",                            dot: "bg-gold" },
};

function getStyle(color: string) {
  return COLOR_STYLES[color] ?? COLOR_STYLES.amber;
}

interface RuleCardProps {
  rule: PropertyRule & { propertyName?: string };
}

function RuleCard({ rule }: RuleCardProps) {
  const s = getStyle(rule.color);
  return (
    <div className={cn("rounded-xl border p-4", s.bg, s.border)}>
      <div className="flex items-start gap-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0", s.bg, s.border, "border")}>
          {rule.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn("text-sm font-semibold", s.text)}>{rule.title}</p>
            {rule.is_universal && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                Universal
              </span>
            )}
          </div>
          {rule.propertyName && (
            <p className="text-xs text-muted-foreground mt-0.5">{rule.propertyName}</p>
          )}
          {rule.description && (
            <p className="text-sm text-foreground/80 mt-2 leading-relaxed">{rule.description}</p>
          )}
          {rule.applies_to_roles.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {rule.applies_to_roles.map(r => (
                <span key={r} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full capitalize">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AlertsSection() {
  const { assignedPropertyIds, isMasterAdmin } = usePermissions();
  const { language } = useLanguage();
  const activeRules = useActiveRulesForDashboard(assignedPropertyIds, isMasterAdmin);

  const urgentRules = activeRules.filter(r => ["red", "orange"].includes(r.color));
  const otherRules  = activeRules.filter(r => !["red", "orange"].includes(r.color));

  return (
    <div className="animate-fade-in pb-8">
      {/* Header banner */}
      <div className="bg-[hsl(var(--status-urgent)/0.08)] border-b border-[hsl(var(--status-urgent)/0.2)] px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[hsl(var(--status-urgent)/0.15)] border border-[hsl(var(--status-urgent)/0.3)] flex items-center justify-center">
            <Shield size={18} className="text-[hsl(var(--status-urgent))]" />
          </div>
          <div>
            <h2 className="font-display text-xl text-foreground">
              {language === "es" ? "Alertas Activas" : "Active Alerts"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeRules.length === 0
                ? (language === "es" ? "Sin alertas activas" : "No active alerts")
                : `${activeRules.length} ${language === "es" ? "regla(s) activa(s)" : `active rule${activeRules.length !== 1 ? "s" : ""}`}`}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-5 space-y-6">
        {activeRules.length === 0 ? (
          <div className="rounded-xl bg-card border border-border p-8 text-center">
            <Info size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {language === "es" ? "No hay alertas activas en este momento" : "No active alerts right now"}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {language === "es"
                ? "Las reglas activas de las propiedades aparecerán aquí"
                : "Active property rules will appear here"}
            </p>
          </div>
        ) : (
          <>
            {urgentRules.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={13} className="text-[hsl(var(--status-urgent))]" />
                  <p className="text-xs font-semibold tracking-widest uppercase text-[hsl(var(--status-urgent))]">
                    {language === "es" ? "Urgente" : "Urgent"}
                  </p>
                </div>
                <div className="space-y-3">
                  {urgentRules.map(rule => <RuleCard key={rule.id} rule={rule} />)}
                </div>
              </div>
            )}

            {otherRules.length > 0 && (
              <div>
                {urgentRules.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <Info size={13} className="text-muted-foreground" />
                    <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                      {language === "es" ? "General" : "General"}
                    </p>
                  </div>
                )}
                <div className="space-y-3">
                  {otherRules.map(rule => <RuleCard key={rule.id} rule={rule} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
