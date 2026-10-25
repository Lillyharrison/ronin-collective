import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "tester" }) }));
import { useAssignableProfileIds } from "./useAssignableProfileIds";
import { selectAssignableProfiles } from "@/lib/assignableProfiles";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe("assignee eligibility lookup", () => {
  it("returns null while loading so the prior staff list remains available", () => {
    mocks.rpc.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAssignableProfileIds(["tasks"]), { wrapper: setup() });
    expect(result.current).toBeNull();
    const staff = [{ id: "staff-a" }, { id: "staff-b" }];
    expect(selectAssignableProfiles(staff, result.current).profiles).toEqual(staff);
  });
  it("returns null on lookup failure rather than emptying the picker", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    const { result } = renderHook(() => useAssignableProfileIds(["maintenance"]), { wrapper: setup() });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(result.current).toBeNull();
    expect(selectAssignableProfiles([{ id: "staff-a" }], result.current).profiles).toEqual([{ id: "staff-a" }]);
  });
  it("uses a normalized cached key and requires both Maintenance and Tasks", async () => {
    mocks.rpc.mockResolvedValue({ data: ["staff-a"], error: null });
    const { result, rerender } = renderHook(({ sections }) => useAssignableProfileIds(sections), {
      initialProps: { sections: ["tasks", "maintenance"] }, wrapper: setup(),
    });
    await waitFor(() => expect(result.current?.has("staff-a")).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("profile_ids_who_can_see", { _sections: ["maintenance", "tasks"] });
    rerender({ sections: ["maintenance", "tasks", "tasks"] });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it("honors an empty successful eligibility result instead of treating it as failure", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useAssignableProfileIds(["tasks"]), { wrapper: setup() });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(selectAssignableProfiles([{ id: "staff-a" }], result.current).profiles).toEqual([]);
  });
});