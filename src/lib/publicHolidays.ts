/**
 * Public holidays come from the staff schedule itself: any day where someone has an approved
 * "Public Holiday" day off logged becomes a public holiday for everyone on the schedule.
 */
export const HOLIDAY_LEAVE_PREFIX = "holiday:";
export const isAutoHolidayLeave = (id?: string | null) => !!id && id.startsWith(HOLIDAY_LEAVE_PREFIX);

type Leave = { id: string; staff_id: string; start_date: string; end_date: string; leave_type: string; status: string; reason: string | null; reviewed_by: string | null; reviewed_at: string | null; created_by: string | null };
type Person = { id: string; start_date?: string | null };

// Pure string math on the plain YYYY-MM-DD key — no Date parsing, so no timezone can shift it.
function addDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let ny = y, nm = m, nd = day + 1;
  if (nd > daysInMonth[m - 1]) { nd = 1; nm++; if (nm > 12) { nm = 1; ny++; } }
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Dates (YYYY-MM-DD) in [from, to] that have an approved public-holiday entry for anyone. */
export function loggedHolidayDates(leaves: Leave[], from: string, to: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const l of leaves) {
    if (l.leave_type !== "public_holiday" || l.status !== "approved") continue;
    for (let d = l.start_date < from ? from : l.start_date; d <= l.end_date && d <= to; d = addDay(d)) {
      if (!out.has(d) || (!out.get(d) && l.reason)) out.set(d, l.reason);
    }
  }
  return out;
}

/**
 * Adds an automatic approved public-holiday day off for every person on each logged holiday.
 * Skipped when the person already has non-rejected leave that day or starts later. Nothing is saved.
 */
export function withPublicHolidays<T extends Leave>(leaves: T[], people: Person[], from: string, to: string): T[] {
  const out = [...leaves];
  for (const [date, reason] of loggedHolidayDates(leaves, from, to)) {
    for (const p of people) {
      if (p.start_date && p.start_date > date) continue;
      if (leaves.some(l => l.staff_id === p.id && l.status !== "rejected" && l.start_date <= date && l.end_date >= date)) continue;
      out.push({ id: `${HOLIDAY_LEAVE_PREFIX}${date}:${p.id}`, staff_id: p.id, start_date: date, end_date: date,
        leave_type: "public_holiday", status: "approved", reason, reviewed_by: null, reviewed_at: null, created_by: null } as T);
    }
  }
  return out;
}
