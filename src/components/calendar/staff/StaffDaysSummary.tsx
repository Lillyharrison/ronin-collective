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
      <div className="bg-primary/10 border-b border-border px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-primary">Days Tracking</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {rangeLabel}
        </p>
      </div>

      {/* Compact table layout — one row per staff member */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/30 text-[9px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-semibold px-2 py-1.5">Staff</th>
              <th className="text-center font-semibold px-1.5 py-1.5 w-[68px]">
                <span className="inline-flex items-center gap-1"><CalendarDays size={10} /> Days</span>
              </th>
              <th className="text-center font-semibold px-1.5 py-1.5 w-[50px]">Δ</th>
              <th className="text-center font-semibold px-1.5 py-1.5 w-[78px]">
                <span className="inline-flex items-center gap-1"><Clock size={10} /> Hours</span>
              </th>
              <th className="text-center font-semibold px-1.5 py-1.5 w-[50px]">Δ</th>
              <th className="text-center font-semibold px-1.5 py-1.5 w-[80px]">
                <span className="inline-flex items-center gap-1"><Plane size={10} /> Leave YTD</span>
              </th>
              <th className="text-center font-semibold px-1.5 py-1.5 w-[44px]">Left</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.person.id} className="hover:bg-muted/10 transition-colors">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-semibold",
                      r.person.is_draft ? "bg-amber-500/20 text-amber-400" : "bg-primary/10 text-primary"
                    )}>
                      {getDisplayName(r.person, "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "font-semibold truncate leading-tight",
                        r.person.is_draft && "italic text-muted-foreground"
                      )}>
                        {getDisplayName(r.person)}
                      </p>
                      {r.person.job_title && (
                        <p className="text-[9px] text-muted-foreground truncate leading-tight">{r.person.job_title}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="text-center font-semibold tabular-nums">{r.daysWorked} / {r.daysExpected}</td>
                <td className="text-center"><Delta value={r.daysDelta} unit="d" /></td>
                <td className="text-center font-semibold tabular-nums">{r.hoursWorked.toFixed(1)} / {r.hoursExpected}</td>
                <td className="text-center"><Delta value={r.hoursDelta} unit="h" /></td>
                <td className="text-center tabular-nums text-muted-foreground">{r.leaveTakenYTD} / {r.allowance}</td>
                <td className="text-center font-semibold tabular-nums">{r.leaveLeft}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Delta({ value, unit }: { value: number; unit: string }) {
  if (value === 0) return <span className="text-muted-foreground">—</span>;
  const positive = value > 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums",
      positive ? "text-emerald-500" : "text-amber-500"
    )}>
      {positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {positive ? "+" : ""}{Math.round(value)}{unit}
    </span>
  );
}

// Legacy Stat component preserved below in case re-imported elsewhere — kept as no-op export.
function _UnusedStat(_: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  deltaUnit?: string;
}) {
  return null;
}
