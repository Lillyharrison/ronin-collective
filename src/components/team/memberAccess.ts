// Pure access-editing rules for the team member editor (no React, fully testable).
import { ALL_SECTIONS, ALL_QUICK_ACTIONS, QUICK_ACTION_SECTION, type SectionPerm, type SectionPermissions } from "./teamConstants";
import { accessLevelOf, accessSwitchesFor, allowsAdd, ADD_SECTIONS, CHILD_SECTIONS, type AccessLevel } from "@/lib/accessLevels";
export { accessLevelOf, type AccessLevel } from "@/lib/accessLevels";

export type PermField = "view" | "edit" | "notifications" | "see_drafts";
export const ALWAYS_ON_SECTIONS = ["dashboard", "profile"];

export const ACCESS_GROUPS: { key: string; label: string; labelEs: string; sections: string[] }[] = [
  { key: "core", label: "Core", labelEs: "Básico", sections: ["todays-snapshot", "messages", "meet-team", "achievements"] },
  { key: "houses", label: "Houses", labelEs: "Casas", sections: ["property", "manuals", "inventory", "laundry", "car-wash", "orders", "contacts", "rules"] },
  { key: "maintenance", label: "Maintenance", labelEs: "Mantenimiento", sections: ["maintenance", "maintenance-repairs", "maintenance-planned"] },
  { key: "tasks", label: "Tasks", labelEs: "Tareas", sections: ["tasks", "checklists"] },
  { key: "calendar", label: "Calendar", labelEs: "Calendario", sections: ["calendar", "calendar-travel", "calendar-birthdays", "calendar-maintenance", "calendar-deliveries", "calendar-staff"] },
  { key: "family", label: "Family", labelEs: "Familia", sections: ["family-calendar", "family-movements", "principal-location", "travel"] },
  { key: "schedule", label: "Schedule", labelEs: "Horario", sections: ["staff-schedule"] },
  { key: "construction", label: "Construction", labelEs: "Construcción", sections: ["timeline"] },
];

/** Groups plus a "More" catch-all, present ONLY when some section is unmapped, so nothing is ever hidden. */
export function accessGroups(existing: SectionPermissions = {}, allSectionKeys: string[] = ALL_SECTIONS.map(s => s.key)) {
  const mapped = new Set([...ACCESS_GROUPS.flatMap(g => g.sections), ...ALWAYS_ON_SECTIONS]);
  const more = [...allSectionKeys, ...Object.keys(existing)]
    .filter((k, i, a) => !mapped.has(k) && k !== "_quick_actions" && k !== "calendar-construction" && a.indexOf(k) === i);
  return more.length ? [...ACCESS_GROUPS, { key: "more", label: "More", labelEs: "Más", sections: more }] : [...ACCESS_GROUPS];
}

// ── Clock in and out on site + pay (staff_time_settings) ──────────────────────
export type PayBasis = "hourly" | "daily" | "payroll" | "salaried";
export type TimeSetting = {
  time_tracking: string; payee_name: string | null; hourly_rate: number | null; currency: string; rounding_minutes: number;
  pay_basis?: PayBasis | null; daily_rate?: number | null;
} | null;
export type PayEdit = { pay_basis: PayBasis; hourly_rate: number | null; daily_rate: number | null; currency: string; payee_name: string | null; rounding_minutes: number };
export type TimeSettingRow = { staff_id: string; time_tracking: string; pay_basis: PayBasis; hourly_rate: number | null; daily_rate: number | null; currency: string; payee_name: string | null; rounding_minutes: number };

export const PAY_DEFAULTS: PayEdit = { pay_basis: "hourly", hourly_rate: null, daily_rate: null, currency: "USD", payee_name: null, rounding_minutes: 15 };
export const CURRENCIES = ["USD", "EUR", "GBP"];
export const ROUNDING_CHOICES = [1, 5, 10, 15, 30, 60];

/** Only people whose role AND level are staff can clock in or be paid here (the database enforces it). */
export function canHaveClock(role: string | null | undefined, level: string | null | undefined) {
  return role === "staff" && level === "staff";
}

export function payFromSetting(current: TimeSetting): PayEdit {
  return {
    pay_basis: (current?.pay_basis as PayBasis) ?? "hourly", hourly_rate: current?.hourly_rate ?? null, daily_rate: current?.daily_rate ?? null,
    currency: current?.currency ?? "USD", payee_name: current?.payee_name ?? null, rounding_minutes: current?.rounding_minutes ?? 15,
  };
}

function hasPayData(p: PayEdit) {
  return p.hourly_rate != null || p.daily_rate != null || !!p.payee_name?.trim() || p.pay_basis !== "hourly"
    || p.currency !== "USD" || p.rounding_minutes !== 15;
}

/**
 * ONE combined write for the clock switch and the Contract tab's pay fields.
 * Clock ON => 'ronin'; OFF turns 'ronin' into 'none' and leaves 'trinet'.
 * pay=null means the pay fields were not edited: existing values are preserved.
 * Returns null when nothing changes, or when there is no row and nothing worth storing.
 */
export function timeSettingWrite(staffId: string, current: TimeSetting, clockOn: boolean, pay: PayEdit | null): TimeSettingRow | null {
  const base = payFromSetting(current);
  const chosen = pay ?? base;
  const nextPay = chosen.pay_basis === "salaried" ? { ...chosen, hourly_rate: null, daily_rate: null } : chosen;
  const tracking = nextPay.pay_basis === "salaried" ? "none" : clockOn ? "ronin" : (current?.time_tracking === "ronin" ? "none" : (current?.time_tracking ?? "none"));
  if (!current && !clockOn && !hasPayData(nextPay)) return null;
  const row: TimeSettingRow = { staff_id: staffId, time_tracking: tracking, ...nextPay, payee_name: nextPay.payee_name?.trim() || null };
  if (current) {
    const same = current.time_tracking === row.time_tracking && JSON.stringify(payFromSetting(current)) === JSON.stringify({ ...nextPay, payee_name: row.payee_name });
    if (same) return null;
  }
  return row;
}

/** Back-compat helper: clock-only change, pay fields preserved. */
export function clockSettingWrite(staffId: string, current: TimeSetting, on: boolean) {
  return timeSettingWrite(staffId, current, on, null);
}

/** The rate the current basis needs is missing (payroll needs none). */
export function missingRate(pay: PayEdit) {
  if (pay.pay_basis === "payroll" || pay.pay_basis === "salaried") return false;
  return pay.pay_basis === "daily" ? pay.daily_rate == null : pay.hourly_rate == null;
}

/** Saved quick actions: 'clock' first when the clock is on, removed when off. */
export function withClockShortcut(quickActions: string[], clockOn: boolean) {
  const rest = quickActions.filter(k => k !== "clock");
  return clockOn ? ["clock", ...rest] : rest;
}

/** Contract number fields: empty => null, never 0 or a default. */
export function parseContractNumber(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function sectionInfo(key: string) {
  const s = ALL_SECTIONS.find(x => x.key === key);
  const clean = (t: string) => t.replace(/^\s*↳\s*/, "").trim();
  return { label: clean(s?.label ?? key), labelEs: clean(s?.labelEs ?? key), hasEdit: s?.hasEdit ?? true, hasScope: s?.hasScope ?? false };
}

const off: SectionPerm = { view: false, edit: false, notifications: false };

export function levelsForSection(section: string): AccessLevel[] {
  if (CHILD_SECTIONS[section]) return [];
  const manage = section !== "meet-team" && section !== "messages" && sectionInfo(section).hasEdit;
  return ["off", "view", ...(ADD_SECTIONS.includes(section) ? ["add" as const] : []), ...(manage ? ["manage" as const] : [])];
}
export function setSectionLevel(perms: SectionPermissions, section: string, level: AccessLevel): SectionPermissions {
  const row = { ...off, ...perms[section], ...accessSwitchesFor(level) };
  if (level === "off") { row.notifications = false; row.see_drafts = false; }
  const next = { ...perms, [section]: row };
  if (level === "off") for (const [child, parent] of Object.entries(CHILD_SECTIONS)) {
    if (parent === section) next[child] = { ...off, ...next[child], ...accessSwitchesFor("off"), notifications: false };
  }
  return next;
}

/** Change or Alerts on => See on. See off => Change and Alerts off. */
export function togglePermission(perm: SectionPerm | undefined, field: PermField, value: boolean): SectionPerm {
  const cur = { ...off, ...perm };
  if (field === "view") return value ? { ...cur, view: true } : { ...cur, view: false, ...(cur.add !== undefined ? { add: false } : {}), edit: false, notifications: false, ...(cur.see_drafts !== undefined ? { see_drafts: false } : {}) };
  return { ...cur, [field]: value, ...(value ? { view: true } : {}) };
}

export function setGroup(perms: SectionPermissions, sections: string[], on: boolean): SectionPermissions {
  const next = { ...perms };
  for (const s of sections) Object.assign(next, setSectionLevel(next, s, on ? "view" : "off"));
  return next;
}

export function groupOnCount(perms: SectionPermissions, sections: string[]) {
  return sections.filter(s => s !== "calendar-construction" && perms[s]?.view && (!CHILD_SECTIONS[s] || perms[CHILD_SECTIONS[s]]?.view)).length;
}

export function sectionsOn(perms: SectionPermissions) {
  return Object.entries(perms).filter(([k, p]) => k !== "_quick_actions" && k !== "calendar-construction" && p?.view && (!CHILD_SECTIONS[k] || perms[CHILD_SECTIONS[k]]?.view)).length;
}

export function switchesOn(perms: SectionPermissions) {
  return Object.entries(perms).reduce((n, [k, p]) => k === "_quick_actions" || !p ? n : n + (p.view ? 1 : 0) + (p.edit ? 1 : 0) + (p.notifications ? 1 : 0) + (k === "staff-schedule" && p.view && p.see_drafts ? 1 : 0), 0);
}

/** Rows to save: only sections with a switch on; sections with all three off are deleted. */
export function buildPermissionRows(perms: SectionPermissions) {
  const upserts: { section: string; can_view: boolean; can_add: boolean; can_edit: boolean; notifications: boolean; see_drafts: boolean; scope: "own" | "department" | "all" | null }[] = [];
  const deletes: string[] = [];
  for (const [section, p] of Object.entries(perms)) {
    if (section === "_quick_actions" || section === "calendar-construction" || !p || typeof p !== "object") continue;
    const parent = CHILD_SECTIONS[section];
    const derived = accessLevelOf(p);
    const level = parent ? (perms[parent]?.view && p.view ? "view" : "off") : levelsForSection(section).includes(derived) ? derived : (p.view ? "view" : "off");
    const flags = accessSwitchesFor(level);
    if (flags.view) {
      upserts.push({ section, can_view: flags.view, can_add: flags.add, can_edit: flags.edit, notifications: !!p.notifications, see_drafts: section === "staff-schedule" && flags.view && !!p.see_drafts, scope: p.scope ?? null });
    } else deletes.push(section);
  }
  return { upserts, deletes };
}

/** Shortcuts this person's access allows (admins may use any). */
export function allowedQuickActions(perms: SectionPermissions, isAdminRole: boolean) {
  return ALL_QUICK_ACTIONS.filter(qa => {
    if (isAdminRole) return true;
    if (qa.key === "requestItem") return allowsAdd(perms.orders);
    if (qa.key === "reportIssue") return allowsAdd(perms.maintenance);
    const section = QUICK_ACTION_SECTION[qa.key] ?? qa.key;
    return ALWAYS_ON_SECTIONS.includes(section) || perms[section]?.view === true;
  });
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Query keys that show staff_time_settings; the member editor and Timesheets settings both invalidate all of them. */
export const TIME_SETTING_QUERY_KEYS = [["timesheet-settings"], ["staff-time-setting"], ["timesheet-detail"], ["timesheet-overview"], ["timesheet-pay-basis"]] as const;
export function invalidateTimeSettings(qc: { invalidateQueries: (f: { queryKey: readonly unknown[] }) => unknown } | null | undefined) {
  if (!qc) return;
  TIME_SETTING_QUERY_KEYS.forEach(queryKey => void qc.invalidateQueries({ queryKey }));
}
