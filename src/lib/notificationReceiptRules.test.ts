import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("notify-section assigns verified caller actors for every inserted recipient", () => {
  const source = readFileSync("supabase/functions/notify-section/index.ts", "utf8");
  expect(source).toContain("actor_id: notificationActor(user?.id, serviceCall)");
  expect(source).toContain('authHeader === `Bearer ${serviceKey}`');
});
it("receipt wrapper cannot insert notifications or invoke dashboard dismissal", () => {
  const source = readFileSync("supabase/functions/acknowledge-notification/index.ts", "utf8");
  expect(source).toContain('caller.rpc("acknowledge_notification_receipt", { _notification_id: id })');
  expect(source).not.toMatch(/\.insert\(|acknowledged_by|acknowledge_notification"/);
  expect(source).toContain('admin.rpc("ids_with_login"');
});