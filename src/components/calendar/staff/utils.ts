// Pure helpers for the Staff Calendar feature.
// Extracted from StaffCalendarTab.tsx (Step 1 refactor) — no behavior changes.

import { format, getDay, eachDayOfInterval, parseISO, isWeekend } from "date-fns";
import type { StaffSchedule, StaffShift, StaffLeaveRequest } from "@/hooks/useStaffSchedules";
import { PROPERTY_COLORS, PROPERTY_COLOR_OVERRIDES } from "./constants";
import type { Profile, Property, DisplayShift } from "./types";

/** Returns a human-readable label for a profile, using job title for drafts. */
export function getDisplayName(p: Profile | undefined | null, fallback = "Staff"): string {
  if (!p) return fallback;
  if (p.full_name) return p.full_name;
  if (p.is_draft) return p.job_title ? `[${p.job_title}]` : "[Draft]";
  return fallback;
}

export function propColor(propId: string | null, properties: Property[]) {
  if (!propId) return PROPERTY_COLORS[PROPERTY_COLORS.length - 1];
  const prop = properties.find((p) => p.id === propId);
  if (prop) {
    const nameLower = prop.name.toLowerCase();
    for (const [key, colorIdx] of Object.entries(PROPERTY_COLOR_OVERRIDES)) {
      if (nameLower.includes(key)) return PROPERTY_COLORS[colorIdx % PROPERTY_COLORS.length];
    }
  }
  const idx = properties.findIndex((p) => p.id === propId);
  return PROPERTY_COLORS[Math.abs(idx) % PROPERTY_COLORS.length];
}

export function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m}${hour < 12 ? "am" : "pm"}`;
}

export function calcWorkdays(start: string, end: string): number {
  if (!start || !end) return 0;
  const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) });
  return days.filter((d) => !isWeekend(d)).length;
}

/** Build display shifts from recurring schedules + concrete shifts + approved leave. */
export function buildDisplayShifts(
  weekDays: Date[],
  schedules: StaffSchedule[],
  concreteShifts: StaffShift[],
  leaveRequests: StaffLeaveRequest[],
): DisplayShift[] {
  const result: DisplayShift[] = [];

  for (const day of weekDays) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dow = getDay(day); // 0=Sun … 6=Sat

    // ─ Pattern-based shifts for this day ──────────────────────────────────────
    for (const sched of schedules) {
      if (sched.day_of_week !== dow) continue;
      if (!sched.is_active) continue;
      if (sched.effective_from > dateStr) continue;
      if (sched.effective_to && sched.effective_to < dateStr) continue;

      const staffId = sched.staff_id;

      // Approved leave → show leave block (deduplicate: only once per staff/day)
      const onLeave = leaveRequests.some(
        (lr) =>
          lr.staff_id === staffId &&
          lr.status === "approved" &&
          lr.start_date <= dateStr &&
          lr.end_date >= dateStr,
      );
      if (onLeave) {
        if (!result.find((r) => r.staff_id === staffId && r.shift_date === dateStr && r.is_leave)) {
          result.push({
            key: `leave-${staffId}-${dateStr}`,
            staff_id: staffId,
            property_id: null,
            schedule_id: null,
            concrete_id: null,
            shift_date: dateStr,
            start_time: null,
            end_time: null,
            status: "leave",
            notes: null,
            is_virtual: false,
            is_leave: true,
          });
        }
        continue;
      }

      // Concrete override for this schedule + date?
      const override = concreteShifts.find(
        (s) => s.staff_id === staffId && s.shift_date === dateStr && s.schedule_id === sched.id,
      );

      if (override?.status === "cancelled") continue; // cancelled for this specific day

      if (override?.status === "scheduled") {
        result.push({
          key: override.id,
          staff_id: staffId,
          property_id: override.property_id,
          schedule_id: sched.id,
          concrete_id: override.id,
          shift_date: dateStr,
          start_time: override.start_time ?? sched.start_time,
          end_time: override.end_time ?? sched.end_time,
          status: "scheduled",
          notes: override.notes,
          is_virtual: false,
          is_leave: false,
        });
        continue;
      }

      // Virtual shift from recurring pattern
      result.push({
        key: `virtual-${sched.id}-${dateStr}`,
        staff_id: staffId,
        property_id: sched.property_id,
        schedule_id: sched.id,
        concrete_id: null,
        shift_date: dateStr,
        start_time: sched.start_time,
        end_time: sched.end_time,
        status: "scheduled",
        notes: sched.notes,
        is_virtual: true,
        is_leave: false,
      });
    }

    // ─ Concrete one-off shifts (no schedule_id) ───────────────────────────────
    for (const shift of concreteShifts) {
      if (shift.shift_date !== dateStr || shift.schedule_id || shift.status !== "scheduled") continue;
      result.push({
        key: shift.id,
        staff_id: shift.staff_id,
        property_id: shift.property_id,
        schedule_id: null,
        concrete_id: shift.id,
        shift_date: dateStr,
        start_time: shift.start_time,
        end_time: shift.end_time,
        status: "scheduled",
        notes: shift.notes,
        is_virtual: false,
        is_leave: false,
      });
    }
  }

  return result;
}
