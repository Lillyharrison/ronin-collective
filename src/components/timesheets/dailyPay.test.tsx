import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./api", () => ({ db: { rpc: vi.fn() }, result: vi.fn(), allRows: vi.fn(), monthEntries: vi.fn(), sheetColumns: "id", sheetById: vi.fn() }));
vi.mock("./excel", async (orig) => ({ ...(await orig<typeof import("./excel")>()), downloadSheet: vi.fn() }));
import { payPreview, snapshotByEntry, type Entry, type Timesheet } from "./logic";
import { buildWorkbook } from "./excel";
import { orderOverview, overviewStatus } from "./presentation";
import { TimesheetDetail } from "./TimesheetDetail";
import { TIME_SETTING_QUERY_KEYS, invalidateTimeSettings } from "@/components/team/memberAccess";

const prop = { id: "p", name: "Rockingham", timezone: "America/Los_Angeles", latitude: null, longitude: null, geofence_radius_m: 100 };
const e = (id: string, date: string, inAt: string, hours: number, status = "approved") => ({ id, staff_id: "m", property_id: "p", visit_date: date, scheduled_start: null, scheduled_end: null, clock_in: `${date}T${inAt}:00Z`, clock_out: `${date}T23:00:00Z`, adj_in: null, adj_out: null, adj_reason: null, flags: [], reason: null, note: null, status, rounded_hours: hours, timesheet_id: null, property: prop }) as Entry;
const entries = [e("b", "2026-10-02", "18:00", 2), e("a", "2026-10-02", "15:00", 3), e("c", "2026-10-03", "15:00", 4), e("x", "2026-10-04", "15:00", 5, "not_worked")];

describe("daily preview math", () => {
  it("pays one day per date, first visit by clock-in, excludes not worked", () => {
    const p = payPreview(entries, "daily", 200);
    expect(p.days).toBe(2);
    expect(p.hours).toBe(9);
    expect(p.amount).toBe(400);
    expect(p.labels).toEqual({ a: "full", b: "same", c: "full" });
    expect(p.amounts.b).toBe(0);
  });
  it("hourly unchanged, payroll has no amount", () => {
    expect(payPreview(entries, "hourly", 10).amount).toBe(90);
    expect(payPreview(entries, "payroll", null).amount).toBe(0);
  });
});

afterEach(cleanup);
function show(settings: object, sheets: Timesheet[] = [], list = entries) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  c.setQueryData(["timesheet-detail", "admin", "m", "2026-10-01"], { entries: list, visits: [], sheets, adjustments: [], settings, profile: { full_name: "Muaz" }, properties: [prop] });
  c.setQueryData(["timesheet-history", "admin", "m", 25], []);
  c.setQueryData(["timesheet-audit", "admin", "m", "2026-10-01", 50], { events: [], names: {} });
  c.setQueryData(["timesheet-issuers", "admin", []], {});
  return render(<QueryClientProvider client={c}><TimesheetDetail staff="m" period="2026-10-01" es={false} userId="admin" /></QueryClientProvider>);
}
describe("month detail", () => {
  it("daily summary shows days, hours, amount and card labels", () => {
    show({ pay_basis: "daily", daily_rate: 200, currency: "USD" });
    expect(screen.getByText("2 days, 9 h")).toBeInTheDocument();
    expect(screen.getByText("$400.00")).toBeInTheDocument();
    expect(screen.getAllByText("Full day")).toHaveLength(2);
    expect(screen.getAllByText("Same day")).toHaveLength(1);
  });
  it("payroll hides the amount and Issue button", () => {
    show({ pay_basis: "payroll", currency: "USD" });
    expect(screen.getByText("TriNet payroll")).toBeInTheDocument();
    expect(screen.getByText("Paid through TriNet. Hours are recorded for reference.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Issue timesheet" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
  it("missing day rate shows note and keeps Issue disabled", () => {
    show({ pay_basis: "daily", daily_rate: null, currency: "USD" });
    expect(screen.getByText("No rate yet. Add it in the Contract tab.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue timesheet" })).toBeDisabled();
  });
  it("after issue, labels and amounts come from the snapshot, not settings", () => {
    const sheet = { id: "s", status: "issued", issued_at: "2026-11-02T12:00:00Z", issued_by: null, version: 1, pay_basis: "daily", day_rate: 150, days_paid: 1, hourly_rate: null, currency: "USD", total_hours: 7, hours_amount: 150, adjustments_amount: 0, total_amount: 150, payee_name: "Muaz",
      lines: [{ kind: "visit", entry_id: "a", basis: "daily", date: "2026-10-02", hours: 3, rate: 150, amount: 150 }, { kind: "visit", entry_id: "c", basis: "daily", date: "2026-10-03", hours: 4, rate: 150, amount: 0, notes: "Same day, already paid" }] } as unknown as Timesheet;
    show({ pay_basis: "daily", daily_rate: 999, currency: "USD" }, [sheet], [entries[1], entries[2]]);
    expect(screen.getByText("1 day, 7 h")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getAllByText("Full day")).toHaveLength(1);
    expect(screen.getAllByText("Same day")).toHaveLength(1);
    expect(snapshotByEntry(sheet.lines).c).toEqual({ hours: 4, amount: 0, label: "same" });
  });
});

describe("daily Excel", () => {
  const sheet = { payee_name: "Muaz", period_start: "2026-10-01", version: 1, pay_basis: "daily", day_rate: 200, days_paid: 2, hourly_rate: null, currency: "USD", rounding_minutes: 15, total_hours: 9, total_amount: 410, ssn: "NO", address: "NO",
    lines: [
      { kind: "visit", basis: "daily", date: "2026-10-02", time_text: "8:00am - 11:00am", hours: 3, rate: 200, amount: 200 },
      { kind: "visit", basis: "daily", date: "2026-10-02", time_text: "11:00am - 1:00pm", hours: 2, rate: 200, amount: 0, notes: "Same day, already paid" },
      { kind: "visit", basis: "daily", date: "2026-10-03", time_text: "8:00am - 12:00pm", hours: 4, rate: 200, amount: 200 },
      { kind: "expense", date: "2026-10-03", description: "Taxi", amount: 10 },
    ] } as unknown as Timesheet;
  const ws = buildWorkbook(sheet, "Profile").getWorksheet("Time sheet")!;
  it("headings, title with days and footnote", () => {
    expect([1, 2, 3, 4, 5, 6].map(i => ws.getCell(3, i).value)).toEqual(["Date", "Time", "Hours", "Day rate", "Amount", "Notes"]);
    expect(ws.getCell("A2").value).toBe("October 2026, 2 days");
    expect(ws.getCell("A9").value).toBe("Paid by the day: one full day's pay for each day worked. Hours are shown for reference.");
  });
  it("plain number amounts, empty same-day rate, totals", () => {
    expect(ws.getCell("E4").value).toBe(200);
    expect(ws.getCell("D4").value).toBe(200);
    expect(ws.getCell("D5").value).toBeNull();
    expect(ws.getCell("E5").value).toBe(0);
    expect(ws.getCell("C5").value).toBe(2);
    expect(ws.getCell("B5").value).toBe("11:00am - 1:00pm");
    expect(ws.getCell("E4").numFmt).toContain("#,##0.00");
    expect(ws.getCell("B7").value).toBe("Expense: Taxi");
    expect(ws.getCell("C8").value).toEqual({ formula: "SUBTOTAL(109,C4:C7)", result: 9 });
    expect(ws.getCell("E8").value).toEqual({ formula: "SUBTOTAL(109,E4:E7)", result: 410 });
  });
  it("no personal data beyond payee name", () => {
    const text: string[] = [];
    ws.eachRow(r => r.eachCell(c => text.push(String(c.value))));
    expect(text.join(" ")).not.toContain("NO ");
    expect(text).not.toContain("Profile");
  });
});

describe("people list and sync", () => {
  const row = (id: string, pending = 0) => ({ staff_id: id, full_name: id, payee_name: null, visits: 1, pending_count: pending, attention_count: 0, total_hours: 1, timesheet_id: null, timesheet_status: null, timesheet_version: null });
  it("payroll gets its chip and sorts below review and ready", () => {
    expect(overviewStatus(row("a"), "payroll")).toBe("payroll");
    expect(overviewStatus(row("a"), "daily")).toBe("ready");
    expect(orderOverview([row("a"), row("b"), row("c", 2)], { a: "payroll" }).map(r => r.staff_id)).toEqual(["c", "b", "a"]);
  });
  it("editor and Timesheets settings invalidate the same keys", () => {
    const qc = { invalidateQueries: vi.fn() };
    invalidateTimeSettings(qc);
    const keys = qc.invalidateQueries.mock.calls.map(c => c[0].queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(["timesheet-settings", "staff-time-setting", "timesheet-detail", "timesheet-overview"]));
    expect(keys).toHaveLength(TIME_SETTING_QUERY_KEYS.length);
  });
});
