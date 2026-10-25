import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ allowed: new Set<string>() as ReadonlySet<string> | null, shifts: [] as { staff_id: string }[], schedules: [] as { staff_id: string }[] }));
vi.mock("@/hooks/useVisibleStaffIds", () => ({ useVisibleStaffIds: () => mocks.allowed }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canSee: () => false, isMasterAdmin: true, isAdmin: true, assignedPropertyIds: [] }) }));
vi.mock("@/hooks/useSchedulePublications", () => ({ useSchedulePublications: () => ({ isPublished: () => true }) }));
vi.mock("@/hooks/useStaffSchedules", () => ({ useStaffSchedules: () => ({ shifts: mocks.shifts, schedules: mocks.schedules, leaveRequests: [{ id: "leave", staff_id: "Mercy" }], loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [{ id: "viewer", full_name: "Viewer" }, { id: "Mercy", full_name: "Mercy" }, { id: "visible", full_name: "Visible" }], error: null }),
  from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, upsert: () => q, maybeSingle: async () => ({ data: null }), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) }; return q; },
} }));
vi.mock("./staff/utils", () => ({ getDisplayName: (p: { full_name?: string }) => p?.full_name, buildDisplayShifts: () => [] }));
vi.mock("./staff/StaffWeekGrid", () => ({ StaffWeekGrid: ({ staffToShow }: { staffToShow: { id: string; full_name: string }[] }) => <div>{staffToShow.map(p => <p key={p.id}>{p.full_name}</p>)}</div> }));
vi.mock("./staff/CalendarToolbar", () => ({ CalendarToolbar: () => null }));
vi.mock("./staff/StaffFilterBar", () => ({ StaffFilterBar: () => null }));
vi.mock("./staff/LeavePanel", () => ({ LeavePanel: ({ leaveRequests }: { leaveRequests: unknown[] }) => <div data-testid="leave-count">{leaveRequests.length}</div> }));
vi.mock("./staff/ShiftModal", () => ({ ShiftModal: ({ profiles }: { profiles: { id: string }[] }) => <div data-testid="shift-picker">{profiles.map(p => p.id).join(",")}</div> }));
vi.mock("./staff/LeaveModal", () => ({ LeaveModal: () => null }));
vi.mock("./staff/ScheduleManagerDrawer", () => ({ ScheduleManagerDrawer: () => null }));
vi.mock("./staff/PdfExportModal", () => ({ PdfExportModal: () => null }));
vi.mock("./staff/ShareWeekDialog", () => ({ ShareWeekDialog: () => null }));
import { StaffCalendarTab } from "./StaffCalendarTab";

beforeEach(() => { mocks.allowed = new Set(["visible"]); mocks.shifts = []; mocks.schedules = []; });
it("does not render a hidden staff row or leak them through pickers/leave", async () => {
  render(<StaffCalendarTab canEdit userId="viewer" />);
  await waitFor(() => expect(screen.getByText("Viewer")).toBeInTheDocument());
  expect(screen.queryByText("Mercy")).toBeNull();
  expect(screen.getByTestId("shift-picker")).not.toHaveTextContent("Mercy");
  expect(screen.getByTestId("leave-count")).toHaveTextContent("0");
});
it("always renders the viewer's own row even with empty visibility and no shifts", async () => {
  mocks.allowed = new Set();
  render(<StaffCalendarTab canEdit userId="viewer" />);
  await waitFor(() => expect(screen.getByText("Viewer")).toBeInTheDocument());
});
it("unresolved/failed visibility only admits self and returned shift/pattern staff", async () => {
  mocks.allowed = null;
  mocks.schedules = [{ staff_id: "visible" }];
  render(<StaffCalendarTab canEdit userId="viewer" />);
  await waitFor(() => expect(screen.getByTestId("shift-picker")).toHaveTextContent("visible"));
  expect(screen.getByText("Viewer")).toBeInTheDocument();
  expect(screen.queryByText("Mercy")).toBeNull();
});