import { describe, expect, it } from "vitest";
import { taskCompletionRecipients } from "../../supabase/functions/_shared/taskCompletionAudience";
const roles = [{ user_id: "lilly", role: "master_admin" }, { user_id: "admin", role: "admin" }, { user_id: "manager", role: "manager" }, { user_id: "joselita", role: "staff" }, { user_id: "kelly", role: "staff" }, { user_id: "bridget", role: "staff" }, { user_id: "wendy", role: "staff" }];
describe("completed task audience", () => {
  it("notifies Julia and admins only when Drew completes", () => { expect(taskCompletionRecipients("julia", "drew", roles)).toEqual(["julia", "lilly", "admin"]); });
  it("never notifies the completing creator", () => { expect(taskCompletionRecipients("julia", "julia", roles)).toEqual(["lilly", "admin"]); });
  it("excludes a completing admin", () => { expect(taskCompletionRecipients("julia", "admin", roles)).toEqual(["julia", "lilly"]); });
  it("with no creator notifies only admins", () => { expect(taskCompletionRecipients(null, "drew", roles)).toEqual(["lilly", "admin"]); });
  it("deduplicates an admin who created the task", () => { expect(taskCompletionRecipients("lilly", "drew", roles)).toEqual(["lilly", "admin"]); });
  it("includes a manager only when they actually created it", () => { expect(taskCompletionRecipients("manager", "drew", roles)).toEqual(["manager", "lilly", "admin"]); });
});