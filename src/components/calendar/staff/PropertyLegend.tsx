import { CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { propColor } from "./utils";
import type { Property } from "./types";

export function PropertyLegend({ properties }: { properties: Property[] }) {
  if (properties.length === 0) return null;

  const groups = new Map<string, Property[]>();
  for (const p of properties) {
    const key = (p.city?.trim() || p.country?.trim() || "Other");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const groupEntries = Array.from(groups.entries());

  return (
    <div className="space-y-1.5 pt-1">
      {groupEntries.map(([city, props]) => (
        <div key={city} className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 flex-shrink-0">
            {city}
          </span>
          <div className="flex items-center gap-3 flex-wrap">
            {props.map((p) => {
              const col = propColor(p.id, properties);
              return (
                <div key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                  {p.name}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 flex-shrink-0">
          Other
        </span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarOff size={10} /> Leave
        </div>
      </div>
    </div>
  );
}
