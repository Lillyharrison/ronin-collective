import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  section: vi.fn(), planned: vi.fn(), repair: vi.fn(), navigate: vi.fn(), rpc: vi.fn(),
  deleted: vi.fn(), updated: vi.fn(), rpcError: null as unknown,
  notifications: [] as Record<string, unknown>[], language: "en",
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: mocks.language, t: (key: string) => key }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/contexts/NavigationContext", () => ({ useNavigation: () => ({
  setActiveSection: mocks.section, setPendingPlannedMaintenanceEntryId: mocks.planned,
  setPendingMaintenanceIssueId: mocks.repair, setPendingTaskId: vi.fn(),
}) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ userId: "tester", fullName: "Tester", isAdmin: false, isMasterAdmin: false,
    assignedPropertyIds: [], canSee: () => false, loading: false, error: null }),
  usePermissionsControl: () => ({ retry: vi.fn() }),
}));
vi.mock("@/hooks/useScopedProperties", () => ({ useScopedProperties: () => ({ properties: [] }) }));
vi.mock("@/hooks/usePropertyRules", () => ({ useActiveRulesForDashboard: () => [] }));
vi.mock("@/hooks/useMaintenanceIssues", () => ({ useMaintenanceIssues: () => ({ categories: [], createIssue: vi.fn() }) }));
vi.mock("@/components/maintenance/IssueModal", () => ({ IssueModal: () => null }));
vi.mock("@/components/NotificationRecordDialog", () => ({
  NotificationRecordDialog: ({ target, onClose, onEditPlanned }: { target: { type: string; id: string | null }; onClose: () => void; onEditPlanned: (id: string) => void }) =>
    <div role="dialog">{target.type}:{target.id}<button onClick={onClose}>Close details</button><button onClick={() => onEditPlanned(target.id ?? "")}>Edit planned</button></div>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string, args: unknown) => { mocks.rpc(name, args); return Promise.resolve({ error: mocks.rpcError }); },
  from: (table: string) => {
    let op = "select";
    const result = () => ({ data: table === "notifications" && op === "select" ? mocks.notifications : null, count: 0, error: null });
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, gte: () => chain, lt: () => chain,
      not: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: null }),
      delete: () => { op = "delete"; mocks.deleted(table); return chain; },
      update: (patch: unknown) => { op = "update"; mocks.updated(table, patch); return chain; },
      then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
  channel: () => { const chain = { on: () => chain, subscribe: () => chain }; return chain; },
  removeChannel: vi.fn(),
} }));

import { Dashboard } from "./Dashboard";
import { NotificationsPanel } from "@/components/NotificationsPanel";

beforeEach(() => { vi.clearAllMocks(); mocks.rpcError = null; mocks.language = "en"; });
afterEach(cleanup);
function notice(type = "task", action: string | null = null) {
  mocks.notifications = [{ id: "notice-id", title: "Test notice", body: "Details", type: "info", is_read: false,
    user_id: "tester", created_at: new Date().toISOString(), action_url: action,
    entity_type: type, entity_id: "record-id", property: null }];
}
function swipe(title = "Test notice") {
  const row = screen.getByText(title).closest(".notification-swipe-content");
  if (!row) throw new Error("Missing swipe row");
  fireEvent.touchStart(row, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchMove(row, { touches: [{ clientX: 140, clientY: 103 }] });
  fireEvent.touchEnd(row);
  return row;
}

describe("dashboard notifications", () => {
  it.each(["maintenance_issue", "planned_maintenance", "task", "calendar_event", "birthday"])("acknowledges and opens %s details without navigating", async type => {
    notice(type, type === "birthday" ? "home" : null);
    render(<Dashboard />);
    fireEvent.click(await screen.findByText("Test notice"));
    expect(await screen.findByRole("dialog")).toHaveTextContent(`${type}:record-id`);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("acknowledge_notification", { _notif_id: "notice-id" });
    expect(mocks.updated).toHaveBeenCalledWith("notifications", { is_read: true });
    expect(mocks.section).not.toHaveBeenCalled();
    expect(mocks.repair).not.toHaveBeenCalled();
    expect(mocks.planned).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Close details"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Test notice")).not.toBeInTheDocument();
  });
  it("dismisses only from the dashboard, retaining the bell notification", async () => {
    notice();
    const view = render(<><section aria-label="Dashboard"><Dashboard /></section><section aria-label="Bell"><NotificationsPanel open onClose={vi.fn()} /></section></>);
    const dashboard = within(screen.getByRole("region", { name: "Dashboard" }));
    const bell = within(screen.getByRole("region", { name: "Bell" }));
    await dashboard.findByText("Test notice");
    await bell.findByText("Test notice");
    const initialDeletes = mocks.deleted.mock.calls.length; // Bell's existing old-row cleanup.
    fireEvent.click(dashboard.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(dashboard.queryByText("Test notice")).not.toBeInTheDocument());
    expect(bell.getByText("Test notice")).toBeInTheDocument();
    expect(mocks.deleted).toHaveBeenCalledTimes(initialDeletes);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Reopen bell from confirmed persistent data; acknowledgment did not delete it.
    view.rerender(<section aria-label="Bell"><NotificationsPanel open onClose={vi.fn()} /></section>);
    expect(await screen.findByText("Test notice")).toBeInTheDocument();
  });
  it("swipe reveals a neutral Dismiss action, and tapping the revealed row only closes it", async () => {
    notice();
    render(<Dashboard />);
    await screen.findByText("Test notice");
    const row = swipe();
    expect(row.parentElement).toHaveAttribute("data-revealed", "true");
    expect(screen.getAllByRole("button", { name: "Dismiss" })[0]).not.toHaveAttribute("aria-hidden", "true");
    fireEvent.click(screen.getByText("Test notice"));
    expect(row.parentElement).toHaveAttribute("data-revealed", "false");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.section).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    swipe();
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0]);
    await waitFor(() => expect(screen.queryByText("Test notice")).not.toBeInTheDocument());
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it("closes revealed rows on page scroll", async () => {
    notice();
    render(<Dashboard />);
    await screen.findByText("Test notice");
    const row = swipe();
    fireEvent.scroll(window);
    expect(row.parentElement).toHaveAttribute("data-revealed", "false");
  });
  it("navigates to maintenance only after explicit Edit", async () => {
    notice("planned_maintenance");
    render(<Dashboard />);
    fireEvent.click(await screen.findByText("Test notice"));
    await screen.findByRole("dialog");
    expect(mocks.section).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Edit planned"));
    expect(mocks.planned).toHaveBeenCalledExactlyOnceWith("record-id");
    expect(mocks.section).toHaveBeenCalledExactlyOnceWith("maintenance");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("preserves section navigation for other notification types", async () => {
    notice("order", "orders");
    render(<Dashboard />);
    fireEvent.click(await screen.findByText("Test notice"));
    await waitFor(() => expect(mocks.section).toHaveBeenCalledExactlyOnceWith("orders"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("does not hide or open a notification if acknowledgment fails", async () => {
    notice();
    mocks.rpcError = { message: "Denied" };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Dashboard />);
    fireEvent.click(await screen.findByText("Test notice"));
    await waitFor(() => expect(log).toHaveBeenCalled());
    expect(screen.getByText("Test notice")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    log.mockRestore();
  });
});