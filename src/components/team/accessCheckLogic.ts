export interface AccessPerson { id: string; name: string; level: string | null; role: string | null; sections_on: number; alerts_on: number; houses: string[]; }
export interface AccessIssue { rule: string; what: string; count: number; why?: string; when?: string; }
export interface AccessOverview { person: AccessPerson; is_admin_level: boolean; issues: AccessIssue[]; ok: boolean; checked_at?: string | null; }
export interface AccessAlert { when: string; title: string; house?: string | null; from?: string | null; read?: boolean; why?: string; }
export interface AccessReport {
  person: AccessPerson; is_admin_level: boolean;
  tables: Record<string, { can_see: number; outside_their_houses: number; latest?: { title: string; created_at: string }[] }>;
  houseless_entries_belonging_to_others: Record<string, number>;
  roster_outside_their_houses: Record<string, number>;
  alerts_last_14_days: AccessAlert[]; alerts_that_look_wrong: AccessAlert[];
}
export interface AccessFinding { id: string; person_id: string; person_name: string | null; rule: string; detail: unknown; status: string; first_seen: string; last_seen: string; resolved_at: string | null; }
export const ACCESS_COPY = {
  en: { title: "Access check", check: "Check now", clear: "All clear", issues: "issues", checked: "people checked", last: "Last checked", design: "Sees everything by design", houses: "Houses", sections: "Sections on", alerts: "Alerts on", problems: "Problems", visible: "What they can see", outside: "outside their houses", more: "More", recent: "Alerts in the last 14 days", hourly: "Found by the hourly check", dismiss: "Dismiss", resolved: "Recently resolved", fix: "Review houses", reviewAlerts: "Review alerts", empty: "No open findings", noAlerts: "No alerts in the last 14 days", note: "This shows what the app’s rules allow this person to see, read only. Nothing is changed and nobody is signed in. Each check is logged.", error: "The check could not be loaded. Please try again.", retry: "Retry", back: "Back", noPeople: "No people to check", none: "None", read: "Read", unread: "Unread" },
  es: { title: "Comprobar acceso", check: "Comprobar ahora", clear: "Todo correcto", issues: "problemas", checked: "personas comprobadas", last: "Última comprobación", design: "Ve todo por diseño", houses: "Casas", sections: "Secciones activadas", alerts: "Alertas activadas", problems: "Problemas", visible: "Lo que puede ver", outside: "fuera de sus casas", more: "Más", recent: "Alertas de los últimos 14 días", hourly: "Detectado en la comprobación horaria", dismiss: "Descartar", resolved: "Resueltos recientemente", fix: "Revisar casas", reviewAlerts: "Revisar alertas", empty: "No hay problemas abiertos", noAlerts: "No hay alertas en los últimos 14 días", note: "Esto muestra lo que las reglas de la aplicación permiten ver a esta persona, solo lectura. No se cambia nada ni se inicia sesión como nadie. Cada comprobación queda registrada.", error: "No se pudo cargar la comprobación. Inténtalo de nuevo.", retry: "Reintentar", back: "Volver", noPeople: "No hay personas que comprobar", none: "Ninguna", read: "Leída", unread: "Sin leer" },
} as const;
export function accessNotificationPath(type: string | null | undefined, master: boolean): string | null { return type === "access_check" && master ? "/meet-team?view=access-check" : null; }
export function accessIssueText(rule: string, en: boolean): string {
  const labels: Record<string, [string, string]> = {
    other_house_data: ["Can read records from a house not on their list", "Puede leer registros de una casa que no tiene asignada"],
    roster_outside_assigned_houses: ["Has upcoming shifts or a weekly pattern at an unassigned house", "Tiene turnos próximos o un horario semanal en una casa no asignada"],
    houseless_entries_of_others: ["Can see someone else’s entries with no house", "Puede ver registros de otra persona sin casa"],
    wrong_alert: ["Was sent an alert they should not have received", "Recibió una alerta que no le correspondía"],
  };
  return labels[rule]?.[en ? 0 : 1] ?? (en ? "Access needs review" : "Hay que revisar el acceso");
}
export function reportIssues(r: AccessReport): AccessIssue[] {
  const issues: AccessIssue[] = [];
  const outside = Object.values(r.tables ?? {}).reduce((n, t) => n + (t.outside_their_houses || 0), 0);
  const roster = Object.values(r.roster_outside_their_houses ?? {}).reduce((n, v) => n + Number(v || 0), 0);
  const houseless = Object.values(r.houseless_entries_belonging_to_others ?? {}).reduce((n, v) => n + Number(v || 0), 0);
  if (outside) issues.push({ rule: "other_house_data", what: "", count: outside });
  if (roster) issues.push({ rule: "roster_outside_assigned_houses", what: "", count: roster });
  if (houseless) issues.push({ rule: "houseless_entries_of_others", what: "", count: houseless });
  if (r.alerts_that_look_wrong?.length) issues.push({ rule: "wrong_alert", what: "", count: r.alerts_that_look_wrong.length });
  return issues;
}
export const MAIN_ACCESS_TABLES: Record<string, [string, string]> = {
  tasks: ["Tasks", "Tareas"], maintenance_issues: ["Repairs", "Reparaciones"], planned_maintenance: ["Planned maintenance", "Mantenimiento programado"], orders: ["Orders", "Pedidos"], shopping_list_items: ["Requests", "Solicitudes"], calendar_events: ["Calendar", "Calendario"], checklist_templates: ["Checklists", "Listas de verificación"], manuals: ["Manuals", "Manuales"], properties: ["Houses", "Casas"],
};
const OTHER_TABLES: Record<string, [string, string]> = { profiles: ["People", "Personas"], staff_shifts: ["Shifts", "Turnos"], staff_schedules: ["Weekly patterns", "Horarios semanales"], staff_leave_requests: ["Leave requests", "Permisos"], vehicles: ["Vehicles", "Vehículos"], car_wash_bookings: ["Car washes", "Lavados de autos"], assets: ["Assets", "Inventario"], vendors: ["Vendors", "Proveedores"], property_rules: ["House rules", "Reglas de la casa"], checklist_items: ["Checklist items", "Elementos de listas"], checklist_sessions: ["Completed checklists", "Listas completadas"], notifications: ["Alerts", "Alertas"], messages: ["Messages", "Mensajes"], chat_threads: ["Conversations", "Conversaciones"] };
export function accessTableName(key: string, en: boolean): string { return (MAIN_ACCESS_TABLES[key] ?? OTHER_TABLES[key])?.[en ? 0 : 1] ?? key.replace(/_/g, " "); }
export function accessTime(value: string | null | undefined, en: boolean): string { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(en ? "en-US" : "es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date); }
export function newestAccessCheck(rows: AccessOverview[]): string | null {
  return rows.reduce<string | null>((latest, row) => {
    const time = row.checked_at ? Date.parse(row.checked_at) : NaN;
    return Number.isFinite(time) && (!latest || time > Date.parse(latest)) ? row.checked_at ?? null : latest;
  }, null);
}
export const ACCESS_REFRESH_COPY = {
  en: { empty: "No checks stored yet. Press Check now.", progress: (current: number, total: number) => `Checking ${current} of ${total}` },
  es: { empty: "Todavía no hay comprobaciones guardadas. Pulsa Comprobar ahora.", progress: (current: number, total: number) => `Comprobando ${current} de ${total}` },
};
export function wrongAlertReason(alert: AccessAlert, wrong: AccessAlert[]): string | null { const match = wrong.find(a => a.when === alert.when && a.title === alert.title); return match ? match.why || "wrong_alert" : null; }