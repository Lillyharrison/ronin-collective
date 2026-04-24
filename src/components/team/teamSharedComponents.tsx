// Small shared UI primitives for the Meet the Team feature.
// Extracted from MeetTeamSection.tsx during the conservative refactor.

import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ALL_QUICK_ACTIONS, type Property } from "./teamConstants";

// ─── Property Toggle Pills ─────────────────────────────────────────────────────
export function PropertyToggles({ properties, assignedProps, onChange, disabled = false }: {
  properties: Property[];
  assignedProps: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  if (properties.length === 0) return <p className="text-muted-foreground text-xs">No properties yet</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {properties.map(p => {
        const on = assignedProps.includes(p.id);
        return (
          <button
            key={p.id}
            disabled={disabled}
            onClick={() => onChange(on ? assignedProps.filter(id => id !== p.id) : [...assignedProps, p.id])}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 ${
              on
                ? "bg-green-500/20 border-green-500/60 text-green-400"
                : "bg-charcoal-light border-charcoal-light text-cream/40 hover:border-cream/30 hover:text-cream/60"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {on && <Check size={11} />}
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

// ─── Quick Action Toggles ──────────────────────────────────────────────────────
export function QuickActionToggles({ isEN, enabledKeys, onChange, disabled = false }: {
  isEN: boolean;
  enabledKeys: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs mb-3">
        {isEN
          ? "Choose which shortcuts appear on this user's dashboard."
          : "Elige qué accesos directos aparecen en el panel de este usuario."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {ALL_QUICK_ACTIONS.map(qa => {
          const on = enabledKeys.includes(qa.key);
          return (
            <button
              key={qa.key}
              disabled={disabled}
              onClick={() => onChange(on ? enabledKeys.filter(k => k !== qa.key) : [...enabledKeys, qa.key])}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-xs font-medium transition-all ${
                on
                  ? "bg-gold/15 border-gold/50 text-gold"
                  : "bg-charcoal-light border-charcoal-light text-cream/40 hover:border-cream/30 hover:text-cream/60"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="text-base leading-none">{qa.icon}</span>
              <span className="flex-1">{isEN ? qa.label : qa.labelEs}</span>
              {on && <Check size={11} className="shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
export function FieldLabel({ label }: { label: string }) {
  return <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block">{label}</label>;
}

export function EditField({ label, value, onChange, disabled, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; type?: string;
}) {
  return (
    <div>
      <FieldLabel label={label} />
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="bg-charcoal-light border-charcoal-light text-cream disabled:opacity-50"
      />
    </div>
  );
}
