import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { rosterVisibleIds } from "@/lib/visibleStaff";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), userId: "viewer" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: mocks.userId }) }));
import { useVisibleStaffIds } from "./useVisibleStaffIds";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
beforeEach(() => { vi.clearAllMocks(); mocks.userId = "viewer"; });
it("caches the lookup per signed-in viewer and honors an empty successful result", async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  const { wrapper } = setup();
  const { result, rerender } = renderHook(() => useVisibleStaffIds(), { wrapper });
  await waitFor(() => expect(result.current).toEqual(new Set()));
  rerender();
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("visible_staff_ids");
  expect([...rosterVisibleIds(result.current, "viewer", [{ staff_id: "hidden" }], [])]).toEqual(["viewer"]);
});
it("loading exposes only the viewer and database-returned shifts/patterns", () => {
  mocks.rpc.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useVisibleStaffIds(), { wrapper: setup().wrapper });
  expect(result.current).toBeNull();
  expect([...rosterVisibleIds(result.current, "viewer", [{ staff_id: "shift-staff" }], [{ staff_id: "pattern-staff" }])]).toEqual(["shift-staff", "pattern-staff", "viewer"]);
});
it("failed lookup never falls back to all profiles", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
  const { client, wrapper } = setup();
  const { result } = renderHook(() => useVisibleStaffIds(), { wrapper });
  await act(async () => { await client.refetchQueries({ queryKey: ["visible-staff-ids"] }); });
  await waitFor(() => expect(client.getQueryState(["visible-staff-ids", "viewer"])?.status).toBe("error"));
  const ids = rosterVisibleIds(result.current, "viewer", [], []);
  expect(["viewer", "Mercy", "other-staff"].filter(id => ids.has(id))).toEqual(["viewer"]);
});