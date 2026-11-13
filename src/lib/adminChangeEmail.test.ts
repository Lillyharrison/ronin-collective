import { describe, expect, it, vi } from "vitest";
import { changeEmail, maskEmail, inputSchema, duplicateEmail, type ChangeEmailDeps } from "../../supabase/functions/admin-change-email/core";

const id = "00000000-0000-4000-8000-000000000001";
function deps(patch: Partial<ChangeEmailDeps> = {}): ChangeEmailDeps {
  return { callerId: async () => id, callerIsAdmin: async () => true, target: async () => ({ master: false, archived: false, email: "hello@lilly6.com" }), update: vi.fn().mockResolvedValue(null), revoke: vi.fn().mockResolvedValue(true), send: vi.fn().mockResolvedValue(true), audit: vi.fn().mockResolvedValue(true), password: () => "random-for-test", ...patch };
}
const body = { user_id: id, new_email: " New@Example.com " };
describe("admin email change", () => {
  it("masks local parts without revealing interiors", () => { expect(maskEmail("hello@lilly6.com")).toBe("h***o@lilly6.com"); expect(maskEmail("a@x.com")).toBe("a***@x.com"); expect(maskEmail("ab@x.com")).toBe("a***b@x.com"); });
  it("requires a signed-in user", async () => { const d = deps({ callerId: async () => null }); expect((await changeEmail(body, d)).status).toBe(401); expect(d.update).not.toHaveBeenCalled(); });
  it("requires an admin", async () => { const d = deps({ callerIsAdmin: async () => false }); expect((await changeEmail(body, d)).status).toBe(403); expect(d.update).not.toHaveBeenCalled(); });
  it("refuses a master admin target including masked lookup", async () => { const d = deps({ target: async () => ({ master: true, archived: false, email: "a@x.com" }) }); for (const b of [body, { user_id: id, action: "current" }]) expect((await changeEmail(b, d)).status).toBe(403); expect(d.update).not.toHaveBeenCalled(); });
  it("validates UUID/email and lowercases input", () => { expect(inputSchema.safeParse({ ...body, user_id: "bad" }).success).toBe(false); expect(inputSchema.safeParse({ ...body, new_email: "bad" }).success).toBe(false); const parsed = inputSchema.parse(body); expect("new_email" in parsed && parsed.new_email).toBe("new@example.com"); });
  it.each([{ master: false, archived: true, email: "a@x.com" }, { master: false, archived: false, email: null }])("refuses archived/no-login targets", async target => { const d = deps({ target: async () => target }); expect((await changeEmail(body, d)).status).toBe(400); expect(d.update).not.toHaveBeenCalled(); });
  it("refuses the same email", async () => { const d = deps(); expect((await changeEmail({ ...body, new_email: "HELLO@lilly6.com" }, d)).status).toBe(400); expect(d.update).not.toHaveBeenCalled(); });
  it("maps duplicate accounts to a friendly 409", async () => { const d = deps({ update: vi.fn().mockResolvedValue({ code: "email_exists" }) }); expect(await changeEmail(body, d)).toEqual({ status: 409, body: { error: "That email is already used by another person" } }); expect(d.revoke).not.toHaveBeenCalled(); expect(duplicateEmail({ message: "Email already registered" })).toBe(true); });
  it("current returns only masked email", async () => { const d = deps(); expect((await changeEmail({ user_id: id, action: "current" }, d)).body).toEqual({ masked_email: "h***o@lilly6.com" }); expect(d.update).not.toHaveBeenCalled(); });
  it("preserves id, rotates password, revokes, sends and masks audit", async () => { const d = deps(); expect((await changeEmail(body, d)).body).toEqual({ ok: true, emailSent: true }); expect(d.update).toHaveBeenCalledWith(id, "new@example.com", "random-for-test"); expect(d.revoke).toHaveBeenCalledWith(id); expect(d.audit).toHaveBeenCalledWith(id, id, "h***o@lilly6.com", "n***w@example.com"); });
  it("reports success despite email delivery failure", async () => { const d = deps({ send: vi.fn().mockRejectedValue(new Error("rate limit")) }); expect((await changeEmail(body, d)).body).toEqual({ ok: true, emailSent: false }); expect(d.audit).toHaveBeenCalled(); });
  it("does not send reset before successful session revocation", async () => { const d = deps({ revoke: vi.fn().mockResolvedValue(false) }); expect((await changeEmail(body, d)).status).toBe(500); expect(d.send).not.toHaveBeenCalled(); expect(d.audit).toHaveBeenCalled(); });
});