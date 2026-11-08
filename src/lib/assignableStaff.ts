/**
 * Shared rule for "who can be assigned work" dropdowns.
 *
 * Family members (level = "principal" or "extended_family") must NEVER appear
 * in assignee pickers for tasks, maintenance, planned maintenance, car wash,
 * etc. They are recipients of service, not performers of it.
 *
 * Archived people (is_archived = true — they have left) never appear either.
 * Name lookups on historical records must NOT use this filter.
 *
 * Profiles missing a `level` value are kept (legacy/staff-by-default), so this
 * only excludes records explicitly tagged as family.
 */
const FAMILY_LEVELS = new Set(["principal", "extended_family"]);

export function isAssignableStaff(p: { level?: string | null; is_archived?: boolean | null }): boolean {
  if (p.is_archived === true) return false;
  return !p.level || !FAMILY_LEVELS.has(p.level);
}

export function filterAssignableStaff<T extends { level?: string | null; is_archived?: boolean | null }>(profiles: T[]): T[] {
  return profiles.filter(isAssignableStaff);
}

