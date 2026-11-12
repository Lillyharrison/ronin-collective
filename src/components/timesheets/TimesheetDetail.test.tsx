import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { Entry, Timesheet } from "./logic";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: true, error: null })) }));
vi.mock("./api", () => ({ db: { rpc: mocks.rpc }, result: async (p: Promise<{data: unknown}>) => (await p).data, allRows: vi.fn(), monthEntries: vi.fn(), sheetColumns: "id", sheetById: vi.fn() }));
vi.mock("./excel", () => ({ downloadSheet: vi.fn() }));
import { TimesheetDetail } from "./TimesheetDetail";
const entry = { id: "visit", staff_id: "mercy", property_id: "park", visit_date: "2026-10-26", scheduled_start: "18:00", scheduled_end: "19:30", clock_in: "2026-10-26T22:08:00Z", clock_out: "2026-10-26T23:34:00Z", flags: ["outside_out"], status: "pending", rounded_hours: 1.5, property: { id: "park", name: "502 Park", timezone: "America/New_York" } } as Entry;
const sheet = { id: "issued", status: "issued", issued_at: "2026-11-02T12:00:00Z", issued_by: "admin", version: 1, hourly_rate: 50, currency: "USD", total_hours: 1.5, hours_amount: 75, adjustments_amount: 0, payee_name: "Mercy Riviera" } as Timesheet;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show(issued = false) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  client.setQueryData(["timesheet-detail", "admin", "mercy", "2026-10-01"], {entries: [entry], visits: [], sheets: issued ? [sheet] : [], adjustments: [], settings: {hourly_rate: 50, currency: "USD"}, profile: {full_name: "Mercy Riviera"}, properties: [entry.property]});
  client.setQueryData(["timesheet-history", "admin", "mercy", 25], []);
  client.setQueryData(["timesheet-audit", "admin", "mercy", "2026-10-01", 50], {events: [], names: {}});
  client.setQueryData(["timesheet-issuers", "admin", []], {});
  vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  return render(<QueryClientProvider client={client}><TimesheetDetail staff="mercy" period="2026-10-01" es={false} userId="admin" /></QueryClientProvider>);
}
it("bulk approval keeps the existing RPC and includes completed flagged visits", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Approve 1 visits" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("approve_time_entries", {_ids: ["visit"]}));
});
it("pending visit detail delegates edits to the existing required-reason form", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: /View visit:/ }));
  fireEvent.click(screen.getByRole("button", { name: "Edit times" }));
  expect(screen.getByLabelText("Reason for this change (required)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("issued month retains download but offers no visit editing actions", () => {
  show(true);
  expect(screen.getByRole("button", {name: "Download Excel"})).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /View visit:|Approve|Edit times|Didn't work/ })).not.toBeInTheDocument();
  expect(mocks.rpc).not.toHaveBeenCalled();
});