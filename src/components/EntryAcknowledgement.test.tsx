import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ viewer: { userId: "manager", role: "manager", assignedPropertyIds: ["house"] }, language: "en", invoke: vi.fn(), row: { ack_required: true, acknowledged_at: null as string | null, acknowledged_by: null as string | null, acknowledged_note: null as string | null }, success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.viewer }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: mocks.language, t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke }, from: (table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: mocks.row, error: null }), maybeSingle: async () => ({ data: table === "profiles" ? { full_name: "Kelly" } : mocks.row }) }) }) }) } }));
import { EntryAcknowledgement } from "./EntryAcknowledgement";
import { NotificationRecordDialog } from "./NotificationRecordDialog";
vi.mock("@/lib/notificationDetail", () => ({ fetchNotificationDetail: async (type: string) => ({ type, record: { ...entry, ...mocks.row, title: "New issue", title_en: "New task", status: type === "maintenance_issue" ? "reported" : "pending", priority: "medium", created_at: "2026-11-12T03:40:00Z" } }) }));
const entry = { id: "entry", reported_by: "family", created_by: "family", property_id: "house", assigned_to: "worker", ack_required: true, acknowledged_at: null };
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); mocks.viewer = { userId: "manager", role: "manager", assignedPropertyIds: ["house"] }; mocks.language = "en";
  mocks.row = { ack_required: true, acknowledged_at: null, acknowledged_by: null, acknowledged_note: null };
});
function mount(element = <EntryAcknowledgement kind="repair" entry={entry} />) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>);
}
it("single tap and rapid second tap send one request; readback replaces control", async () => {
  let resolve: (v: unknown) => void = () => {};
  mocks.invoke.mockImplementation(() => new Promise(r => { resolve = r; }));
  mount(); const button = await screen.findByRole("button", { name: "Acknowledge" });
  fireEvent.click(button); fireEvent.click(button);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(mocks.invoke).toHaveBeenCalledWith("acknowledge-entry", { body: { kind: "repair", id: "entry", note: null } });
  mocks.row = { ack_required: true, acknowledged_at: "2026-11-12T03:40:00Z", acknowledged_by: "kelly", acknowledged_note: "On it" };
  resolve({ data: { acknowledged: true }, error: null });
  expect(await screen.findByText(/Acknowledged by Kelly, 12 Nov — On it/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
});
it("optional note is sent with the one tap", async () => {
  mocks.invoke.mockResolvedValue({ data: { already_acknowledged: true }, error: null });
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Add a note" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Optional note" }), { target: { value: "Will check today" } });
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Acknowledged"));
  expect(mocks.invoke).toHaveBeenCalledWith("acknowledge-entry", { body: { kind: "repair", id: "entry", note: "Will check today" } });
});
it("sender sees acknowledged name, date and note without a control", async () => {
  mocks.viewer.userId = "family"; mocks.viewer.role = "master_admin";
  mocks.row = { ack_required: true, acknowledged_at: "2026-11-12T03:40:00Z", acknowledged_by: "kelly", acknowledged_note: "On it" };
  mount(<EntryAcknowledgement kind="repair" entry={{ ...entry, ...mocks.row }} compact />);
  expect(await screen.findByText(/Acknowledged by Kelly, 12 Nov — On it/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it.each(["family", "other"])("does not show button to sender or unauthorized staff: %s", async id => {
  mocks.viewer.userId = id; mocks.viewer.role = "staff";
  mount(); await waitFor(() => expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument());
  if (id === "family") expect(screen.getByText("Sent. Waiting for the team to see it")).toBeInTheDocument();
});
it.each([false, true])("New is only for required unacknowledged entries: %s", required => {
  mount(<EntryAcknowledgement kind="task" entry={{ ...entry, ack_required: required }} compact />);
  expect(!!screen.queryByText("New")).toBe(required);
});
it("does not show New to unrelated staff or on acknowledged records", () => {
  mocks.viewer.userId = "other"; mocks.viewer.role = "staff";
  mount(<EntryAcknowledgement kind="task" entry={entry} compact />);
  expect(screen.queryByText("New")).not.toBeInTheDocument();
  cleanup(); mocks.viewer.role = "admin";
  mount(<EntryAcknowledgement kind="task" entry={{ ...entry, acknowledged_at: "2026-11-12T03:40:00Z" }} compact />);
  expect(screen.queryByText("New")).not.toBeInTheDocument();
});
it.each(["task", "maintenance_issue"] as const)("notification popup exposes acknowledgement for %s", async type => {
  mount(<NotificationRecordDialog target={{ type, id: "entry" }} onClose={() => {}} onEditPlanned={() => {}} />);
  expect(await screen.findByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
});
it("uses Spanish controls and surfaces readable server error", async () => {
  mocks.language = "es"; mocks.invoke.mockResolvedValue({ data: null, error: new Error("You cannot acknowledge your own entry") });
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Enterado" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("You cannot acknowledge your own entry"));
  expect(screen.getByRole("button", { name: "Añadir una nota" })).toBeInTheDocument();
});