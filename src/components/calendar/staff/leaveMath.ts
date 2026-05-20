import {
  differenceInCalendarDays,
  endOfYear,
  format,
  isWeekend,
  parseISO,
  startOfYear,
} from "date-fns";
import type { StaffLeaveRequest } from "@/hooks/useStaffSchedules";
import type { Profile } from "./types";

export const toDateKey = (date: Date) => format(date, "yyyy-MM-dd");

export function normalizeDateKey(value?: string | null): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? null;
}

export function isEmployedOn(person: Profile | undefined, dateKey: string) {
  const startDate = normalizeDateKey(person?.start_date);
  return !startDate || dateKey >= startDate;
}

export function isEmployedDuringRange(person: Profile, rangeStart: Date, rangeEnd: Date) {
  const startDate = normalizeDateKey(person.start_date);
  return !startDate || startDate <= toDateKey(rangeEnd);
}

export function getEmploymentRange(person: Profile, rangeStart: Date, rangeEnd: Date) {
  const startKey = toDateKey(rangeStart);
  const endKey = toDateKey(rangeEnd);
  const employeeStart = normalizeDateKey(person.start_date);
  const effectiveStart = employeeStart && employeeStart > startKey ? employeeStart : startKey;

  if (effectiveStart > endKey) return null;

  return {
    startKey: effectiveStart,
    endKey,
    start: parseISO(effectiveStart),
    end: rangeEnd,
  };
}

export function calculateExpectedWork(person: Profile, rangeStart: Date, rangeEnd: Date) {
  const employedRange = getEmploymentRange(person, rangeStart, rangeEnd);
  if (!employedRange) return { daysExpected: 0, hoursExpected: 0 };

  const totalDays = differenceInCalendarDays(employedRange.end, employedRange.start) + 1;
  const weeksInRange = totalDays / 7;
  const contractedDays = person.contracted_days_per_week ?? 5;
  const contractedHours = person.contracted_hours_per_week ?? 40;

  return {
    daysExpected: Math.round(contractedDays * weeksInRange),
    hoursExpected: contractedHours * weeksInRange,
  };
}

export function calcWorkdaysBetween(startKey: string, endKey: string): number {
  if (!startKey || !endKey || startKey > endKey) return 0;
  let cursor = parseISO(startKey);
  const end = parseISO(endKey);
  let count = 0;

  while (cursor <= end) {
    if (!isWeekend(cursor)) count += 1;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return count;
}

export function calculateAccruedAnnualLeave(person: Profile, asOf: Date) {
  const annualAllowance = person.annual_leave_days ?? 25;
  const yearStart = startOfYear(asOf);
  const yearEnd = endOfYear(asOf);
  const employeeStartKey = normalizeDateKey(person.start_date);
  const employeeStart = employeeStartKey ? parseISO(employeeStartKey) : yearStart;

  if (employeeStart > yearEnd || employeeStart > asOf) return 0;

  const accrualStart = employeeStart > yearStart ? employeeStart : yearStart;
  const monthsAccrued = (asOf.getFullYear() - accrualStart.getFullYear()) * 12
    + (asOf.getMonth() - accrualStart.getMonth())
    + 1;

  return Math.round((annualAllowance * Math.max(0, Math.min(12, monthsAccrued)) / 12) * 10) / 10;
}

export function calculateAnnualLeaveTakenYTD(
  person: Profile,
  leaveRequests: StaffLeaveRequest[],
  asOf: Date,
) {
  const yearStartKey = toDateKey(startOfYear(asOf));
  const asOfKey = toDateKey(asOf);
  const employeeStart = normalizeDateKey(person.start_date);
  const lowerBound = employeeStart && employeeStart > yearStartKey ? employeeStart : yearStartKey;

  return leaveRequests
    .filter((lr) => lr.staff_id === person.id && lr.status === "approved" && lr.leave_type === "vacation")
    .reduce((sum, lr) => {
      const leaveStart = normalizeDateKey(lr.start_date);
      const leaveEnd = normalizeDateKey(lr.end_date);
      if (!leaveStart || !leaveEnd) return sum;

      const start = leaveStart > lowerBound ? leaveStart : lowerBound;
      const end = leaveEnd < asOfKey ? leaveEnd : asOfKey;
      return sum + calcWorkdaysBetween(start, end);
    }, 0);
}

export function formatLeaveDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}