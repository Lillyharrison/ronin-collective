/**
 * Single source of truth for calendar dates and times.
 *
 * ALL-DAY entries are tied to a DATE. Stored as start = date 00:00 UTC and
 * end = last (inclusive) date 23:59 UTC. Their dates are always read from the
 * UTC date parts — never converted to the viewer's zone.
 *
 * TIMED entries are a true moment and are shown in the viewer's local zone.
 *
 * Dates returned for bucketing are local-midnight `Date`s so they can be
 * compared with the calendar grid's local days.
 */

export interface CalendarTimeLike {
  start_date: string;
  end_date?: string | null;
  all_day?: boolean | null;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local yyyy-MM-dd key of a Date. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse 'YYYY-MM-DD' (or the date part of a longer string) as a LOCAL date, never UTC. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** yyyy-MM-dd of the UTC date parts of an ISO moment. */
export function utcDateKey(iso: string): string | null {
  if (DATE_ONLY.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Start of the entry: exact moment for timed, local-midnight of the date for all-day. */
export function eventStart(ev: CalendarTimeLike): Date {
  if (ev.all_day) return parseDateOnly(utcDateKey(ev.start_date)) ?? new Date(NaN);
  return new Date(ev.start_date);
}

/** End of the entry (falls back to the start). All-day returns the last day's local midnight. */
export function eventEnd(ev: CalendarTimeLike): Date {
  const end = ev.end_date || ev.start_date;
  if (ev.all_day) return parseDateOnly(utcDateKey(end)) ?? new Date(NaN);
  return new Date(end);
}

/** First and last local calendar day the entry occupies. */
export function eventDayRange(ev: CalendarTimeLike): { start: Date; end: Date } {
  const start = startOfLocalDay(eventStart(ev));
  let end = startOfLocalDay(eventEnd(ev));
  if (end < start) end = start;
  return { start, end };
}

export function eventDayKeys(ev: CalendarTimeLike): { start: string; end: string } {
  const r = eventDayRange(ev);
  return { start: localDateKey(r.start), end: localDateKey(r.end) };
}

export function isMultiDayEvent(ev: CalendarTimeLike): boolean {
  if (!ev.end_date) return false;
  const r = eventDayRange(ev);
  return r.end.getTime() > r.start.getTime();
}

export function eventOccursOn(ev: CalendarTimeLike, day: Date): boolean {
  const r = eventDayRange(ev);
  const d = startOfLocalDay(day).getTime();
  return d >= r.start.getTime() && d <= r.end.getTime();
}

/** Human description: dates only for all-day; viewer-local date + time for timed. */
export function formatEventWhen(ev: CalendarTimeLike, locale = "en-US"): string {
  const s = eventStart(ev);
  if (Number.isNaN(s.getTime())) return "—";
  const dateOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { ...dateOpts, hour: "numeric", minute: "2-digit" };
  const r = eventDayRange(ev);
  if (ev.all_day) {
    const a = s.toLocaleDateString(locale, dateOpts);
    return r.end > r.start ? `${a} – ${r.end.toLocaleDateString(locale, dateOpts)}` : a;
  }
  const a = s.toLocaleString(locale, timeOpts);
  if (!ev.end_date || ev.end_date === ev.start_date) return a;
  const e = eventEnd(ev);
  const sameDay = r.end.getTime() === r.start.getTime();
  return `${a} – ${sameDay ? e.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) : e.toLocaleString(locale, timeOpts)}`;
}

// ─── Time zones ──────────────────────────────────────────────────────────────

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** A house zone if valid; otherwise null (caller falls back to viewer's zone). */
export function houseTimeZone(tz: string | null | undefined): string | null {
  return isValidTimeZone(tz) ? tz : null;
}

/** "America/Los_Angeles" → "Los Angeles". */
export function timeZoneLabel(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

function zoneParts(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

function zoneOffsetMs(ms: number, tz: string): number {
  const p = zoneParts(ms, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Wall time 'yyyy-MM-ddTHH:mm' in `tz` (null = viewer zone) → true moment. */
export function wallTimeToUtc(wall: string, tz: string | null): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall);
  if (!m) return new Date(NaN);
  const zone = tz ?? viewerTimeZone();
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = guess - zoneOffsetMs(guess, zone);
  const second = guess - zoneOffsetMs(ms, zone);
  if (second !== ms) ms = second;
  return new Date(ms);
}

/** True moment → wall time 'yyyy-MM-ddTHH:mm' in `tz` (null = viewer zone). */
export function utcToWallTime(iso: string, tz: string | null): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const p = zoneParts(ms, tz ?? viewerTimeZone());
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

// ─── All-day storage convention ─────────────────────────────────────────────

export const allDayStartIso = (date: string) => `${date}T00:00:00.000Z`;
export const allDayEndIso = (date: string) => `${date}T23:59:00.000Z`;

/** Inclusive start/end dates of an all-day entry, from UTC date parts. */
export function allDayDates(ev: CalendarTimeLike): { start: string; end: string } {
  const start = utcDateKey(ev.start_date) ?? "";
  const end = (ev.end_date && utcDateKey(ev.end_date)) || start;
  return { start, end: end < start ? start : end };
}

// ─── Birthdays ──────────────────────────────────────────────────────────────

/** Birthday ('YYYY-MM-DD') as a local date in `year`. 29 Feb falls on 28 Feb in non-leap years. */
export function birthdayInYear(birthday: string | null | undefined, year: number): Date | null {
  const b = parseDateOnly(birthday);
  if (!b) return null;
  const month = b.getMonth();
  const day = b.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

// ─── Event form ─────────────────────────────────────────────────────────────

export interface EventFormTimes {
  all_day: boolean;
  /** 'yyyy-MM-dd' when all_day, otherwise 'yyyy-MM-ddTHH:mm' wall time */
  start: string;
  end: string;
}

/** Load an entry into form fields. Timed entries are shown in the house zone (or viewer zone). */
export function eventToFormTimes(ev: CalendarTimeLike, tz: string | null): EventFormTimes {
  if (ev.all_day) {
    const d = allDayDates(ev);
    return { all_day: true, start: d.start, end: d.end };
  }
  return {
    all_day: false,
    start: utcToWallTime(ev.start_date, tz),
    end: ev.end_date ? utcToWallTime(ev.end_date, tz) : "",
  };
}

/** Convert form fields into stored values. */
export function formTimesToEvent(f: EventFormTimes, tz: string | null): { start_date: string; end_date: string | null; all_day: boolean } {
  if (f.all_day) {
    const start = f.start.slice(0, 10);
    let end = (f.end || f.start).slice(0, 10);
    if (end < start) end = start;
    return { all_day: true, start_date: allDayStartIso(start), end_date: allDayEndIso(end) };
  }
  return {
    all_day: false,
    start_date: wallTimeToUtc(f.start, tz).toISOString(),
    end_date: f.end ? wallTimeToUtc(f.end, tz).toISOString() : null,
  };
}

/** Switching the "All day" toggle keeps the chosen dates. */
export function toggleAllDay(f: EventFormTimes, allDay: boolean): EventFormTimes {
  if (allDay === f.all_day) return f;
  if (allDay) return { all_day: true, start: f.start.slice(0, 10), end: (f.end || f.start).slice(0, 10) };
  return { all_day: false, start: f.start ? `${f.start.slice(0, 10)}T09:00` : "", end: f.end ? `${f.end.slice(0, 10)}T10:00` : "" };
}
