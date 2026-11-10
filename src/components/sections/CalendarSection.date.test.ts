import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(async () => ({ error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: mocks.update }) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { rescheduleEvent } from "./CalendarSection";
const originalTZ = process.env.TZ;
afterEach(() => { process.env.TZ = originalTZ; vi.clearAllMocks(); });
it.each(["America/Los_Angeles", "America/New_York", "Europe/Rome", "Pacific/Auckland"])("repair drag writes the target plain day in %s", async zone => {
  process.env.TZ = zone;
  mocks.update.mockReturnValue({ eq: mocks.eq });
  const event = { start_date: "2026-11-22T00:00:00Z", all_day: true, _source: "maintenance", _source_id: "repair-id" } as Parameters<typeof rescheduleEvent>[0];
  expect(await rescheduleEvent(event, new Date(2026, 10, 23))).toBe(true);
  expect(mocks.update).toHaveBeenCalledWith({ scheduled_date: "2026-11-23" });
  expect(mocks.eq).toHaveBeenCalledWith("id", "repair-id");
});
