import { describe, expect, it } from "vitest";
import { accessLevelOf, accessSwitchesFor, allowsAdd } from "./accessLevels";
import { levelsForSection, buildPermissionRows, setSectionLevel, setGroup, groupOnCount, allowedQuickActions } from "@/components/team/memberAccess";
import { buildPermissions } from "@/contexts/PermissionsContext";
const preview = { isPreviewing: false, realUserId: null, realIsMasterAdmin: false, previewName: null };

describe("access levels", () => {
  it.each([
    ["off", { view: false, add: false, edit: false }],
    ["view", { view: true, add: false, edit: false }],
    ["add", { view: true, add: true, edit: false }],
    ["manage", { view: true, add: true, edit: true }],
  ] as const)("maps %s in both directions and persists exact switches", (level, flags) => {
    expect(accessSwitchesFor(level)).toEqual(flags);
    expect(accessLevelOf(flags)).toBe(level);
    const saved = buildPermissionRows({ tasks: { ...flags, notifications: false } });
    if (level === "off") { expect(saved.upserts).toEqual([]); expect(saved.deletes).toEqual(["tasks"]); }
    else expect(saved.upserts[0]).toMatchObject({ can_view: true, can_add: flags.add, can_edit: flags.edit });
  });
  it("handles legacy edit-only grants as Manage/Add, never Off with hidden bits", () => {
    expect(accessLevelOf({ view: true, edit: true, add: false })).toBe("manage");
    expect(allowsAdd({ view: true, edit: true })).toBe(true);
    expect(accessLevelOf({ view: false, edit: true, add: true })).toBe("off");
    expect(allowsAdd({ view: false, edit: true, add: true })).toBe(false);
  });
  it("offers Add only on Maintenance, Tasks and Orders", () => {
    for (const section of ["maintenance", "tasks", "orders"]) expect(levelsForSection(section)).toEqual(["off", "view", "add", "manage"]);
    for (const section of ["property", "checklists", "manuals", "contacts", "inventory", "laundry", "calendar", "travel", "rules", "staff-schedule"]) expect(levelsForSection(section)).toEqual(["off", "view", "manage"]);
    for (const section of ["todays-snapshot", "achievements", "messages", "meet-team"]) expect(levelsForSection(section)).toEqual(["off", "view"]);
    expect(levelsForSection("maintenance-repairs")).toEqual([]);
    expect(levelsForSection("calendar-staff")).toEqual([]);
  });
  it("parent Off clears child See/Alerts and never saves a hidden child grant", () => {
    const row = { view: true, add: true, edit: true, notifications: true };
    const rows = { maintenance: row, "maintenance-repairs": row };
    expect(setSectionLevel(rows, "maintenance", "off")["maintenance-repairs"]).toMatchObject({ view: false, add: false, edit: false, notifications: false });
    const hidden = { ...rows, maintenance: { ...row, view: false } };
    expect(buildPermissionRows(hidden).upserts).toEqual([]);
    expect(groupOnCount(hidden, Object.keys(hidden))).toBe(0);
  });
  it("group On demotes all sections to View; Off removes every grant", () => {
    const rows = setSectionLevel({}, "tasks", "manage");
    expect(setGroup(rows, ["tasks"], true).tasks).toMatchObject({ view: true, add: false, edit: false });
    expect(buildPermissionRows(setGroup(rows, ["tasks"], false)).upserts).toEqual([]);
  });
  it("canAdd and levelOf follow the row, with admin/master-admin bypass only", () => {
    for (const role of ["staff", "manager", "principal", "admin", "master_admin"] as const) {
      const isAdmin = role === "admin" || role === "master_admin";
      for (const level of ["off", "view", "add", "manage"] as const) {
        const permissions = buildPermissions("u", role, "staff", null, [], null, null, { tasks: { ...accessSwitchesFor(level), notifications: false } }, false, null, preview);
        expect(permissions.canAdd("tasks")).toBe(isAdmin || level === "add" || level === "manage");
        expect(permissions.levelOf("tasks")).toBe(isAdmin ? "manage" : level);
      }
    }
  });
  it("new people have no Add, access rows or creation shortcuts", () => {
    const permissions = buildPermissions("u", "staff", "staff", null, [], null, null, null, false, null, preview);
    expect(permissions.levelOf("tasks")).toBe("off"); expect(permissions.canAdd("tasks")).toBe(false);
    expect(buildPermissionRows({}).upserts).toEqual([]);
    expect(allowedQuickActions({}, false).map(a => a.key)).not.toContain("requestItem");
    expect(allowedQuickActions({}, false).map(a => a.key)).not.toContain("reportIssue");
  });
});