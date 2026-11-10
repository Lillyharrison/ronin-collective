// Server-side calendar date helpers (pure, no Deno APIs — unit tested from vitest).
// Convention: all-day entries are start = date 00:00 UTC, end = last inclusive date 23:59 UTC.

const pad = (n: number) => String(n).padStart(2, "0");

/** Task/repair dates are UTC-midnight stamps; non-midnight stamps remain moments. */
export function isDateOnlyStamp(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?(?:Z|\+00:00)$/.test(iso)
    && !Number.isNaN(new Date(iso).getTime());
}

export function dateInputToStamp(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date input");
  return `${date}T00:00:00.000Z`;
}

/** Servers have no viewer zone; use an explicit house zone, falling back to UTC. */
export function stampDateKey(iso: string, timezone: unknown = "UTC"): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date stamp");
  const tz = isDateOnlyStamp(iso) ? "UTC" : isValidTimeZone(timezone) ? timezone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatStampDate(iso: string, month: "long" | "short" = "short"): string {
  const key = stampDateKey(iso);
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month, day: "numeric" });
}

export function previousDateStamp(iso: string, timezone: unknown): string {
  const key = stampDateKey(iso, timezone);
  const d = new Date(dateInputToStamp(key));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

function zoneOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - Math.floor(ms / 1000) * 1000;
}

/** Wall clock in `tz` → UTC ms. */
export function wallToUtcMs(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ms = guess - zoneOffsetMs(guess, tz);
  const second = guess - zoneOffsetMs(ms, tz);
  if (second !== ms) ms = second;
  return ms;
}

function utcDateKey(iso: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Describe an event for a briefing. All-day: dates only. Timed: in the house zone with
 * the zone name, because the server does not know the reader's zone.
 */
export function describeEventWhen(
  ev: { start_date?: unknown; end_date?: unknown; all_day?: unknown },
  propertyTimezone: unknown,
  style: "long" | "short" = "long",
): string {
  const start = typeof ev.start_date === "string" ? ev.start_date : null;
  if (!start) return "TBD";
  const end = typeof ev.end_date === "string" && ev.end_date ? ev.end_date : null;
  const dateOpts: Intl.DateTimeFormatOptions = style === "long"
    ? { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    : { month: "long", day: "numeric" };
  if (ev.all_day === true) {
    const s = utcDateKey(start);
    if (!s) return "TBD";
    const e = end ? utcDateKey(end) : null;
    const fmt = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { ...dateOpts, timeZone: "UTC" });
    return e && e > s ? `${fmt(s)} → ${fmt(e)} (all day)` : `${fmt(s)} (all day)`;
  }
  const tz = isValidTimeZone(propertyTimezone) ? propertyTimezone : "UTC";
  const timeOpts: Intl.DateTimeFormatOptions = { ...dateOpts, hour: "numeric", minute: "2-digit", timeZone: tz };
  const sd = new Date(start);
  if (Number.isNaN(sd.getTime())) return "TBD";
  let out = sd.toLocaleString("en-US", timeOpts);
  if (end && end !== start) {
    const ed = new Date(end);
    if (!Number.isNaN(ed.getTime())) out += ` → ${ed.toLocaleString("en-US", timeOpts)}`;
  }
  return `${out} (${tz} time)`;
}

/**
 * Parse an iCal DTSTART/DTEND property. `params` is the text between the property name
 * and the colon (e.g. ";TZID=America/Los_Angeles" or ";VALUE=DATE").
 */
export function parseICalDateProp(params: string, value: string): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly || /VALUE=DATE(?!-)/i.test(params)) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { iso: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "00"].map(Number);
  if (m[7]) return { iso: new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString(), allDay: false };
  const tzMatch = /TZID=("?)([^;:"]+)\1/i.exec(params);
  const tz = tzMatch?.[2];
  if (tz && isValidTimeZone(tz)) return { iso: new Date(wallToUtcMs(y, mo, d, h, mi, s, tz)).toISOString(), allDay: false };
  // Floating time with no usable zone: keep previous behaviour (treated as UTC).
  return { iso: new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString(), allDay: false };
}

/** Build stored start/end/all_day from parsed iCal DTSTART/DTEND (all-day DTEND is exclusive). */
export function icalToStored(
  start: { iso: string; allDay: boolean },
  end: { iso: string; allDay: boolean } | null,
): { start_date: string; end_date: string | null; all_day: boolean } {
  if (start.allDay) {
    let last = start.iso;
    if (end?.allDay) {
      const [y, m, d] = end.iso.split("-").map(Number);
      const prev = new Date(Date.UTC(y, m - 1, d - 1));
      const key = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
      if (key > last) last = key;
    }
    return { all_day: true, start_date: `${start.iso}T00:00:00.000Z`, end_date: `${last}T23:59:00.000Z` };
  }
  return { all_day: false, start_date: start.iso, end_date: end && !end.allDay ? end.iso : null };
}
