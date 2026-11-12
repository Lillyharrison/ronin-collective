import { expect, it, vi } from "vitest";
import { clockEligiblePeople } from "../../../supabase/functions/time-tracking-reminders/eligibility";

it("skips every non-staff candidate before start/end reminder processing", async () => {
  const people = ["staff", "principal", "extended_family", "manager", "admin", "master_admin"].map(id => ({ id }));
  const rpc = vi.fn(async (id: string) => ({ data: id === "staff", error: null }));
  const sendStart = vi.fn(), sendEnd = vi.fn();
  for (const person of await clockEligiblePeople(people, rpc)) {
    sendStart(person.id); sendEnd(person.id);
  }
  expect(rpc.mock.calls.map(([id]) => id)).toEqual(people.map(p => p.id));
  expect(sendStart.mock.calls).toEqual([["staff"]]);
  expect(sendEnd.mock.calls).toEqual([["staff"]]);
});
it("does not approve missing eligibility or continue on an RPC error", async () => {
  expect(await clockEligiblePeople([{ id: "unknown" }], async () => ({ data: null, error: null }))).toEqual([]);
  await expect(clockEligiblePeople([{ id: "staff" }], async () => ({ data: true, error: new Error("Unavailable") }))).rejects.toThrow("Unavailable");
});