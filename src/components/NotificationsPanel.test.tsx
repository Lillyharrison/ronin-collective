import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), section: vi.fn(), repair: vi.fn(), planned: vi.fn(), task: vi.fn(),
  update: vi.fn(), deleted: vi.fn(), deleteError: null as unknown, notifications: [] as Record<string, unknown>[],
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
      delete: () => { mocks.deleted(); return chain; }, update: (patch: unknown) => { mocks.update(patch); return chain; },
      then: (resolve: (value: unknown) => void) => Promise.resolve({ error: mocks.deleteError }).then(resolve),
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

beforeEach(() => { vi.clearAllMocks(); mocks.deleteError = null; });
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

function swipe(title: string, dx: number, dy = 0) {
  const row = screen.getByText(title).closest(".notification-swipe-content");
  if (!row) throw new Error("Missing notification row");
  fireEvent.touchStart(row, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchMove(row, { touches: [{ clientX: 200 + dx, clientY: 100 + dy }] });
  fireEvent.touchEnd(row, { changedTouches: [{ clientX: 200 + dx, clientY: 100 + dy }] });
  return row;
}

describe("notification swipe deletion", () => {
  it("reveals after a 40px left swipe, never deletes on a full swipe", async () => {
    notification("task");
    render(<NotificationsPanel open onClose={vi.fn()} />);
    await screen.findByText("Test notice");
    const before = mocks.deleted.mock.calls.length;
    const row = swipe("Test notice", -40);
    expect(row.parentElement).toHaveAttribute("data-revealed", "true");
    expect(screen.getAllByRole("button", { name: "Delete notification" })[0]).not.toHaveAttribute("aria-hidden", "true");
    swipe("Test notice", -200);
    expect(mocks.deleted).toHaveBeenCalledTimes(before);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("tapping a revealed row closes it without reading or opening details", async () => {
    notification("task");
    render(<NotificationsPanel open onClose={vi.fn()} />);
    await screen.findByText("Test notice");
    const row = swipe("Test notice", -60);
    fireEvent.click(screen.getByText("Test notice"));
    expect(row.parentElement).toHaveAttribute("data-revealed", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Test notice"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("deletes using the revealed button and refreshes the badge", async () => {
    notification("task");
    const changed = vi.fn();
    window.addEventListener("ronin:notifications-changed", changed);
    render(<NotificationsPanel open onClose={vi.fn()} />);
    await screen.findByText("Test notice");
    const before = mocks.deleted.mock.calls.length;
    swipe("Test notice", -60);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete notification" })[0]);
    await waitFor(() => expect(screen.queryByText("Test notice")).not.toBeInTheDocument());
    expect(mocks.deleted).toHaveBeenCalledTimes(before + 1);
    expect(changed).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    window.removeEventListener("ronin:notifications-changed", changed);
  });
  it("does not reveal for short or predominantly vertical gestures", async () => {
    notification("task");
    render(<NotificationsPanel open onClose={vi.fn()} />);
    await screen.findByText("Test notice");
    expect(swipe("Test notice", -39).parentElement).toHaveAttribute("data-revealed", "false");
    expect(swipe("Test notice", -60, 100).parentElement).toHaveAttribute("data-revealed", "false");
  });
  it("closes the previous row when another opens and closes on scroll", async () => {
    notification("task");
    mocks.notifications.push({ ...mocks.notifications[0], id: "second-id", title: "Second notice" });
    render(<NotificationsPanel open onClose={vi.fn()} />);
    await screen.findByText("Test notice");
    const first = swipe("Test notice", -60);
    const second = swipe("Second notice", -60);
    expect(first.parentElement).toHaveAttribute("data-revealed", "false");
    expect(second.parentElement).toHaveAttribute("data-revealed", "true");
    const list = second.closest(".overflow-y-auto");
    if (!list) throw new Error("Missing notification list");
    fireEvent.scroll(list);
    expect(second.parentElement).toHaveAttribute("data-revealed", "false");
  });
  it("keeps a notification if its delete request fails", async () => {
    notification("task");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<NotificationsPanel open onClose={vi.fn()} />);
    await screen.findByText("Test notice");
    mocks.deleteError = { message: "Denied" };
    swipe("Test notice", -60);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete notification" })[0]);
    await waitFor(() => expect(log).toHaveBeenCalled());
    expect(screen.getByText("Test notice")).toBeInTheDocument();
    log.mockRestore();
  });
});