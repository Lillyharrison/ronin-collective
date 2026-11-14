import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyUsers } from "./notifySection";
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession } } }));
beforeEach(() => { getSession.mockResolvedValue({ data: { session: { access_token: "test-only" } } }); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true })); });
describe("task completion notification request", () => {
  it("sends explicit creator and audience mode rather than section subscribers", async () => {
    await notifyUsers(["julia"], { title: "Completed", entity_id: "task", entity_type: "task", property_id: "house" }, "drew", { audience: "task_completion" });
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual({ userIds: ["julia"], payload: { title: "Completed", entity_id: "task", entity_type: "task", property_id: "house" }, excludeUserId: "drew", audience: "task_completion" });
  });
  it("still requests admins when there is no creator", async () => {
    await notifyUsers([], { title: "Completed", entity_id: "task", entity_type: "task" }, "drew", { audience: "task_completion" });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({ userIds: [], audience: "task_completion", excludeUserId: "drew" });
  });
});