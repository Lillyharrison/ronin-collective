/** Keep the prior family-filtered list on lookup failure; never hide an existing assignment. */
export function selectAssignableProfiles<T extends { id: string }>(profiles: T[], allowedIds: ReadonlySet<string> | null, currentAssignee?: string | null) {
  return {
    profiles: allowedIds === null ? profiles : profiles.filter(p => allowedIds.has(p.id) || p.id === currentAssignee),
    filteredOut: allowedIds !== null && profiles.some(p => !allowedIds.has(p.id) && p.id !== currentAssignee),
    unavailableCurrent: !!currentAssignee && allowedIds !== null && !allowedIds.has(currentAssignee),
    missingCurrent: !!currentAssignee && !profiles.some(p => p.id === currentAssignee),
  };
}

export function assigneeAccessNote(spanish: boolean) {
  return spanish ? " (no puede ver esta pantalla)" : " (can't see this screen)";
}

export function assigneeAccessHint(sections: string[], spanish: boolean) {
  const screens = sections.map(section => section === "tasks" ? (spanish ? "Tareas" : "Tasks") : (spanish ? "Mantenimiento" : "Maintenance"));
  return spanish
    ? `Solo se muestran personas que pueden iniciar sesión y ver ${screens.join(" y ")}.`
    : `Only people who can sign in and see ${screens.join(" and ")} are listed.`;
}