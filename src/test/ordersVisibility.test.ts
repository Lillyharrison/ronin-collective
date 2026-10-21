import { expect, it } from "vitest";
import { SECTION_PERMISSIONS } from "@/contexts/PermissionsContext";

it("lets housekeepers reach property shopping lists by default", () => {
  expect(SECTION_PERMISSIONS.orders).toContain("staff");
});