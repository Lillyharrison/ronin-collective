import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TheirView } from "./TheirView";
import { repeatIds, wrongHouseIds, type TheirAlert } from "./theirViewLogic";
import { readFileSync, existsSync } from "node:fs";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), master: true, success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc, from: () => {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "gte", "limit"]) q[method] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: [{ id: "new", entity_id: "task" }, { id: "old", entity_id: "task" }, { id: "wrong", entity_id: "other" }], error: null });
  return q;
} } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "lilly", isMasterAdmin: mock.master }) }));
vi.mock("sonner", () => ({ toast: { success: mock.success, error: vi.fn() } }));
const alert: TheirAlert = { id: "new", title: "Task done", body: "Body", created_at: "2026-11-21T12:00:00Z", read: false, kind: "task", house: "Rockingham", from: "Julia", copies: 2, outside_their_houses: false, entity_id: "task" };
const alerts = [alert, { ...alert, id: "old", read: true, created_at: "2026-11-20T12:00:00Z" }, { ...alert, id: "wrong", entity_id: "other", copies: 1, outside_their_houses: true }];
const data = { alerts, tasks: [{ title: "Clean kitchen", status: "pending", due: "2026-11-22", house: "Rockingham", assigned_to: "Julia", from: "Lilly" }], repairs: [], orders: [], calendar_next_14_days: [], shifts_next_14_days: [] };
function show(en = true) { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><TheirView target="julia" name="Julia" en={en}/></QueryClientProvider>); }
beforeEach(() => { mock.master = true; mock.rpc.mockReset(); mock.success.mockReset(); mock.rpc.mockImplementation(name => Promise.resolve({ data: name === "admin_their_view" ? data : 1, error: null })); });
describe("Their view", () => {
  it("keeps newest repeats by the database title/kind/entity rule, not body or house", () => {
    expect(repeatIds([alerts[1], { ...alert, body: "Different", house: "Other" }, alerts[2]])).toEqual(["old"]);
    expect(repeatIds([{ ...alert, entity_id: undefined }, { ...alerts[1], entity_id: undefined }])).toEqual([]);
    expect(wrongHouseIds(alerts)).toEqual(["wrong"]);
  });
  it("loads the chosen person's tabs, badges, fields and empty states", async () => {
    show(); await screen.findByRole("tab", { name: "Alerts (3)" });
    expect(mock.rpc).toHaveBeenCalledWith("admin_their_view", { _target: "julia" });
    expect(screen.getAllByText("x2 copies")).toHaveLength(2);
    expect(screen.getByText("Not their house")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Unread")).toHaveLength(2);
    expect(screen.getAllByText("from Julia")).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: "Tasks (1)" }));
    expect(screen.getByText("Clean kitchen")).toBeInTheDocument();
    for (const name of ["Repairs (0)", "Orders (0)", "Calendar (0)", "Shifts (0)"]) {
      fireEvent.click(screen.getByRole("tab", { name })); expect(screen.getByText("Nothing to show here.")).toBeInTheDocument();
    }
  });
  it("selects repeats or wrong-house alerts and requires confirmation for exact ids", async () => {
    show(); await screen.findByRole("tab", { name: "Alerts (3)" });
    fireEvent.click(screen.getByRole("button", { name: "Select repeats" }));
    expect(screen.getByRole("checkbox", { name: "Select alert old" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select alert new" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Select wrong-house" }));
    expect(screen.getByRole("checkbox", { name: "Select alert old" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete 1 alerts for Julia?");
    expect(mock.rpc).not.toHaveBeenCalledWith("admin_delete_notifications", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("admin_delete_notifications", { _target: "julia", _ids: ["wrong"] }));
    await waitFor(() => expect(mock.rpc.mock.calls.filter(c => c[0] === "admin_their_view")).toHaveLength(2));
    expect(mock.success).toHaveBeenCalledWith("1 alerts deleted");
    expect(screen.queryByText("Delete selected (1)")).not.toBeInTheDocument();
  });
  it.each([["Clear repeats", "admin_clear_duplicate_notifications", { _target: "julia" }], ["Clear read alerts", "admin_clear_notifications", { _target: "julia", _only_read: true }]])("confirms %s and calls only its RPC", async (button, rpc, args) => {
    show(); await screen.findByRole("tab", { name: "Alerts (3)" });
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete 1 alerts for Julia?");
    expect(mock.rpc).not.toHaveBeenCalledWith(rpc, args);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith(rpc, args));
  });
  it("supports manual multi-selection and deselection", async () => {
    show(); await screen.findByRole("tab", { name: "Alerts (3)" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select alert new" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select alert old" }));
    expect(screen.getByRole("button", { name: "Delete selected (2)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select alert new" }));
    expect(screen.getByRole("button", { name: "Delete selected (1)" })).toBeInTheDocument();
  });
  it("is master-admin only", () => { mock.master = false; show(); expect(mock.rpc).not.toHaveBeenCalled(); expect(screen.queryByRole("tab")).not.toBeInTheDocument(); });
  it("has Spanish controls and no clear-everything action", async () => { show(false); await screen.findByRole("tab", { name: "Alertas (3)" }); expect(screen.getByText("No es su casa")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Eliminar alertas leídas" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Clear everything|Eliminar todo/i })).not.toBeInTheDocument(); });
  it("removes preview UI without rewriting the permission plumbing", () => {
    expect(existsSync("src/components/PreviewModeBanner.tsx")).toBe(false);
    for (const path of ["src/components/AppShell.tsx", "src/components/team/MemberEditDrawer.tsx", "src/components/sections/MeetTeamSection.tsx"]) expect(readFileSync(path, "utf8")).not.toMatch(/ViewAsButton|PreviewModeBanner|enterPreview/);
  });
});