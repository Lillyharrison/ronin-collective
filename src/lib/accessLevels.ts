export type AccessLevel = "off" | "view" | "add" | "manage";
export type AccessSwitches = { view?: boolean; add?: boolean; edit?: boolean };

export function accessLevelOf(row?: AccessSwitches | null): AccessLevel {
  if (!row?.view) return "off";
  return row.edit ? "manage" : row.add ? "add" : "view";
}
export function accessSwitchesFor(level: AccessLevel) {
  return { view: level !== "off", add: level === "add" || level === "manage", edit: level === "manage" };
}
export function allowsAdd(row?: AccessSwitches | null) {
  return row?.view === true && (row.add === true || row.edit === true);
}
export const ADD_SECTIONS = ["maintenance", "tasks", "orders"];
export const CHILD_SECTIONS: Record<string, string> = {
  "maintenance-repairs": "maintenance", "maintenance-planned": "maintenance",
  "calendar-travel": "calendar", "calendar-birthdays": "calendar", "calendar-maintenance": "calendar",
  "calendar-deliveries": "calendar", "calendar-staff": "calendar",
};