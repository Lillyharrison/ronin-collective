import { describe, expect, it } from "vitest";
import { accessGroups, buildPermissionRows, groupOnCount, setGroup, switchesOn, togglePermission, allowedQuickActions } from "./memberAccess";
import { buildPermissions } from "@/contexts/PermissionsContext";
import { selectShortcuts } from "@/lib/dashboardShortcuts";

const preview = { isPreviewing: false, realUserId: null, realIsMasterAdmin: false, previewName: null };
const p = (role: "staff" | "manager" | "admin" | "master_admin", rows: Record<string, { view: boolean; edit: boolean; notifications: boolean }> | null) =>
  buildPermissions("u1", role, role === "manager" ? "manager" : "staff", null, [], null, null, rows, false, null, preview);

describe("a new person starts with nothing", () => {
  it("writes no access rows, no shortcuts and no houses", () => {
    expect(buildPermissionRows({}).upserts).toEqual([]);
    expect(switchesOn({})).toBe(0);
    expect(allowedQuickActions({}, false).map(a => a.key).sort()).toEqual(["dashboard", "profile"]);
  });
  it("sees only home and profile", () => {
    const perms = p("staff", null);
    expect(perms.canSee("dashboard")).toBe(true);
    expect(perms.canSee("profile")).toBe(true);
    for (const s of ["tasks", "maintenance", "rules", "messages", "calendar"]) expect(perms.canSee(s)).toBe(false);
  });
});

describe("no role fallback", () => {
  it("managers need explicit rows for see, change and alerts", () => {
    const m = p("manager", null);
    expect(m.canSee("maintenance")).toBe(false);
    expect(m.canEdit("maintenance")).toBe(false);
    expect(m.wantsAlerts("maintenance")).toBe(false);
    const withRow = p("manager", { maintenance: { view: true, edit: false, notifications: true } });
    expect(withRow.canSee("maintenance")).toBe(true);
    expect(withRow.canEdit("maintenance")).toBe(false);
    expect(withRow.wantsAlerts("maintenance")).toBe(true);
  });
  it("master admin and admin keep everything", () => {
    for (const r of ["master_admin", "admin"] as const) {
      const a = p(r, null);
      expect(a.canSee("timeline")).toBe(true); expect(a.canEdit("tasks")).toBe(true); expect(a.wantsAlerts("tasks")).toBe(true);
    }
  });
});

describe("See / Change / Alerts rules", () => {
  it("Change or Alerts on turns See on", () => {
    expect(togglePermission(undefined, "edit", true)).toEqual({ view: true, edit: true, notifications: false });
    expect(togglePermission(undefined, "notifications", true)).toEqual({ view: true, edit: false, notifications: true });
  });
  it("See off turns Change and Alerts off", () => {
    expect(togglePermission({ view: true, edit: true, notifications: true }, "view", false)).toEqual({ view: false, edit: false, notifications: false });
  });
  it("group counts and group toggle", () => {
    const maint = ["maintenance", "maintenance-repairs", "maintenance-planned"];
    let perms = setGroup({}, maint, true);
    expect(groupOnCount(perms, maint)).toBe(3);
    perms = { ...perms, "maintenance-planned": togglePermission(perms["maintenance-planned"], "view", false) };
    expect(groupOnCount(perms, maint)).toBe(2);
    expect(groupOnCount(setGroup(perms, maint, false), maint)).toBe(0);
  });
  it("saves only sections with a switch on and deletes fully-off ones", () => {
    const r = buildPermissionRows({ tasks: { view: true, edit: false, notifications: false }, laundry: { view: false, edit: false, notifications: false } });
    expect(r.upserts.map(x => x.section)).toEqual(["tasks"]);
    expect(r.deletes).toEqual(["laundry"]);
  });
  it("puts unmapped sections in Other so nothing is hidden", () => {
    const other = accessGroups({ "mystery-section": { view: true, edit: false, notifications: false } }).find(g => g.key === "other")!;
    expect(other.sections).toContain("timeline");
    expect(other.sections).toContain("mystery-section");
    expect(other.sections).not.toContain("dashboard");
  });
});

describe("dashboard shortcuts", () => {
  const all = [{ key: "tasks", section: "tasks" }, { key: "calendar", section: "calendar" }];
  it("an empty list shows no shortcuts, never defaults", () => {
    expect(selectShortcuts(all, [], () => true, false)).toEqual([]);
    expect(selectShortcuts(all, null, () => true, false)).toEqual([]);
  });
  it("shows saved shortcuts the person can see", () => {
    expect(selectShortcuts(all, ["tasks", "calendar"], s => s === "tasks", false).map(a => a.key)).toEqual(["tasks"]);
  });
});
