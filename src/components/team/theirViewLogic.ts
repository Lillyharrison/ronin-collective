export interface TheirAlert {
  id: string; created_at: string; title: string; body: string | null; read: boolean;
  kind: string | null; house: string | null; from: string | null; copies: number; outside_their_houses: boolean; entity_id?: string | null;
}
export interface TheirEntry {
  title?: string; item?: string; status?: string; due?: string | null; house?: string | null;
  assigned_to?: string | null; from?: string | null; reported_by?: string | null;
  mine?: boolean; start?: string; date?: string; to?: string;
}
export interface TheirView {
  alerts: TheirAlert[]; tasks: TheirEntry[]; repairs: TheirEntry[]; orders: TheirEntry[];
  calendar_next_14_days: TheirEntry[]; shifts_next_14_days: TheirEntry[];
}
export function repeatIds(alerts: TheirAlert[]): string[] {
  const seen = new Set<string>();
  return [...alerts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).filter(a => {
    if (a.entity_id === undefined) return false;
    const key = JSON.stringify([a.title, a.kind, a.entity_id]);
    if (seen.has(key)) return true;
    seen.add(key); return false;
  }).map(a => a.id);
}
export function wrongHouseIds(alerts: TheirAlert[]): string[] {
  return alerts.filter(a => a.outside_their_houses).map(a => a.id);
}