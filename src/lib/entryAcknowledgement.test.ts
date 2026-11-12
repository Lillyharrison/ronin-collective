import { describe, expect, it } from "vitest";
import { canAcknowledgeEntry, needsAcknowledgement } from "./entryAcknowledgement";
import { acknowledgeAndPush } from "../../supabase/functions/_shared/acknowledgeEntry";
import { vi } from "vitest";

const entry = { id: "entry", reported_by: "family", assigned_to: "worker", property_id: "house", ack_required: true, acknowledged_at: null };
describe("acknowledgement eligibility", () => {
  it.each(["admin", "master_admin"])("allows %s without assigned house", role => {
    expect(canAcknowledgeEntry(entry, { userId: "admin", role })).toBe(true);
  });
  it("allows only managers with house access", () => {
    expect(canAcknowledgeEntry(entry, { userId: "manager", role: "manager", assignedPropertyIds: ["house"] })).toBe(true);
    expect(canAcknowledgeEntry(entry, { userId: "manager", role: "manager", assignedPropertyIds: ["other"] })).toBe(false);
    expect(canAcknowledgeEntry({ ...entry, property_id: null }, { userId: "manager", role: "manager", assignedPropertyIds: ["house"] })).toBe(false);
  });
  it("allows the assignee but not other staff", () => {
    expect(canAcknowledgeEntry(entry, { userId: "worker", role: "staff" })).toBe(true);
    expect(canAcknowledgeEntry(entry, { userId: "other", role: "staff" })).toBe(false);
  });
  it.each(["master_admin", "admin", "manager", "staff"])("never allows sender even with role %s", role => {
    expect(canAcknowledgeEntry({ ...entry, assigned_to: "family" }, { userId: "family", role, assignedPropertyIds: ["house"] })).toBe(false);
  });
  it("rejects signed out viewers", () => expect(canAcknowledgeEntry(entry, { userId: null, role: "admin" })).toBe(false));
  it("requires ack_required and no acknowledgment timestamp", () => {
    expect(needsAcknowledgement(entry)).toBe(true);
    expect(needsAcknowledgement({ ...entry, ack_required: false })).toBe(false);
    expect(needsAcknowledgement({ ...entry, acknowledged_at: "2026-11-12T03:40:00Z" })).toBe(false);
  });
});
describe("atomic RPC and push-only orchestration", () => {
  it("calls RPC once with note and sends exactly one sender push with entry tap target", async () => {
    const result = { acknowledged: true, sender_id: "family", title: "We've seen your repair", body: "Kelly has seen it" };
    const rpc = vi.fn().mockResolvedValue(result); const push = vi.fn();
    await acknowledgeAndPush("repair", "entry", "On it", rpc, push);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("repair", "entry", "On it");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(result, "/?entryKind=repair&entryId=entry");
  });
  it("concurrent taps dispatch only the winning RPC push", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ acknowledged: true, sender_id: "family", title: "Seen", body: "Seen" }).mockResolvedValueOnce({ already_acknowledged: true, sender_id: "family" });
    const push = vi.fn();
    const results = await Promise.all([acknowledgeAndPush("task", "entry", null, rpc, push), acknowledgeAndPush("task", "entry", null, rpc, push)]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(results[1].already_acknowledged).toBe(true);
  });
  it("keeps acknowledgement successful when push fails", async () => {
    const result = await acknowledgeAndPush("task", "entry", null, vi.fn().mockResolvedValue({ acknowledged: true, sender_id: "family", title: "Seen" }), vi.fn().mockRejectedValue(new Error("offline")));
    expect(result.acknowledged).toBe(true); expect(result.push_failed).toBe(true);
  });
  it("does not push after a server permission error", async () => {
    const push = vi.fn();
    await expect(acknowledgeAndPush("repair", "entry", null, vi.fn().mockRejectedValue(new Error("Not allowed")), push)).rejects.toThrow("Not allowed");
    expect(push).not.toHaveBeenCalled();
  });
});