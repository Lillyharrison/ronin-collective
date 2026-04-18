/**
 * Shared rule for "who can be assigned work" dropdowns.
 *
 * Family members (level = "principal" or "extended_family") must NEVER appear
 * in assignee pickers for tasks, maintenance, planned maintenance, car wash,
 * calendar events, etc. They are recipients of service, not performers of it.
 *
 * Use this filter in any UI list of potential assignees. Profiles missing a
 * `level` value are kept (legacy/staff-by-default), so this only excludes
 * explicit family records.
 */
export type AssignableProfile = { level?: string | null };

const FAMILY_LEVELS = new Set(["principal", "extended_family"]);

export function isAssignableStaff(p: AssignableProfile): boolean {
  return !p.level || !FAMILY_LEVELS.has(p.level);
}

export function filterAssignableStaff<T extends AssignableProfile>(profiles: T[]): T[] {
  return profiles.filter(isAssignableStaff);
}
