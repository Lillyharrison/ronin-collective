import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), section: vi.fn(), repair: vi.fn(), planned: vi.fn(), task: vi.fn(),
  update: vi.fn(), notifications: [] as Record<string, unknown>[],
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "tester", isMasterAdmin: true }) }));
vi.mock("@/contexts/NavigationContext", () => ({ useNavigation: () => ({
  setActiveSection: mocks.section, setPendingMaintenanceIssueId: mocks.repair,
  setPendingPlannedMaintenanceEntryId: mocks.planned, setPendingTaskId: mocks.task,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const chain = {
      select: () => chain, eq: () => chain, gte: () => chain, lt: () => chain,
      order: () => chain, limit: () => Promise.resolve({ data: mocks.notifications }),
      delete: () => chain, update: (patch: unknown) => { mocks.update(patch); return chain; },
      then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
    };
    return chain;
  },
  channel: () => { const chain = { on: () => chain, subscribe: () => chain }; return chain; },
  removeChannel: vi.fn(),
} }));
vi.mock("@/components/NotificationRecordDialog", () => ({
  NotificationRecordDialog: ({ target, onClose, onEditPlanned }: { target: { type: string; id: string | null }; onClose: () => void; onEditPlanned: (id: string) => void }) =>
    <div role="dialog"><span>{target.type}:{target.id}</span><button onClick={onClose}>Close details</button><button onClick={() => onEditPlanned(target.id ?? "")}>Edit planned</button></div>,
}));
import { NotificationsPanel } from "./NotificationsPanel";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function notification(type: string, id: string | null = "record-id") {
  mocks.notifications = [{ id: "notice-id", title: "Test notice", body: null, type: "info", is_read: false,
    created_at: new Date().toISOString(), action_url: type === "order" ? "orders" : "maintenance", entity_type: type, entity_id: id, property: null }];
}

describe("notification detail routing", () => {
  it.each(["maintenance_issue", "planned_maintenance", "task", "calendar_event", "birthday"])("opens %s over the list without navigating", async type => {
    notification(type);
    const close = vi.fn();
    render(<NotificationsPanel open onClose={close} />);
    fireEvent.click(await screen.findByText("Test notice"));
    expect(screen.getByRole("dialog")).toHaveTextContent(`${type}:record-id`);
    expect(mocks.update).toHaveBeenCalledWith({ is_read: true });
    expect(close).not.toHaveBeenCalled();
    expect(mocks.section).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.repair).not.toHaveBeenCalled();
    expect(mocks.planned).not.toHaveBeenCalled();
    expect(mocks.task).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Close details"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Test notice")).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });
  it("keeps missing entity IDs in the popup flow", async () => {
    notification("birthday", null);
    const close = vi.fn();
    render(<NotificationsPanel open onClose={close} />);
    fireEvent.click(await screen.findByText("Test notice"));
    expect(screen.getByRole("dialog")).toHaveTextContent("birthday:");
    expect(close).not.toHaveBeenCalled();
  });
  it.each(["order", "checklist_public_session", "message", "property_rule"])("preserves close-and-navigate for %s", async type => {
    notification(type);
    const close = vi.fn();
    render(<NotificationsPanel open onClose={close} />);
    fireEvent.click(await screen.findByText("Test notice"));
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.section).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    if (type === "order") expect(mocks.navigate).toHaveBeenCalledWith("/orders?order=record-id");
  });
  it("navigates only on explicit planned maintenance Edit", async () => {
    notification("planned_maintenance");
    const close = vi.fn();
    render(<NotificationsPanel open onClose={close} />);
    fireEvent.click(await screen.findByText("Test notice"));
    fireEvent.click(screen.getByText("Edit planned"));
    expect(mocks.planned).toHaveBeenCalledWith("record-id");
    expect(mocks.section).toHaveBeenCalledWith("maintenance");
    expect(close).toHaveBeenCalledOnce();
  });
});