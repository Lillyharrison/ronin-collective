import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ allowed: new Set<string>() as ReadonlySet<string> | null, userId: "viewer" as string | null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: mocks.userId }) }));
vi.mock("@/hooks/useVisibleStaffIds", () => ({ useVisibleStaffIds: () => mocks.allowed }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: async () => ({ data: { week_start: "2026-10-19", week_end: "2026-10-25", range_start: "2026-10-19", range_end: "2026-10-25", staff: [{ id: "viewer", full_name: "Viewer" }, { id: "hidden", full_name: "Mercy" }], properties: [], shifts: [{ staff_id: "hidden" }], schedules: [], leave_requests: [] }, error: null }) },
  from: () => { const q = { select: () => q, gte: () => q, lte: () => q, eq: () => q, or: () => q, limit: async () => ({ data: [], error: null }) }; return q; },
} }));
vi.mock("@/components/calendar/staff/utils", () => ({ getDisplayName: (p: { full_name?: string }) => p?.full_name ?? "", buildDisplayShifts: (_days: unknown, _schedules: unknown, shifts: { staff_id: string }[]) => shifts.map(s => ({ ...s, shift_date: "2026-10-19", is_leave: false })) }));
vi.mock("@/components/calendar/staff/ShiftChip", () => ({ ShiftChip: () => null }));
import SharedStaffSchedule from "./SharedStaffSchedule";

function openShare() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/share/long-valid-test-token"]}><Routes><Route path="/share/:token" element={<SharedStaffSchedule />} /></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { mocks.userId = "viewer"; mocks.allowed = new Set(); });
it("signed-in shared weeks hide forbidden staff while showing self without shifts", async () => {
  openShare();
  await waitFor(() => expect(screen.getByText("Viewer")).toBeInTheDocument());
  expect(screen.queryByText("Mercy")).toBeNull();
});
it("does not trust service-role share shifts as failure fallback evidence", async () => {
  mocks.allowed = null;
  openShare();
  await waitFor(() => expect(screen.getByText("Viewer")).toBeInTheDocument());
  expect(screen.queryByText("Mercy")).toBeNull();
});
it("preserves anonymous token-authorized sharing", async () => {
  mocks.userId = null;
  openShare();
  await waitFor(() => expect(screen.getByText("Mercy")).toBeInTheDocument());
});