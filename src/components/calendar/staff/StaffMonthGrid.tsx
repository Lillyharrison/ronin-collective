import { format, eachDayOfInterval, endOfMonth, getDay, isToday, isWeekend, isSameMonth, startOfMonth } from "date-fns";
import { CalendarOff, Settings2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getDisplayName, propColor, formatTime } from "./utils";
import type { DisplayShift, Profile, Property } from "./types";

export function StaffMonthGrid({
  monthStart,
  monthEnd,
  staffToShow,
  displayShifts,
  properties,
  loading,
  canEdit,
  onShowScheduleManager,
  noWrapper = false,
}: {
  monthStart: Date;
  monthEnd?: Date;
  staffToShow: Profile[];
  displayShifts: DisplayShift[];
  properties: Property[];
  loading: boolean;
  canEdit: boolean;
  onShowScheduleManager: () => void;
  noWrapper?: boolean;
}) {
  const rangeEnd = monthEnd ?? endOfMonth(monthStart);
  const monthDays = eachDayOfInterval({ start: monthStart, end: rangeEnd });
  // Identify month boundaries for visual separators in multi-month ranges
  const monthBoundaryDates = new Set<string>();
  let cursor = startOfMonth(monthStart);
  while (cursor <= rangeEnd) {
    monthBoundaryDates.add(format(cursor, "yyyy-MM-dd"));
    cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  }
  const spansMultipleMonths = !isSameMonth(monthStart, rangeEnd);
  const headerLabel = spansMultipleMonths
    ? `${format(monthStart, "MMM yyyy")} – ${format(rangeEnd, "MMM yyyy")}`
    : format(monthStart, "MMMM yyyy");
  // Group days into weeks (Mon–Sun rows) — kept for parity even if not rendered here
  const weeks: Date[][] = [];
  let week: Date[] = [];
  monthDays.forEach((day) => {
    week.push(day);
    if (getDay(day) === 0 || day === monthDays[monthDays.length - 1]) {
      weeks.push(week);
      week = [];
    }
  });
  void weeks;

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (staffToShow.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4 rounded-2xl border border-border bg-card">
        <UserCheck size={36} className="text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No staff scheduled in this range</p>
        {canEdit && (
          <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={onShowScheduleManager}>
            <Settings2 size={13} /> Set Up Schedules
          </Button>
        )}
      </div>
    );
  }

  const inner = (
    <div className="min-w-[600px]">
      <div
        className="grid border-b border-border bg-muted/30"
        style={{ gridTemplateColumns: `180px repeat(${monthDays.length}, minmax(28px, 1fr))` }}
      >
        <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-r border-border sticky left-0 bg-muted/30 z-10">
          {headerLabel}
        </div>
        {monthDays.map((day, idx) => {
          const isMonthStart = idx > 0 && monthBoundaryDates.has(format(day, "yyyy-MM-dd"));
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "py-1.5 text-center border-r border-border last:border-r-0",
                isToday(day) && "bg-primary/10",
                isWeekend(day) && "bg-muted/20",
                isMonthStart && "border-l-2 border-l-primary/40"
              )}
            >
              {isMonthStart && (
                <p className="text-[8px] font-semibold text-primary uppercase leading-none tracking-wider">
                  {format(day, "MMM")}
                </p>
              )}
              <p className={cn(
                "text-[9px] font-medium text-muted-foreground uppercase leading-none",
                isToday(day) && "text-primary"
              )}>
                {format(day, "EEE")}
              </p>
              <p className={cn(
                "text-[11px] font-bold mt-0.5 w-5 h-5 rounded-full flex items-center justify-center mx-auto",
                isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
              )}>
                {format(day, "d")}
              </p>
            </div>
          );
        })}
      </div>

      {staffToShow.map((person) => {
        const personShifts = displayShifts.filter((s) => s.staff_id === person.id);
        return (
          <div
            key={person.id}
            className="grid border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors"
            style={{ gridTemplateColumns: `180px repeat(${monthDays.length}, minmax(28px, 1fr))` }}
          >
            <div className="px-2 py-2 border-r border-border flex items-center gap-1.5 min-w-0 sticky left-0 bg-card z-10">
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-semibold",
                person.is_draft ? "bg-amber-500/20 text-amber-400" : "bg-primary/10 text-primary"
              )}>
                {getDisplayName(person, "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className={cn(
                  "text-[11px] font-medium truncate leading-tight",
                  person.is_draft && "italic text-muted-foreground"
                )}>
                  {getDisplayName(person)}
                </p>
                {person.job_title && (
                  <p className="text-[9px] text-muted-foreground truncate leading-tight">{person.job_title}</p>
                )}
              </div>
            </div>

            {monthDays.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayShifts = personShifts.filter((s) => s.shift_date === dateStr);
              const hasLeave = dayShifts.some((s) => s.is_leave);
              const workShifts = dayShifts.filter((s) => !s.is_leave);

              return (
                <div
                  key={dateStr}
                  className={cn(
                    "border-r border-border last:border-r-0 py-1 px-0.5 flex flex-col gap-0.5 items-center justify-center min-h-[44px]",
                    isToday(day) && "bg-primary/5",
                    isWeekend(day) && workShifts.length === 0 && !hasLeave && "bg-muted/10"
                  )}
                >
                  {hasLeave && (
                    <div className="w-full rounded px-0.5 py-0.5 bg-muted/60 border border-border flex items-center justify-center" title="Leave">
                      <CalendarOff size={9} className="text-muted-foreground" />
                    </div>
                  )}
                  {workShifts.map((s, si) => {
                    const col = propColor(s.property_id, properties);
                    const prop = properties.find((p) => p.id === s.property_id);
                    const label = prop?.name ? prop.name.split(" ")[0] : "—";
                    const time = s.start_time && s.end_time
                      ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}`
                      : s.start_time ? formatTime(s.start_time) : "";
                    return (
                      <div
                        key={si}
                        title={`${prop?.name ?? "—"} ${time}`}
                        className={cn(
                          "w-full rounded px-0.5 py-0.5 text-center",
                          col.bg, col.text,
                          "border"
                        )}
                      >
                        <div className="text-[8px] font-semibold leading-tight truncate">{label}</div>
                        {time && (
                          <div className="text-[7px] opacity-80 leading-tight truncate">{time}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return noWrapper
    ? inner
    : <div className="rounded-2xl border border-border bg-card overflow-x-auto">{inner}</div>;
}
