import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), canEdit: false, language: "en" }));
vi.mock("@/lib/notificationDetail", () => ({ fetchNotificationDetail: mocks.fetch }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "signed-in-user", canEdit: () => mocks.canEdit }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: mocks.language, t: (value: string) => value }) }));
import { NotificationRecordDialog } from "./NotificationRecordDialog";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.canEdit = false; mocks.language = "en"; });
function open(type: "task" | "birthday" | "planned_maintenance" = "task") {
  const close = vi.fn(); const edit = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <NotificationRecordDialog target={{ type, id: "record-id" }} onClose={close} onEditPlanned={edit} />
  </QueryClientProvider>);
  return { close, edit };
}
it("shows loading until the signed-in lookup completes", () => {
  mocks.fetch.mockReturnValue(new Promise(() => {}));
  open();
  expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledWith("task", "record-id");
});
it.each(["missing", "denied"])("shows the same closable missing-record state for %s", async state => {
  if (state === "missing") mocks.fetch.mockResolvedValue(null); else mocks.fetch.mockRejectedValue(new Error("Access denied"));
  const { close } = open();
  expect(await screen.findByText("This item no longer exists, or you no longer have access to it.")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Close", exact: true })[0]);
  expect(close).toHaveBeenCalled();
});
it("renders a compact read-only task with sender and assignee", async () => {
  mocks.fetch.mockResolvedValue({ type: "task", record: { title_en: "Check windows", description_en: "Upstairs", status: "pending", assignee_name: "Joanne", sender_name: "Ronin", due_date: "2026-10-26", property_name: "Grosvenor" } });
  open();
  expect(await screen.findByText("Check windows")).toBeInTheDocument();
  expect(screen.getByText("Joanne")).toBeInTheDocument();
  expect(screen.getByText("Ronin")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
});
it("birthday uses a profile and localized birthday label", async () => {
  mocks.language = "es";
  mocks.fetch.mockResolvedValue({ type: "birthday", record: { full_name: "Kelly", avatar_url: null } });
  open("birthday");
  expect(await screen.findByText("Cumpleaños hoy")).toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledWith("birthday", "record-id");
});
it.each([false, true])("planned Edit matches maintenance edit permission (%s)", async allowed => {
  mocks.canEdit = allowed;
  mocks.fetch.mockResolvedValue({ type: "planned_maintenance", record: { id: "record-id", title: "HVAC", status: "booked", scheduled_date: "2026-10-26", date_type: "specific", reminder_days: 30, recurrence_months: 6 } });
  const { edit } = open("planned_maintenance");
  await screen.findByText("HVAC");
  if (allowed) { fireEvent.click(screen.getByRole("button", { name: "Edit" })); expect(edit).toHaveBeenCalledWith("record-id"); }
  else expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
});