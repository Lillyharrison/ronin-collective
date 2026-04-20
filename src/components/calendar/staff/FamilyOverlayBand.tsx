import { format } from "date-fns";
import { PlaneTakeoff } from "lucide-react";
import { cn } from "@/lib/utils";
import { propColor } from "./utils";
import type { FamilyEvent, Property } from "./types";

export function FamilyOverlayBand({
  monthStart: _monthStart,
  monthDays,
  events,
  properties,
}: {
  monthStart: Date;
  monthDays: Date[];
  events: FamilyEvent[];
  properties: Property[];
}) {
  if (events.length === 0) return null;

  // Group by event title (so the same person/trip merges across days)
  const groups = new Map<string, FamilyEvent[]>();
  for (const ev of events) {
    const key = ev.title || "Family";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }

  return (
    <div className="border-b border-border bg-muted/10">
      <div
        className="grid"
        style={{ gridTemplateColumns: `180px repeat(${monthDays.length}, minmax(28px, 1fr))` }}
      >
        <div
          className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border flex items-center gap-1 sticky left-0 bg-card z-10"
          style={{ gridRow: `1 / span ${groups.size}` }}
        >
          <PlaneTakeoff size={10} /> Family
        </div>
        {Array.from(groups.entries()).map(([title, evs]) => {
          const col = propColor(evs[0].property_id, properties);
          return monthDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const inEvent = evs.some((ev) => {
              const start = ev.start_date.slice(0, 10);
              const end = (ev.end_date ?? ev.start_date).slice(0, 10);
              return dateStr >= start && dateStr <= end;
            });
            return (
              <div key={`${title}-${dateStr}`} className="px-px py-0.5">
                {inEvent && (
                  <div
                    className={cn("h-3.5 rounded-sm border", col.bg, col.text)}
                    title={title}
                  />
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
