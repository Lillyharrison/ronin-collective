export type Visit = { property_id: string; property_name: string; start_time: string; end_time: string; visit_date: string; done: boolean };
export type ClockStatus = { enabled: boolean; open: { entry_id: string; clock_in: string; property_id: string; property_name: string; visit_date: string } | null; visits: Visit[]; properties: { id: string; name: string }[]; now: string };
export const reasons = [ ['weekly_visit','Visita semanal','Weekly visit'], ['open','Apertura','Open'], ['shut_down','Cierre','Shut down'], ['contractors','Contratistas','Contractors'], ['in_residence','En residencia','In residence'], ['call_out','Llamada urgente','Call-out'], ['other','Otro','Other'] ] as const;
export function clockState(s: ClockStatus) { return !s.enabled ? 'hidden' : s.open ? 'open' : s.visits.some(v => !v.done) ? 'visits' : s.visits.length ? 'done' : 'extra'; }
export function duration(minutes: number) { const n = Math.max(0, Math.round(minutes)); return `${Math.floor(n / 60)} h ${n % 60} min`; }
export function safeTimezone(zone?: string) { try { new Intl.DateTimeFormat('en', { timeZone: zone || 'UTC' }).format(); return zone || 'UTC'; } catch { return 'UTC'; } }
export function localParts(date: Date, zone: string) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: safeTimezone(zone), year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date); const get = (key: string) => p.find(x => x.type === key)?.value || ''; return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) }; }
export function manualTime(hour: string, minute: string, zone: string, now: Date, start?: string) {
  const today = localParts(now, zone).date;
  const desired = Number(hour) * 60 + Number(minute);
  // Search real instants on today's local date; handles offset changes without browser timezone assumptions.
  for (let t = Math.floor(now.getTime()/60000)*60000; t >= now.getTime()-26*3600000; t -= 60000) {
    const local = localParts(new Date(t), zone);
    if (local.date === today && local.minutes === desired && (!start || t > Date.parse(start))) return new Date(t).toISOString();
  }
  return null;
}
export function nearestVisits(visits: Visit[], zones: Record<string,string>, now: Date) { return visits.filter(v=>!v.done).sort((a,b)=> {
  const distance = (v: Visit) => { const [h,m] = v.start_time.split(':').map(Number); return Math.abs(h*60+m-localParts(now,zones[v.property_id]).minutes); }; return distance(a)-distance(b);
}); }
