import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  admin: true,
  pending: "mercy" as string | null,
  clear: vi.fn(),
  query: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en" }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    userId: "admin",
    isAdmin: m.admin,
    isMasterAdmin: false,
  }),
}));
vi.mock("@/contexts/NavigationContext", () => ({
  useNavigation: () => ({
    pendingTimesheetStaffId: m.pending,
    setPendingTimesheetStaffId: m.clear,
    registerBackHandler: vi.fn(),
  }),
}));
vi.mock("./TimesheetDetail", () => ({
  TimesheetDetail: ({ staff, period }: { staff: string; period: string }) => (
    <div>
      {staff}:{period}
    </div>
  ),
}));
vi.mock("./Settings", () => ({ TimesheetSettings: () => null }));
vi.mock("./api", () => ({
  db: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        lt: () => q,
        order: () => q,
        limit: () => {
          m.query();
          return Promise.resolve({
            data: [{ visit_date: "2026-09-12" }],
            error: null,
          });
        },
      };
      return q;
    },
    rpc: () => {
      m.rpc();
      return Promise.resolve({ data: [], error: null });
    },
  },
  result: async (q: Promise<{ data: unknown }>) => (await q).data,
  allRows: vi.fn(),
}));
import { TimesheetsTab } from "./TimesheetsTab";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  m.admin = true;
  m.pending = "mercy";
});
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TimesheetsTab />
    </QueryClientProvider>,
  );
describe("timesheet pending targets", () => {
  it("opens the notified person on their most recent waiting month", async () => {
    show();
    expect(await screen.findByText("mercy:2026-09-01")).toBeInTheDocument();
    expect(m.clear).toHaveBeenCalledWith(null);
  });
  it("does not query or render timesheets for a non-admin", async () => {
    m.admin = false;
    const { container } = show();
    await waitFor(() => expect(m.query).not.toHaveBeenCalled());
    expect(m.rpc).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
