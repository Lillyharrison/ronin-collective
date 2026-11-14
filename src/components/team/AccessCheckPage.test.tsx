import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccessCheckPage } from "./AccessCheckPage";
import { accessTime } from "./accessCheckLogic";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), master: true, language: "en" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc, from: mock.from } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "lilly", isMasterAdmin: mock.master }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: mock.language }) }));
vi.mock("@/contexts/NavigationContext", () => ({ useNavigation: () => ({ registerBackHandler: vi.fn() }) }));
const person = { id: "julia", name: "Julia", level: "staff", role: "staff", houses: ["Rockingham"], sections_on: 3, alerts_on: 2 };
const row = { person, is_admin_level: false, issues: [], ok: true, checked_at: "2026-11-13T20:00:00Z" };
const detail = { person, is_admin_level: false, tables: { tasks: { can_see: 4, outside_their_houses: 2 } }, houseless_entries_belonging_to_others: {}, roster_outside_their_houses: {}, alerts_last_14_days: [{ when: "2026-11-14T01:00:00Z", title: "Wrong alert", house: "Other house", from: "Drew" }], alerts_that_look_wrong: [{ when: "2026-11-14T01:00:00Z", title: "Wrong alert", why: "House not assigned" }] };
const finding = { id: "f1", person_id: "julia", person_name: "Julia", rule: "wrong_alert", status: "open", first_seen: "2026-11-14T01:00:00Z", last_seen: "2026-11-14T01:00:00Z", detail: {} };
let dismissed = false;
const update = vi.fn();
function query() { let status = ""; let mutation = false; const q: Record<string, unknown> = {}; for (const method of ["select", "eq", "order", "gte", "limit"]) q[method] = vi.fn((...args) => { if (method === "eq" && args[0] === "status") status = args[1]; return q; }); q.update = vi.fn((value) => { mutation = true; update(value); return q; }); q.single = vi.fn(async () => { dismissed = true; return { data: { id: "f1" }, error: null }; }); q.then = (resolve: (value: unknown) => void) => resolve({ data: mutation ? null : status === "open" && !dismissed ? [finding] : [], error: null }); return q; }
function show() { const edit = vi.fn(); render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><AccessCheckPage onClose={vi.fn()} onEditHouses={edit}/></QueryClientProvider>); return edit; }
beforeEach(() => { mock.master = true; mock.language = "en"; dismissed = false; update.mockClear(); mock.rpc.mockReset(); mock.from.mockClear(); mock.from.mockImplementation(query); mock.rpc.mockImplementation(name => Promise.resolve({ data: name === "admin_access_overview" ? [row] : name === "admin_access_check_person" ? row : detail, error: null })); });
describe("Access check page", () => {
  it("loads stored overview without checking people, then checks one on demand", async () => { show(); expect(await screen.findByText("All clear, 1 people checked")).toBeInTheDocument(); expect(mock.rpc).not.toHaveBeenCalledWith("admin_access_check_person", expect.anything()); fireEvent.click(screen.getByRole("button", { name: "Check now" })); await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("admin_access_check_person", { _target: "julia" })); await waitFor(() => expect(mock.rpc.mock.calls.filter(c => c[0] === "admin_access_overview").length).toBe(2)); });
  it("shows issues, logged person details, house fix and offending alert", async () => { mock.rpc.mockImplementation(name => Promise.resolve({ data: name === "admin_access_overview" ? [{ ...row, ok: false, issues: [{ rule: "other_house_data", count: 2 }] }] : detail, error: null })); const edit = show(); expect((await screen.findAllByText("1 issues")).length).toBe(2); fireEvent.click(screen.getByRole("button", { name: /Julia.*Staff/ })); expect(await screen.findByText("What they can see")).toBeInTheDocument(); expect(mock.rpc).toHaveBeenCalledWith("admin_visibility_report", { _target: "julia", _log: true }); fireEvent.click(screen.getByRole("button", { name: "Review houses" })); expect(edit).toHaveBeenCalledWith("julia"); expect(screen.getByText("House not assigned")).toBeInTheDocument(); });
  it("dismisses only after the saved update and refreshes findings", async () => { show(); fireEvent.click(await screen.findByRole("button", { name: "Dismiss" })); await waitFor(() => expect(update).toHaveBeenCalledWith({ status: "dismissed" })); await waitFor(() => expect(screen.getByText("No open findings")).toBeInTheDocument()); });
  it("does not render or call checks for anyone other than master admin", () => { mock.master = false; show(); expect(screen.queryByText("Access check")).not.toBeInTheDocument(); expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled(); });
  it("shows Spanish controls and rule meanings", async () => { mock.language = "es"; show(); expect(await screen.findByText("Todo correcto, 1 personas comprobadas")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Comprobar ahora" })).toBeInTheDocument(); expect(screen.getByText("Recibió una alerta que no le correspondía")).toBeInTheDocument(); });
  it("shows a retry when the database refuses a check", async () => { mock.rpc.mockResolvedValue({ data: null, error: new Error("Denied") }); show(); expect(await screen.findByRole("alert")).toHaveTextContent("The check could not be loaded"); });
  it("checks sequentially with progress, updates each result and continues after a failure", async () => {
    const rows = [row, { ...row, person: { ...person, id: "drew", name: "Drew" } }, { ...row, person: { ...person, id: "kelly", name: "Kelly" } }];
    const pending: Array<(value: unknown) => void> = [];
    mock.rpc.mockImplementation(name => name === "admin_access_check_person" ? new Promise(resolve => pending.push(resolve)) : Promise.resolve({ data: name === "admin_access_overview" ? rows : detail, error: null }));
    show(); await screen.findByText("All clear, 3 people checked");
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    await screen.findByText("Checking 1 of 3");
    expect(screen.getByRole("button", { name: "Check now" })).toBeDisabled();
    expect(mock.rpc.mock.calls.filter(c => c[0] === "admin_access_check_person")).toEqual([["admin_access_check_person", { _target: "julia" }]]);
    pending[0]({ data: { ...row, checked_at: "2026-11-14T02:00:00Z", ok: false, issues: [{ rule: "wrong_alert", count: 1 }] }, error: null });
    await screen.findByText("Checking 2 of 3");
    expect(screen.getAllByText("1 issues")).toHaveLength(2);
    pending[1]({ data: null, error: new Error("Timeout") });
    await screen.findByText("Checking 3 of 3");
    expect(screen.getByRole("alert")).toHaveTextContent("The check could not be loaded");
    pending[2]({ data: rows[2], error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Check now" })).not.toBeDisabled());
    expect(mock.rpc.mock.calls.filter(c => c[0] === "admin_access_check_person").map(c => c[1])).toEqual([{ _target: "julia" }, { _target: "drew" }, { _target: "kelly" }]);
    expect(mock.rpc.mock.calls.filter(c => c[0] === "admin_access_overview")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(pending).toHaveLength(4));
    pending[3]({ data: rows[1], error: null });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
  it("uses newest stored checked_at and shows each person's stored time", async () => {
    const newest = "2026-11-14T01:00:00Z";
    mock.rpc.mockResolvedValue({ data: [row, { ...row, person: { ...person, id: "drew", name: "Drew" }, checked_at: newest }], error: null });
    show(); await screen.findByText("All clear, 2 people checked");
    expect(screen.getAllByText(`Last checked: ${accessTime(newest, true)}`)).toHaveLength(2);
    expect(screen.getByText(`Last checked: ${accessTime(row.checked_at, true)}`)).toBeInTheDocument();
  });
  it.each([ ["en", "No checks stored yet. Press Check now."], ["es", "Todavía no hay comprobaciones guardadas. Pulsa Comprobar ahora."] ])("shows stored empty state in %s", async (language, text) => {
    mock.language = language; mock.rpc.mockResolvedValue({ data: [], error: null }); show(); expect(await screen.findByText(text)).toBeInTheDocument(); expect(screen.queryByText(/0 people checked/)).not.toBeInTheDocument();
  });
  it("refreshes only the opened person alongside the existing report", async () => {
    show(); await screen.findByText("All clear, 1 people checked"); fireEvent.click(screen.getByRole("button", { name: /Julia.*Staff/ }));
    await screen.findByText("What they can see");
    expect(mock.rpc).toHaveBeenCalledWith("admin_access_check_person", { _target: "julia" });
    expect(mock.rpc).toHaveBeenCalledWith("admin_visibility_report", { _target: "julia", _log: true });
    expect(mock.rpc.mock.calls.filter(c => c[0] === "admin_access_check_person")).toHaveLength(1);
  });
});