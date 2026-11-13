import { describe, it, expect } from "vitest";
import { filterRecipientsByHouse } from "../../supabase/functions/_shared/houseAccess";
import { NO_HOUSE_MESSAGE, executeObservationTool, lookupHouse, canRunAction, toolsFor, loadAssistantContext, LIMITED_PEOPLE_COLUMNS } from "../../supabase/functions/ronin-ai/scope";

const access: Record<string, string[] | "all"> = { staffA: ["A"], family: [], admin: "all" };
const check = async (u: string, p: string) => access[u] === "all" || (access[u] as string[] ?? []).includes(p);

function fakeDb(log: Array<[string, unknown]>) {
  const chain: any = new Proxy({}, { get: (_t, k) => k === "then" ? (r: any) => r({ data: [], error: null }) : (...a: unknown[]) => { log.push([String(k), a[0]]); return chain; } });
  return { from: (t: string) => { log.push(["from", t]); return chain; } };
}

describe("alert recipients by house", () => {
  it("keeps assigned, drops unassigned, keeps admin", async () => {
    expect(await filterRecipientsByHouse(["staffA", "family", "admin"], ["A"], check)).toEqual({ kept: ["staffA", "admin"], dropped: 1 });
  });
  it("no house on the alert leaves recipients unchanged", async () => {
    expect((await filterRecipientsByHouse(["staffA", "family"], [null], check)).kept).toEqual(["staffA", "family"]);
  });
  it("caller-supplied list for another house is filtered", async () => {
    expect((await filterRecipientsByHouse(["staffA"], ["B"], check)).kept).toEqual([]);
  });
  it("check errors drop the recipient without failing", async () => {
    expect((await filterRecipientsByHouse(["x"], ["A"], async () => { throw new Error("x"); })).kept).toEqual([]);
  });
});

describe("assistant house scope", () => {
  const staffHouses = [{ id: "A", name: "Rockingham" }];
  for (const [who, props] of [["staff", staffHouses], ["family", []]] as const) {
    it(`${who}: another house and a non-existent house give identical answers and no query`, async () => {
      const log: Array<[string, unknown]> = [];
      const ctx = { props: props as any, staff: [] };
      const other = await executeObservationTool("search_tasks", { property_name: "Montanan" }, fakeDb(log), ctx);
      const none = await executeObservationTool("search_tasks", { property_name: "Nowhere House" }, fakeDb(log), ctx);
      expect(other).toEqual({ total: 0, message: NO_HOUSE_MESSAGE });
      expect(none).toEqual(other);
      expect(log).toEqual([]);
    });
  }
  it("a write at a non-accessible house is refused", () => {
    expect(lookupHouse(staffHouses, "Montanan").kind).toBe("missing");
    expect(lookupHouse(staffHouses, "rockingham")).toEqual({ kind: "found", id: "A" });
  });
  it("non-admins get no memories and limited people columns", async () => {
    const log: Array<[string, unknown]> = [];
    await loadAssistantContext(fakeDb(log), false);
    expect(log.filter(l => l[0] === "from").map(l => l[1])).not.toContain("ronin_memories");
    expect(log).toContainEqual(["select", LIMITED_PEOPLE_COLUMNS]);
  });
  it("admins keep memories", async () => {
    const log: Array<[string, unknown]> = [];
    await loadAssistantContext(fakeDb(log), true);
    expect(log.filter(l => l[0] === "from").map(l => l[1])).toContain("ronin_memories");
  });
  it("admin actions refuse non-admins; admins unchanged", () => {
    const staff = { isAdmin: false, isMaster: false }, admin = { isAdmin: true, isMaster: false }, master = { isAdmin: true, isMaster: true };
    expect(canRunAction("invite_user", staff)).toBe(false);
    expect(canRunAction("invite_user", admin)).toBe(true);
    expect(canRunAction("delete_user", admin)).toBe(false);
    expect(canRunAction("delete_user", master)).toBe(true);
    const tools = [{ function: { name: "save_memory" } }, { function: { name: "search_tasks" } }];
    expect(toolsFor(tools, false).map(t => t.function.name)).toEqual(["search_tasks"]);
    expect(toolsFor(tools, true)).toHaveLength(2);
  });
});
