import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { eligibleNotificationRecipients } from "../_shared/notificationAudience.ts";

Deno.test("broadcast excludes actor and direct assignee, including admins", () => {
  assertEquals(eligibleNotificationRecipients(["actor", "assignee", "admin"], ["actor", "assignee", "admin"], "actor", ["assignee"]), ["admin"]);
});
Deno.test("direct targets and admins without login are removed", () => {
  assertEquals(eligibleNotificationRecipients(["draft-admin", "draft-staff", "staff"], ["staff"]), ["staff"]);
});