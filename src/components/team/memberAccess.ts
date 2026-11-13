// Pure access-editing rules for the team member editor (no React, fully testable).
import { ALL_SECTIONS, ALL_QUICK_ACTIONS, QUICK_ACTION_SECTION, type SectionPerm, type SectionPermissions } from "./teamConstants";

export type PermField = "view" | "edit" | "notifications";
export const ALWAYS_ON_SECTIONS = ["dashboard", "profile"];

export const ACCESS_GROUPS: { key: string; label: string; labelEs: string; sections: string[] }[] = [
  { key: "core", label: "Core", labelEs: "Básico", sections: ["todays-snapshot", "messages", "meet-team", "achievements"] },
  { key: "houses", label: "Houses", labelEs: "Casas", sections: ["property", "manuals", "inventory", "laundry", "car-wash", "orders", "contacts", "rules"] },
  { key: "maintenance", label: "Maintenance", labelEs: "Mantenimiento", sections: ["maintenance", "maintenance-repairs", "maintenance-planned"] },
  { key: "tasks", label: "Tasks", labelEs: "Tareas", sections: ["tasks", "checklists"] },
  { key: "calendar", label: "Calendar", labelEs: "Calendario", sections: ["calendar", "calendar-travel", "calendar-birthdays", "calendar-maintenance", "calendar-deliveries", "calendar-construction", "calendar-staff"] },
  { key: "family", label: "Family", labelEs: "Familia", sections: ["family-calendar", "family-movements", "principal-location", "travel"] },
  { key: "schedule", label: "Schedule", labelEs: "Horario", sections: ["staff-schedule"] },
  { key: "construction", label: "Construction", labelEs: "Construcción", sections: ["timeline"] },
];

/** Groups plus a "More" catch-all, present ONLY when some section is unmapped, so nothing is ever hidden. */
export function accessGroups(existing: SectionPermissions = {}, allSectionKeys: string[] = ALL_SECTIONS.map(s => s.key)) {
  const mapped = new Set([...ACCESS_GROUPS.flatMap(g => g.sections), ...ALWAYS_ON_SECTIONS]);
  const more = [...allSectionKeys, ...Object.keys(existing)]
    .filter((k, i, a) => !mapped.has(k) && k !== "_quick_actions" && a.indexOf(k) === i);
  return more.length ? [...ACCESS_GROUPS, { key: "more", label: "More", labelEs: "Más", sections: more }] : [...ACCESS_GROUPS];
}

// ── Clock in and out on site (staff_time_settings.time_tracking) ─────────────
export type TimeSetting = { time_tracking: string; payee_name: string | null; hourly_rate: number | null; currency: string; rounding_minutes: number } | null;

/** Only people whose role AND level are staff can clock in (the database enforces it). */
export function canHaveClock(role: string | null | undefined, level: string | null | undefined) {
  return role === "staff" && level === "staff";
}

/** What to write for the clock switch. ON keeps existing pay fields; OFF turns 'ronin' into 'none', leaves 'trinet', never creates a row. */
export function clockSettingWrite(staffId: string, current: TimeSetting, on: boolean):
  { staff_id: string; time_tracking: string; payee_name: string | null; hourly_rate: number | null; currency: string; rounding_minutes: number } | null {
  if (on) {
    if (current?.time_tracking === "ronin") return null;
    return {
      staff_id: staffId, time_tracking: "ronin",
      payee_name: current?.payee_name ?? null, hourly_rate: current?.hourly_rate ?? null,
      currency: current?.currency ?? "USD", rounding_minutes: current?.rounding_minutes ?? 15,
    };
  }
  if (current?.time_tracking !== "ronin") return null;
  return { staff_id: staffId, time_tracking: "none", payee_name: current.payee_name, hourly_rate: current.hourly_rate, currency: current.currency, rounding_minutes: current.rounding_minutes };
}

export function sectionInfo(key: string) {
  const s = ALL_SECTIONS.find(x => x.key === key);
  const clean = (t: string) => t.replace(/^\s*↳\s*/, "").trim();
  return { label: clean(s?.label ?? key), labelEs: clean(s?.labelEs ?? key), hasEdit: s?.hasEdit ?? true, hasScope: s?.hasScope ?? false };
}

const off: SectionPerm = { view: false, edit: false, notifications: false };

/** Change or Alerts on => See on. See off => Change and Alerts off. */
export function togglePermission(perm: SectionPerm | undefined, field: PermField, value: boolean): SectionPerm {
  const cur = { ...off, ...perm };
  if (field === "view") return value ? { ...cur, view: true } : { ...cur, view: false, edit: false, notifications: false };
  return { ...cur, [field]: value, ...(value ? { view: true } : {}) };
}

export function setGroup(perms: SectionPermissions, sections: string[], on: boolean): SectionPermissions {
  const next = { ...perms };
  for (const s of sections) next[s] = on ? togglePermission(next[s], "view", true) : togglePermission(next[s], "view", false);
  return next;
}

export function groupOnCount(perms: SectionPermissions, sections: string[]) {
  return sections.filter(s => perms[s]?.view).length;
}

export function sectionsOn(perms: SectionPermissions) {
  return Object.entries(perms).filter(([k, p]) => k !== "_quick_actions" && p?.view).length;
}

export function switchesOn(perms: SectionPermissions) {
  return Object.entries(perms).reduce((n, [k, p]) => k === "_quick_actions" || !p ? n : n + (p.view ? 1 : 0) + (p.edit ? 1 : 0) + (p.notifications ? 1 : 0), 0);
}

/** Rows to save: only sections with a switch on; sections with all three off are deleted. */
export function buildPermissionRows(perms: SectionPermissions) {
  const upserts: { section: string; can_view: boolean; can_edit: boolean; notifications: boolean; scope: "own" | "department" | "all" | null }[] = [];
  const deletes: string[] = [];
  for (const [section, p] of Object.entries(perms)) {
    if (section === "_quick_actions" || !p || typeof p !== "object") continue;
    if (p.view || p.edit || p.notifications) {
      upserts.push({ section, can_view: !!p.view, can_edit: !!p.edit, notifications: !!p.notifications, scope: p.scope ?? null });
    } else deletes.push(section);
  }
  return { upserts, deletes };
}

/** Shortcuts this person's access allows (admins may use any). */
export function allowedQuickActions(perms: SectionPermissions, isAdminRole: boolean) {
  return ALL_QUICK_ACTIONS.filter(qa => {
    if (isAdminRole) return true;
    const section = QUICK_ACTION_SECTION[qa.key] ?? qa.key;
    return ALWAYS_ON_SECTIONS.includes(section) || perms[section]?.view === true;
  });
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
