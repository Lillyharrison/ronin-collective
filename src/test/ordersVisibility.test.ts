import { expect, it } from "vitest";
import { buildPermissions } from "@/contexts/PermissionsContext";

const preview = { isPreviewing: false, realUserId: null, realIsMasterAdmin: false, previewName: null };
const perms = (role: "staff" | "manager" | "admin" | "master_admin", rows: Record<string, { view: boolean; edit: boolean; notifications: boolean }> | null) =>
  buildPermissions("u1", role, "staff", null, [], null, null, rows, false, null, preview);

it("housekeepers reach shopping lists only through an explicit orders row", () => {
  expect(perms("staff", null).canSee("orders")).toBe(false);
  expect(perms("staff", { orders: { view: true, edit: false, notifications: false } }).canSee("orders")).toBe(true);
});
