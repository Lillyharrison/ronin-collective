import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { eligibleNotificationRecipients, reminderCandidates } from "../_shared/notificationAudience.ts";

Deno.test("window reminder uses only assigned login, never wider section audience", () => {
  assertEquals(eligibleNotificationRecipients(reminderCandidates("staff", ["staff", "master"], ["master"]), ["staff", "master"]), ["staff"]);
});
Deno.test("window reminder falls back to login master when no assignee", () => {
  assertEquals(eligibleNotificationRecipients(reminderCandidates(null, ["master"], ["master", "draft"]), ["master"]), ["master"]);
});
Deno.test("window reminder falls back when assignee has no login", () => {
  assertEquals(eligibleNotificationRecipients(reminderCandidates("draft", ["master"], ["master"]), ["master"]), ["master"]);
});