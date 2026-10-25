/** Leave-only records are deliberately not evidence for the failure fallback. */
export function rosterVisibleIds(
  allowedIds: ReadonlySet<string> | null,
  userId: string | null,
  shifts: readonly { staff_id: string }[],
  schedules: readonly { staff_id: string }[],
): ReadonlySet<string> {
  const ids = new Set(allowedIds ?? [...shifts, ...schedules].map(row => row.staff_id));
  if (userId) ids.add(userId);
  return ids;
}