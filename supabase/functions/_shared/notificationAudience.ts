/** Apply exclusions before login filtering, for broadcasts and direct targets alike. */
export function eligibleNotificationRecipients(
  candidates: string[], loginIds: string[], excludeUserId?: string | null, excludeUserIds: string[] = [],
): string[] {
  const excluded = new Set([...excludeUserIds, ...(excludeUserId ? [excludeUserId] : [])]);
  const logins = new Set(loginIds);
  return [...new Set(candidates)].filter(id => logins.has(id) && !excluded.has(id));
}

export function reminderCandidates(assignedTo: string | null, loginIds: string[], masterAdminIds: string[]): string[] {
  return assignedTo && loginIds.includes(assignedTo) ? [assignedTo] : masterAdminIds;
}