export type Property = {
  id: string;
  name: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
};
export type Entry = {
  id: string;
  staff_id: string;
  property_id: string;
  visit_date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  clock_in: string;
  clock_out: string | null;
  adj_in: string | null;
  adj_out: string | null;
  adj_reason: string | null;
  flags: string[];
  reason: string | null;
  note: string | null;
  status: string;
  rounded_hours: number | null;
  timesheet_id: string | null;
  property: Property | null;
};
export type Overview = {
  staff_id: string;
  full_name: string;
  payee_name: string | null;
  visits: number;
  pending_count: number;
  attention_count: number;
  total_hours: number;
  timesheet_id: string | null;
  timesheet_status: string | null;
  timesheet_version: number | null;
};
export type SnapshotLine = {
  kind: string;
  entry_id?: string;
  basis?: "hourly" | "daily";
  date: string | null;
  time_text?: string;
  hours?: number;
  rate?: number;
  amount: number;
  notes?: string;
  description?: string;
};
export type Timesheet = {
  id: string;
  staff_id: string;
  period_start: string;
  period_end: string;
  version: number;
  status: string;
  payee_name: string | null;
  hourly_rate: number | null;
  pay_basis?: PayBasis | null;
  day_rate?: number | null;
  days_paid?: number | null;
  currency: string;
  rounding_minutes: number;
  total_hours: number;
  hours_amount: number;
  adjustments_amount: number;
  total_amount: number;
  lines: SnapshotLine[];
  file_path: string | null;
  issued_at: string;
  issued_by: string | null;
  paid_on: string | null;
  supersedes_id: string | null;
  reopen_reason: string | null;
};
export type Adjustment = {
  id: string;
  kind: string;
  description: string;
  amount: number;
  occurred_on: string | null;
  timesheet_id: string | null;
};
export const reasonLabels = [
  ["weekly_visit", "Weekly visit", "Visita semanal"],
  ["open", "Open", "Apertura"],
  ["shut_down", "Shut down", "Cierre"],
  ["contractors", "Contractors on site", "Contratistas en la casa"],
  ["in_residence", "In residence", "En residencia"],
  ["call_out", "Call-out", "Llamada urgente"],
  ["other", "Other", "Otro"],
] as const;
const flags: Record<string, [string, string]> = {
  outside_in: ["Started away from the house", "Empezó lejos de la casa"],
  outside_out: ["Ended away from the house", "Terminó lejos de la casa"],
  no_location_in: ["No location at start", "Sin ubicación al empezar"],
  no_location_out: ["No location at end", "Sin ubicación al terminar"],
  unscheduled: ["Not on the roster", "Fuera del horario"],
  late_entry: ["Start time entered afterwards", "Inicio registrado después"],
  late_entry_out: ["End time entered afterwards", "Fin registrado después"],
  delayed_sync: ["Sent after signal returned", "Enviado al recuperar señal"],
  delayed_sync_out: [
    "Sent after signal returned",
    "Enviado al recuperar señal",
  ],
  over_12h: ["Over 12 hours", "Más de 12 horas"],
  ended_by_manager: ["End added by you", "Fin añadido por ti"],
  manager_added: ["Added by you", "Añadido por ti"],
};
export function flagLabel(code: string, es = false) {
  return flags[code]?.[es ? 1 : 0] || code.replace(/_/g, " ");
}
export function classification(
  e: Pick<Entry, "status" | "flags" | "clock_out">,
) {
  return e.status === "not_worked"
    ? "not_worked"
    : e.status !== "pending"
      ? "neutral"
      : !e.clock_out || e.flags.length
        ? "attention"
        : "green";
}
export function monthShift(period: string, delta: number) {
  const d = new Date(`${period}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}
export function previousPeriod(now = new Date()) {
  return monthShift(`${now.toISOString().slice(0, 7)}-01`, -1);
}
export function monthEnd(period: string) {
  return new Date(Date.parse(`${monthShift(period, 1)}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
}
export function monthName(period: string, es = false) {
  return new Intl.DateTimeFormat(es ? "es" : "en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period}T12:00:00Z`));
}
export function canIssue(
  period: string,
  entries: Entry[],
  rate: number | null,
  active: boolean,
  now = new Date(),
) {
  return (
    monthShift(period, 1) <= now.toISOString().slice(0, 10) &&
    rate !== null &&
    !active &&
    !entries.some((e) => e.status === "pending" || !e.clock_out)
  );
}
export function safeZone(zone?: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone || "UTC" }).format();
    return zone || "UTC";
  } catch {
    return "UTC";
  }
}
export function localInput(instant: string | null, zone?: string) {
  if (!instant) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(zone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const v = (k: string) => p.find((x) => x.type === k)?.value;
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}
// Enumerate offsets rather than using the browser timezone; nonexistent DST times are rejected.
export function localInstant(value: string, zone?: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a valid date and time");
  const base = Date.parse(value + "Z");
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = new Date(base + offset * 60000).toISOString();
    if (localInput(candidate, zone) === value) return candidate;
  }
  throw new Error("This local time does not exist because the clocks changed");
}
export function timeLabel(instant: string | null, zone?: string) {
  return instant
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: safeZone(zone),
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
        .format(new Date(instant))
        .replace(/\s/g, "")
        .toLowerCase()
    : "—";
}
export function rosterTime(value: string | null) {
  return value ? timeLabel(`2000-01-01T${value.slice(0, 5)}:00Z`, "UTC") : "—";
}
export function hoursFor(e: Entry, rounding = 15) {
  if (e.rounded_hours != null) return Number(e.rounded_hours);
  const end = e.adj_out || e.clock_out;
  if (!end) return 0;
  const minutes =
    (Date.parse(end) - Date.parse(e.adj_in || e.clock_in)) / 60000;
  return Math.max(0, (Math.round(minutes / rounding) * rounding) / 60);
}
export function waitingPeriod(
  rows: { period_start: string; status: string }[],
  fallback = previousPeriod(),
) {
  return (
    rows
      .filter((r) => !["issued", "paid"].includes(r.status))
      .sort((a, b) => b.period_start.localeCompare(a.period_start))[0]
      ?.period_start || fallback
  );
}

export type PayBasis = "hourly" | "daily" | "payroll";
export type DayLabel = "full" | "same";
/** Preview with the server's rule: hourly = rounded hours x rate; daily = one day's pay per distinct visit_date (first by clock-in), not_worked excluded. */
export function payPreview(entries: Entry[], basis: PayBasis, rate: number | null, rounding = 15) {
  const counted = entries.filter((e) => e.status !== "not_worked");
  const hours = counted.reduce((sum, e) => sum + hoursFor(e, rounding), 0);
  const labels: Record<string, DayLabel> = {};
  const amounts: Record<string, number> = {};
  const dates = new Set<string>();
  [...counted]
    .sort((a, b) => a.visit_date.localeCompare(b.visit_date) || a.clock_in.localeCompare(b.clock_in))
    .forEach((e) => {
      if (basis === "daily") {
        const first = !dates.has(e.visit_date);
        dates.add(e.visit_date);
        labels[e.id] = first ? "full" : "same";
        amounts[e.id] = first ? rate || 0 : 0;
      } else amounts[e.id] = basis === "payroll" ? 0 : Math.round(hoursFor(e, rounding) * (rate || 0) * 100) / 100;
    });
  const amount = Object.values(amounts).reduce((a, b) => a + b, 0);
  return { hours, visits: counted.length, days: dates.size, amount: basis === "payroll" ? 0 : Math.round(amount * 100) / 100, labels, amounts };
}
/** After issue: labels, hours and amounts come only from the snapshot lines. */
export function snapshotByEntry(lines: SnapshotLine[] | null | undefined) {
  const out: Record<string, { hours: number; amount: number; label?: DayLabel }> = {};
  (Array.isArray(lines) ? lines : []).forEach((l) => {
    if (l.kind !== "visit" || !l.entry_id) return;
    out[l.entry_id] = { hours: Number(l.hours || 0), amount: Number(l.amount || 0), label: l.basis === "daily" ? (Number(l.amount) > 0 ? "full" : "same") : undefined };
  });
  return out;
}
export function rateFor(basis: PayBasis, s: { hourly_rate?: number | null; daily_rate?: number | null } | null | undefined) {
  const v = basis === "daily" ? s?.daily_rate : basis === "hourly" ? s?.hourly_rate : null;
  return v == null ? null : Number(v);
}
