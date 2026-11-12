import { classification, flagLabel, monthShift, type Entry, type Overview } from "./logic";
import { localDateKey } from "@/lib/calendarTime";

export function visitPresentation(entry: Entry, issued = false) {
  const tone = issued || entry.status !== "pending" ? "grey" : classification({ ...entry, clock_out: entry.adj_out || entry.clock_out }) === "green" ? "green" : "amber";
  return { tone, actionable: !issued && entry.status === "pending", struck: entry.status === "not_worked" } as const;
}

export function visitFlags(entry: Entry) {
  const codes = [...new Set([...(entry.adj_out || entry.clock_out ? [] : ["still_open"]), ...entry.flags])];
  const priority = (code: string) => code === "still_open" ? 0 : code === "unscheduled" ? 1 : code.startsWith("outside_") ? 2 : code.startsWith("no_location_") ? 3 : code.startsWith("late_entry") || code === "manager_added" ? 4 : 5;
  return codes.sort((a, b) => priority(a) - priority(b));
}

export function flagSentence(entry: Entry, es = false) {
  const codes = visitFlags(entry);
  if (!codes.length) return "";
  const first = codes[0] === "still_open" ? (es ? "Sigue trabajando" : "Still clocked in") : flagLabel(codes[0], es);
  return first + (codes.length > 1 ? ` +${codes.length - 1} ${es ? "más" : "more"}` : "");
}

export function mainStep(entries: Entry[], period: string, status?: string, now = new Date()) {
  if (status === "paid") return { kind: "paid", count: 0 } as const;
  if (status === "issued") return { kind: "issued", count: 0 } as const;
  const open = entries.filter(e => e.status !== "not_worked" && !(e.adj_out || e.clock_out));
  if (open.length) return { kind: "open", count: open.length, entry: open[0] } as const;
  const pending = entries.filter(e => e.status === "pending" && !!(e.adj_out || e.clock_out));
  if (pending.length) return { kind: "pending", count: pending.length, ids: pending.map(e => e.id) } as const;
  return { kind: monthShift(period, 1) <= localDateKey(now) ? "ready" : "unfinished", count: 0 } as const;
}

export function overviewStatus(row: Overview) {
  return row.timesheet_status === "paid" ? "paid" : row.timesheet_status === "issued" ? "issued" : Math.max(row.attention_count, row.pending_count) > 0 ? "review" : "ready";
}
export function orderOverview(rows: Overview[]) {
  const rank = { review: 0, ready: 1, issued: 2, paid: 3 };
  return [...rows].sort((a, b) => rank[overviewStatus(a)] - rank[overviewStatus(b)] || a.full_name.localeCompare(b.full_name));
}