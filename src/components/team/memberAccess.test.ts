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
    expect(allowedQuickActions({}, false).map(a => a.key).sort()).toEqual(["dashboard", "profile", "requestItem"]);
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
  it("puts unmapped sections in More so nothing is hidden", () => {
    const other = accessGroups({ "mystery-section": { view: true, edit: false, notifications: false } }).find(g => g.key === "more")!;
    expect(other.sections).not.toContain("timeline");
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

import { canHaveClock, clockSettingWrite, accessGroups as groupsFor } from "./memberAccess";
describe("clock in and out on site", () => {
  it("only staff role and staff level get the row", () => {
    expect(canHaveClock("staff", "staff")).toBe(true);
    for (const [r, l] of [["manager", "manager"], ["admin", "admin"], ["master_admin", "staff"], ["principal", "principal"], ["staff", "manager"]]) expect(canHaveClock(r, l)).toBe(false);
  });
  it("switching on creates a new row with USD and 15 minutes", () => {
    expect(clockSettingWrite("s1", null, true)).toEqual({ staff_id: "s1", time_tracking: "ronin", pay_basis: "hourly", daily_rate: null, payee_name: null, hourly_rate: null, currency: "USD", rounding_minutes: 15 });
  });
  it("switching on keeps existing rate and payee", () => {
    const cur = { time_tracking: "none", payee_name: "Mercy R", hourly_rate: 22, currency: "EUR", rounding_minutes: 30 };
    expect(clockSettingWrite("s1", cur, true)).toEqual({ staff_id: "s1", time_tracking: "ronin", pay_basis: "hourly", daily_rate: null, payee_name: "Mercy R", hourly_rate: 22, currency: "EUR", rounding_minutes: 30 });
  });
  it("switching off sets none, leaves trinet, never creates a row", () => {
    const ronin = { time_tracking: "ronin", payee_name: "P", hourly_rate: 20, currency: "USD", rounding_minutes: 15 };
    expect(clockSettingWrite("s1", ronin, false)?.time_tracking).toBe("none");
    expect(clockSettingWrite("s1", ronin, false)?.hourly_rate).toBe(20);
    expect(clockSettingWrite("s1", { ...ronin, time_tracking: "trinet" }, false)).toBeNull();
    expect(clockSettingWrite("s1", null, false)).toBeNull();
  });
  it("renamed groups and catch-all only when something is unmapped", () => {
    const keys = groupsFor({}).map(g => g.label);
    expect(keys).toContain("Schedule"); expect(keys).toContain("Construction");
    expect(keys).not.toContain("Team"); expect(keys).not.toContain("Other");
    expect(groupsFor({}).find(g => g.key === "construction")?.sections).toEqual(["timeline"]);
    const withUnmapped = groupsFor({ "mystery-section": { view: true, edit: false, notifications: false } });
    expect(withUnmapped.at(-1)).toMatchObject({ label: "More" });
    expect(withUnmapped.at(-1)?.sections).toContain("mystery-section");
    // Nothing unmapped => no catch-all at all.
    expect(groupsFor({}, ["timeline", "staff-schedule", "tasks"]).some(g => g.key === "more")).toBe(false);
  });
});

import { timeSettingWrite, missingRate, withClockShortcut, parseContractNumber, PAY_DEFAULTS } from "./memberAccess";
describe("contract and pay", () => {
  const cur = { time_tracking: "ronin", payee_name: "Mercy R", hourly_rate: 22, daily_rate: null, pay_basis: "hourly" as const, currency: "USD", rounding_minutes: 15 };
  it("empty contract fields save null, never 0", () => {
    expect(parseContractNumber("")).toBeNull(); expect(parseContractNumber("  ")).toBeNull();
    expect(parseContractNumber("4.5")).toBe(4.5); expect(parseContractNumber("0")).toBe(0);
  });
  it("one combined write keeps unedited pay fields when only the clock changes", () => {
    expect(timeSettingWrite("s1", cur, false, null)).toMatchObject({ time_tracking: "none", payee_name: "Mercy R", hourly_rate: 22 });
  });
  it("pay edits keep the clock value", () => {
    expect(timeSettingWrite("s1", cur, true, { ...PAY_DEFAULTS, pay_basis: "daily", daily_rate: 180, payee_name: "Mercy R" }))
      .toMatchObject({ time_tracking: "ronin", pay_basis: "daily", daily_rate: 180, payee_name: "Mercy R" });
  });
  it("never creates a row for defaults, and skips unchanged rows", () => {
    expect(timeSettingWrite("s1", null, false, PAY_DEFAULTS)).toBeNull();
    expect(timeSettingWrite("s1", null, false, null)).toBeNull();
    expect(timeSettingWrite("s1", null, false, { ...PAY_DEFAULTS, hourly_rate: 20 })).toMatchObject({ time_tracking: "none", hourly_rate: 20 });
    expect(timeSettingWrite("s1", cur, true, null)).toBeNull();
  });
  it("rate warning follows the pay basis", () => {
    expect(missingRate({ ...PAY_DEFAULTS })).toBe(true);
    expect(missingRate({ ...PAY_DEFAULTS, hourly_rate: 20 })).toBe(false);
    expect(missingRate({ ...PAY_DEFAULTS, pay_basis: "daily", hourly_rate: 20 })).toBe(true);
    expect(missingRate({ ...PAY_DEFAULTS, pay_basis: "payroll" })).toBe(false);
  });
  it("the clock switch adds 'clock' first and removes it", () => {
    expect(withClockShortcut(["tasks", "clock"], true)).toEqual(["clock", "tasks"]);
    expect(withClockShortcut(["clock", "tasks"], false)).toEqual(["tasks"]);
  });
});
