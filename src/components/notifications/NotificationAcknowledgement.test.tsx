import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { receiptAndPush, type ReceiptResult } from "../../../supabase/functions/_shared/notificationReceipt";
import { notificationActor } from "../../../supabase/functions/_shared/notificationActor";
const m = vi.hoisted(() => ({ language: "en", invoke: vi.fn(), success: vi.fn(), error: vi.fn(), kind: "task" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "recipient", role: "admin", isAdmin: true, canEdit: () => false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: m.language, t: (x: string) => x }) }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: m.invoke },
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: notice, error: null }) }) }) }) }),
} }));
vi.mock("@/lib/notificationDetail", () => ({ fetchNotificationDetail: async (type: string) => ({ type, record: {
  id: "entry", title: "Repair", title_en: "Task", status: type === "task" ? "pending" : "reported", priority: "medium", created_at: new Date().toISOString(),
  ack_required: true, acknowledged_at: null, reported_by: "sender", created_by: "sender",
} }) }));
import { NotificationAcknowledgement, canSendReceipt } from "./NotificationAcknowledgement";
import { NotificationRecordDialog } from "../NotificationRecordDialog";
import { SwipeableNotificationRow } from "./SwipeableNotificationRow";
import { Check, Trash2 } from "lucide-react";
const notice = { id: "notice", actor_id: "sender", receipt_sent_at: null };
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const show = (element = <NotificationAcknowledgement notification={notice} />) => render(<QueryClientProvider client={client()}>{element}</QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); m.language = "en"; });
afterEach(cleanup);
it.each([
  ["sender", null, true], [null, null, false], ["recipient", null, false], ["sender", "2026-11-12T00:00Z", false],
])("receipt eligibility for actor %s and receipt %s", (actor, receipt, allowed) => {
  expect(canSendReceipt({ id: "notice", actor_id: actor as string | null, receipt_sent_at: receipt as string | null }, "recipient")).toBe(allowed);
});
it("system and legacy notices never show controls", () => {
  const { container } = show(<NotificationAcknowledgement notification={{ id: "system" }} />);
  expect(container).toBeEmptyDOMElement();
});
it("one tap plus a rapid double tap produces one RPC and push and updates all copies", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const rpc = vi.fn(async () => { await gate; return { acknowledged: true, notified: true, sender_id: "sender", title: "Seen by Kelly", entity_type: "task", entity_id: "entry" }; });
  const push = vi.fn(async (_result: ReceiptResult, _target: string) => {});
  m.invoke.mockImplementation(async () => ({ data: await receiptAndPush("notice", rpc, push), error: null }));
  show(<><NotificationAcknowledgement notification={notice} /><NotificationAcknowledgement notification={notice} /></>);
  const buttons = screen.getAllByRole("button", { name: "Acknowledge" });
  fireEvent.click(buttons[0]); fireEvent.click(buttons[0]); fireEvent.click(buttons[1]);
  expect(m.invoke).toHaveBeenCalledExactlyOnceWith("acknowledge-notification", { body: { id: "notice" } });
  release();
  await waitFor(() => expect(screen.getAllByRole("status")).toHaveLength(2));
  expect(rpc).toHaveBeenCalledOnce(); expect(push).toHaveBeenCalledOnce();
  expect(push.mock.calls[0][1]).toBe("/?entryKind=task&entryId=entry");
  expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
});
it.each(["task", "maintenance_issue"] as const)("notification-opened %s popup shows only one receipt control", async type => {
  show(<NotificationRecordDialog target={{ type, id: "entry", notification: notice }} onClose={() => {}} onEditPlanned={() => {}} />);
  await screen.findByRole("button", { name: "Acknowledge" });
  expect(screen.getAllByRole("button", { name: "Acknowledge" })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Add a note" })).not.toBeInTheDocument();
});
it("Spanish controls show readable server errors and allow retry", async () => {
  m.language = "es";
  m.invoke.mockResolvedValue({ data: null, error: new Error("Only the recipient can acknowledge this notification") });
  show(); fireEvent.click(screen.getByRole("button", { name: "Enterado" }));
  await waitFor(() => expect(m.error).toHaveBeenCalledWith("Only the recipient can acknowledge this notification"));
  m.invoke.mockResolvedValue({ data: { already_acknowledged: true }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Enterado" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Enterado");
});
it("receipt clicks do not open details, dismiss or delete; swipe still reveals deletion", async () => {
  const open = vi.fn(), remove = vi.fn(), reveal = vi.fn();
  m.invoke.mockResolvedValue({ data: { acknowledged: true, notified: false }, error: null });
  show(<SwipeableNotificationRow revealed={false} resetEpoch={0} removing={false} onReveal={reveal} onClose={() => {}} onAction={remove} actionLabel="Delete" actionIcon={Trash2}>
    <div onClick={open}><p>Notice text</p><NotificationAcknowledgement notification={notice} /></div>
  </SwipeableNotificationRow>);
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  await screen.findByRole("status");
  expect(open).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  const row = screen.getByText("Notice text").closest(".notification-swipe-content");
  if (!row) throw new Error("Missing row");
  fireEvent.touchStart(row, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchMove(row, { touches: [{ clientX: 140, clientY: 100 }] }); fireEvent.touchEnd(row);
  expect(reveal).toHaveBeenCalledOnce(); expect(remove).not.toHaveBeenCalled();
});
it("swiping right reveals and triggers the acknowledge action; rows without it ignore right swipes", async () => {
  const ack = vi.fn(), remove = vi.fn(), reveal = vi.fn();
  show(<SwipeableNotificationRow revealed={false} resetEpoch={0} removing={false} onReveal={reveal} onClose={() => {}} onAction={remove} actionLabel="Delete" actionIcon={Trash2}
    secondaryAction={{ onAction: ack, label: "Acknowledge", icon: Check }}>
    <div><p>Swipe me</p></div>
  </SwipeableNotificationRow>);
  const row = screen.getByText("Swipe me").closest(".notification-swipe-content");
  if (!row) throw new Error("Missing row");
  fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchMove(row, { touches: [{ clientX: 160, clientY: 100 }] }); fireEvent.touchEnd(row);
  expect(reveal).toHaveBeenCalledExactlyOnceWith("right");
  expect(remove).not.toHaveBeenCalled(); expect(ack).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  expect(ack).toHaveBeenCalledOnce(); expect(remove).not.toHaveBeenCalled();
});
it("a right swipe on a delete-only row neither reveals nor acts", () => {
  const remove = vi.fn(), reveal = vi.fn(), close = vi.fn();
  show(<SwipeableNotificationRow revealed={false} resetEpoch={0} removing={false} onReveal={reveal} onClose={close} onAction={remove} actionLabel="Delete" actionIcon={Trash2}>
    <div><p>Delete only</p></div>
  </SwipeableNotificationRow>);
  const row = screen.getByText("Delete only").closest(".notification-swipe-content");
  if (!row) throw new Error("Missing row");
  fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchMove(row, { touches: [{ clientX: 160, clientY: 100 }] }); fireEvent.touchEnd(row);
  expect(reveal).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce(); expect(remove).not.toHaveBeenCalled();
});
it.each([
  { already_acknowledged: true }, { acknowledged: true, notified: false, sender_id: "sender", title: "Seen" },
])("never pushes for already acknowledged or no new receipt: %j", async result => {
  const push = vi.fn(); await receiptAndPush("notice", async () => result, push); expect(push).not.toHaveBeenCalled();
});
it("push links repair receipts to the existing popup and other types home; failures are best effort", async () => {
  const base: ReceiptResult = { acknowledged: true, notified: true, sender_id: "sender", title: "Seen" };
  const push = vi.fn(async (_result: ReceiptResult, _target: string) => {});
  await receiptAndPush("notice", async () => ({ ...base, entity_type: "maintenance_issue", entity_id: "repair" }), push);
  expect(push.mock.calls[0][1]).toBe("/?entryKind=repair&entryId=repair");
  await receiptAndPush("notice", async () => ({ ...base, entity_type: "order", entity_id: "order" }), push);
  expect(push.mock.calls[1][1]).toBe("/");
  expect((await receiptAndPush("notice", async () => base, async () => { throw new Error("Offline"); })).push_failed).toBe(true);
});
it("notification actor is the verified human caller, never service credentials", () => {
  expect(notificationActor("human")).toBe("human"); expect(notificationActor("human", true)).toBeNull(); expect(notificationActor(null)).toBeNull();
});