import { z } from "zod";

export const inputSchema = z.union([
  z.object({ action: z.literal("current"), user_id: z.string().uuid() }).strict(),
  z.object({ user_id: z.string().uuid(), new_email: z.string().trim().email().max(254).transform(v => v.toLowerCase()) }).strict(),
]);

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***${local.length > 1 ? local[local.length - 1] : ""}@${domain}`;
}

export function duplicateEmail(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "email_exists" || error.code === "user_already_exists" || /already (?:been )?(?:registered|used)|already exists/i.test(error.message ?? ""));
}

export interface ChangeEmailDeps {
  callerId: () => Promise<string | null>;
  callerIsAdmin: () => Promise<boolean>;
  target: (id: string) => Promise<{ master: boolean; archived: boolean; email: string | null }>;
  update: (id: string, email: string, password: string) => Promise<{ code?: string; message?: string } | null>;
  revoke: (id: string) => Promise<boolean>;
  send: (email: string) => Promise<boolean>;
  audit: (id: string, caller: string, oldMask: string, newMask: string) => Promise<boolean>;
  password: () => string;
}

export async function changeEmail(body: unknown, d: ChangeEmailDeps) {
  const fail = (status: number, error: string) => ({ status, body: { error } });
  const caller = await d.callerId();
  if (!caller) return fail(401, "Please sign in to continue.");
  if (!await d.callerIsAdmin()) return fail(403, "Only an admin can change login emails.");
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return fail(400, "Enter a valid person and email address.");
  const input = parsed.data;
  const target = await d.target(input.user_id);
  if (target.master) return fail(403, "A master admin's login email cannot be changed here.");
  if (target.archived) return fail(400, "This person is archived.");
  if (!target.email) return fail(400, "This person has no login.");
  if (!("new_email" in input)) return { status: 200, body: { masked_email: maskEmail(target.email) } };
  if (input.new_email === target.email.toLowerCase()) return fail(400, "Enter a different email address.");
  const error = await d.update(input.user_id, input.new_email, d.password());
  if (duplicateEmail(error)) return fail(409, "That email is already used by another person");
  if (error) return fail(400, "The email could not be changed. Please try again.");
  // Auth and the owner RPC are not transactional: never conceal a partial change.
  const revoked = await d.revoke(input.user_id);
  let emailSent = false;
  if (revoked) { try { emailSent = await d.send(input.new_email); } catch { /* Changed successfully, delivery can be retried. */ } }
  const audited = await d.audit(input.user_id, caller, maskEmail(target.email), maskEmail(input.new_email));
  if (!revoked) return fail(500, "Email changed, but old sessions could not be ended. Ask an admin to retry session revocation before sending a password reset.");
  if (!audited) return fail(500, "Email changed and old sessions ended, but the audit could not be saved. Ask an admin to check the change.");
  return { status: 200, body: { ok: true, emailSent } };
}