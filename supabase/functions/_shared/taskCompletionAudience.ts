/** Task-completion notices never include section subscribers or managers by rank. */
export function taskCompletionRecipients(creator: string | null | undefined, completer: string, roles: { user_id: string; role: string }[]): string[] {
  return [...new Set([...(creator ? [creator] : []), ...roles.filter(r => r.role === "admin" || r.role === "master_admin").map(r => r.user_id)])].filter(id => id !== completer);
}