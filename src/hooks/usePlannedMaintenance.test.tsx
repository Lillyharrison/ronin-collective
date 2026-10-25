import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { usePlannedMaintenance } from "./usePlannedMaintenance";

const mocks = vi.hoisted(() => ({ from: vi.fn(), notice: vi.fn(), row: {
  id: "job", title: "HVAC", assigned_to: null, property_id: null, date_type: "month_only",
  scheduled_date: null as string | null, scheduled_time: null, scheduled_month: 7, scheduled_year: 2027,
  status: "to_be_booked", recurrence_months: null,
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "actor" }, loading: false }) }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOfflineSync: () => ({ notifyQueued: vi.fn() }) }));
vi.mock("@/lib/maintenanceNotifications", () => ({ notifyPlannedSaved: mocks.notice }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.row.scheduled_date = null;
  mocks.from.mockImplementation(() => {
    let patch: Record<string, unknown> | undefined;
    const query = {
      select: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query), eq: vi.fn(() => query),
      update: vi.fn((value: Record<string, unknown>) => { patch = value; return query; }),
      single: vi.fn(async () => {
        if (patch) Object.assign(mocks.row, patch);
        return { data: { ...mocks.row }, error: null };
      }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [{ ...mocks.row }], error: null }).then(resolve),
    };
    return query;
  });
});

it("routes list status updates and date edits through one persisted before/after notification path", async () => {
  const { result } = renderHook(() => usePlannedMaintenance());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.updateEntry("job", { date_type: "specific", scheduled_date: "2027-07-01", status: "booked" }); });
  expect(mocks.notice).toHaveBeenCalledTimes(1);
  expect(mocks.notice.mock.calls[0][0].scheduled_date).toBeNull();
  expect(mocks.notice.mock.calls[0][1].scheduled_date).toBe("2027-07-01");
  await act(async () => { await result.current.updateEntry("job", { status: "booked" }); });
  expect(mocks.notice.mock.calls[1][0].scheduled_date).toBe("2027-07-01");
  expect(mocks.notice.mock.calls[1][1].scheduled_date).toBe("2027-07-01");
});