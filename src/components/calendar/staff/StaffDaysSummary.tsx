import { useMemo } from "react";
import { differenceInCalendarDays, parseISO, eachDayOfInterval, format } from "date-fns";
import { CalendarDays, Clock, Plane, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayName } from "./utils";
import type { Profile, DisplayShift } from "./types";
import type { StaffLeaveRequest } from "@/hooks/useStaffSchedules";

/**
 * Per-staff tally bar across the selected date range.
 * Mirrors the "Days Tracking" summary from the reference HTML — one row per staff member with:
 *   • Days worked vs contracted (for the range)
 *   • Hours worked vs contracted (for the range)
 *   • Annual leave taken YTD vs allowance (calendar year — independent of range)
 *
 * Shown in the month view above the stacked month cards.
 */
export function StaffDaysSummary({
  staffToShow,
  displayShifts,
  leaveRequests,
  rangeStart,
  rangeEnd,
}: {
  staffToShow: Profile[];
  displayShifts: DisplayShift[];
  leaveRequests: StaffLeaveRequest[];
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const rows = useMemo(() => {
    const totalDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).length;
    const weeksInRange = totalDays / 7;
    const yearStart = `${rangeStart.getFullYear()}-01-01`;
    const yearEnd = `${rangeStart.getFullYear()}-12-31`;
    const startStr = format(rangeStart, "yyyy-MM-dd");
    const endStr = format(rangeEnd, "yyyy-MM-dd");

    return staffToShow.map((person) => {
      const personShifts = displayShifts.filter(
        (s) =>
          s.staff_id === person.id &&
          !s.is_leave &&
          s.status === "scheduled" &&
          s.shift_date >= startStr &&
          s.shift_date <= endStr
      );
      const daysWorked = new Set(personShifts.map((s) => s.shift_date)).size;
      const hoursWorked = personShifts.reduce((sum, s) => {
        if (!s.start_time || !s.end_time) return sum;
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        return sum + Math.max(0, (eh + em / 60) - (sh + sm / 60));
      }, 0);

      const dpw = person.contracted_days_per_week ?? 5;
      const hpw = person.contracted_hours_per_week ?? 40;
      const allowance = person.annual_leave_days ?? 25;

      const daysExpected = Math.round(dpw * weeksInRange);
      const hoursExpected = Math.round(hpw * weeksInRange);

      // Leave taken YTD (calendar year, not just the range)
      const leaveTakenYTD = leaveRequests
        .filter((lr) => lr.staff_id === person.id && lr.status === "approved")
        .reduce((sum, lr) => {
          const start = lr.start_date > yearStart ? lr.start_date : yearStart;
          const end = lr.end_date < yearEnd ? lr.end_date : yearEnd;
          if (start > end) return sum;
          return sum + differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
        }, 0);
      const leaveLeft = Math.max(0, allowance - leaveTakenYTD);

      const daysDelta = daysWorked - daysExpected;
      const hoursDelta = hoursWorked - hoursExpected;

      return {
        person,
        daysWorked,
        daysExpected,
        daysDelta,
        hoursWorked,
        hoursExpected,
        hoursDelta,
        leaveTakenYTD,
        leaveLeft,
        allowance,
      };
    });
  }, [staffToShow, displayShifts, leaveRequests, rangeStart, rangeEnd]);

  if (rows.length === 0) return null;

  const rangeLabel = `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d, yyyy")}`;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="bg-primary/10 border-b border-border px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-primary">Days Tracking</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {rangeLabel}
        </p>
      </div>

      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.person.id} className="px-3 py-2.5 hover:bg-muted/10 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold",
                r.person.is_draft ? "bg-amber-500/20 text-amber-400" : "bg-primary/10 text-primary"
              )}>
                {getDisplayName(r.person, "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-xs font-semibold truncate leading-tight",
                  r.person.is_draft && "italic text-muted-foreground"
                )}>
                  {getDisplayName(r.person)}
                </p>
                {r.person.job_title && (
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">{r.person.job_title}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat
                icon={<CalendarDays size={11} />}
                label="Days"
                value={`${r.daysWorked} / ${r.daysExpected}`}
                delta={r.daysDelta}
                deltaUnit="d"
              />
              <Stat
                icon={<Clock size={11} />}
                label="Hours"
                value={`${r.hoursWorked.toFixed(1)} / ${r.hoursExpected}`}
                delta={r.hoursDelta}
                deltaUnit="h"
              />
              <Stat
                icon={<Plane size={11} />}
                label="Leave (YTD)"
                value={`${r.leaveLeft} left`}
                sub={`${r.leaveTakenYTD} of ${r.allowance}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  delta,
  deltaUnit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  deltaUnit?: string;
}) {
  const showDelta = typeof delta === "number" && delta !== 0;
  const positive = (delta ?? 0) > 0;
  return (
    <div className="rounded-lg border border-border bg-muted/10 px-2 py-1.5 min-w-0">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <p className="text-[9px] uppercase tracking-wider font-semibold truncate">{label}</p>
      </div>
      <p className="text-xs font-bold text-foreground mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground leading-tight truncate">{sub}</p>}
      {showDelta && (
        <p className={cn(
          "text-[10px] font-semibold leading-tight flex items-center gap-0.5 mt-0.5",
          positive ? "text-emerald-500" : "text-amber-500"
        )}>
          {positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
          {positive ? "+" : ""}{Math.round(delta!)}{deltaUnit}
        </p>
      )}
    </div>
  );
}
