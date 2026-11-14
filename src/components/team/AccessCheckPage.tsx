import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ShieldCheck, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { useAccessCheck } from "./useAccessCheck";
import { ACCESS_COPY, ACCESS_REFRESH_COPY, MAIN_ACCESS_TABLES, accessIssueText, accessTableName, accessTime, newestAccessCheck, reportIssues, wrongAlertReason, type AccessReport } from "./accessCheckLogic";

export function AccessCheckPage({ onClose, onEditHouses, suspended = false }: { onClose: () => void; onEditHouses: (id: string) => void; suspended?: boolean }) {
  const { isMasterAdmin, userId } = usePermissions();
  const { language } = useLanguage();
  const { registerBackHandler } = useNavigation();
  const en = language === "en", c = ACCESS_COPY[en ? "en" : "es"];
  const [target, setTarget] = useState<string | null>(null);
  const alertsRef = useRef<HTMLElement>(null);
  const [highlight, setHighlight] = useState(false);
  const { overview, report, findings, dismiss, personCheck, refreshPerson, checkAll, progress, personErrors } = useAccessCheck(userId, isMasterAdmin, target);
  const refreshCopy = ACCESS_REFRESH_COPY[en ? "en" : "es"];
  const lastChecked = newestAccessCheck(overview.data ?? []);
  useEffect(() => { if (suspended) return; registerBackHandler(() => { if (target) setTarget(null); else onClose(); return true; }); return () => registerBackHandler(null); }, [target, onClose, suspended, registerBackHandler]);
  if (!isMasterAdmin) return null;
  const issues = (overview.data ?? []).reduce((sum, row) => sum + (row.issues?.length || 0), 0);
  const failure = (retry: () => void) => <div role="alert" className="py-3 text-destructive"><p>{c.error}</p><Button variant="outline" disabled={!!progress} onClick={retry}>{c.retry}</Button></div>;
  const r = report.data;
  return <div className="min-w-0 space-y-6 px-4 py-4 pb-24 break-words">
    <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" size="icon" aria-label={c.back} onClick={() => target ? setTarget(null) : onClose()}><ArrowLeft /></Button><ShieldCheck className="shrink-0 text-gold"/><h1 className="font-display text-2xl">{c.title}</h1></div>
    {!target ? <>
      <section className="space-y-3 border-b border-border pb-5">
        {overview.isPending ? <p role="status">{en ? "Checking…" : "Comprobando…"}</p> : overview.isError ? failure(() => { void overview.refetch(); }) : overview.data?.length ? <p className={`font-semibold ${issues ? "text-status-urgent" : "text-status-done"}`}>{issues ? `${issues} ${c.issues}` : `${c.clear}, ${overview.data.length} ${c.checked}`}</p> : <p>{refreshCopy.empty}</p>}
        <Button variant="outline" disabled={overview.isFetching || !!progress} onClick={() => { void checkAll(); }}><RefreshCw/>{c.check}</Button>
        {progress && <p role="status" className="text-sm text-muted-foreground">{refreshCopy.progress(progress.current, progress.total)}</p>}
        {lastChecked && <p className="text-sm text-muted-foreground">{c.last}: {accessTime(lastChecked, en)}</p>}
      </section>
      <section className="divide-y divide-border">
        {(overview.data ?? []).map(row => <div key={row.person.id}><Button disabled={!!progress} variant="ghost" className="w-full h-auto min-h-16 justify-start whitespace-normal py-3 px-0 text-left" onClick={() => { setHighlight(false); setTarget(row.person.id); }}>
          <span className="size-11 shrink-0 rounded-full bg-muted flex items-center justify-center font-display">{(row.person.name || "?").slice(0, 1)}</span>
          <span className="flex-1 min-w-0 space-y-1"><span className="block font-semibold">{row.person.name}</span><span className="block text-sm text-muted-foreground">{levelLabel(row.person.role === "master_admin" || row.person.role === "admin" ? row.person.role : row.person.level, en)} · {row.person.houses?.length ?? 0} {c.houses.toLowerCase()}</span>{row.is_admin_level && <span className="block text-sm text-muted-foreground">{c.design}</span>}<span className={`inline-block text-sm ${row.ok ? "text-status-done" : "text-status-urgent"}`}>{row.ok ? c.clear : `${row.issues?.length ?? 0} ${c.issues}`}</span></span><ChevronRight className="shrink-0"/>
        </Button><p className="text-sm text-muted-foreground">{c.last}: {accessTime(row.checked_at, en)}</p>{personErrors[row.person.id] && failure(() => { void refreshPerson(row.person.id); })}</div>)}
      </section>
      <section className="space-y-3"><h2 className="font-display text-xl">{c.hourly}</h2>
        {findings.isPending && <p role="status">{en ? "Loading…" : "Cargando…"}</p>}
        {findings.isError ? failure(() => { void findings.refetch(); }) : <>
          {findings.data?.open.length === 0 && <p className="text-muted-foreground">{c.empty}</p>}
          {findings.data?.open.map(f => <div key={f.id} className="border-b border-border py-3 space-y-2"><Button disabled={!!progress} variant="link" className="h-auto min-h-11 p-0 whitespace-normal text-left" onClick={() => setTarget(f.person_id)}>{f.person_name || c.none}</Button><p>{accessIssueText(f.rule, en)}</p><p className="text-sm text-muted-foreground">{en ? "First seen" : "Detectado por primera vez"}: {accessTime(f.first_seen, en)}</p><Button variant="outline" disabled={dismiss.isPending} onClick={() => dismiss.mutate(f.id)}>{c.dismiss}</Button></div>)}
          {dismiss.isError && failure(() => { if (dismiss.variables) dismiss.mutate(dismiss.variables); })}
          <details><summary className="min-h-11 py-3 cursor-pointer">{c.resolved} ({findings.data?.resolved.length ?? 0})</summary>{findings.data?.resolved.map(f => <div key={f.id} className="border-b border-border py-3 text-muted-foreground"><p>{f.person_name}: {accessIssueText(f.rule, en)}</p><p className="text-sm">{accessTime(f.resolved_at, en)}</p></div>)}</details>
        </>}
      </section>
    </> : report.isPending ? <p role="status">{en ? "Checking this person…" : "Comprobando a esta persona…"}</p> : report.isError ? failure(() => { void report.refetch(); }) : r && <>
      <h2 className="font-display text-2xl">{r.person.name}</h2>
      <p className="text-sm text-muted-foreground">{c.last}: {accessTime(personCheck.data?.checked_at ?? overview.data?.find(row => row.person.id === target)?.checked_at, en)}</p>
      {personCheck.isFetching && <p role="status" className="text-sm text-muted-foreground">{refreshCopy.progress(1, 1)}</p>}
      {personCheck.isError && failure(() => { if (target) void refreshPerson(target); })}
      {r.is_admin_level && <p className="text-muted-foreground">{c.design}</p>}
      <section className="border-l-4 border-status-urgent pl-3 space-y-3"><h3 className="font-semibold">{c.problems}</h3>{reportIssues(r).length === 0 && <p className="text-status-done">{c.clear}</p>}{reportIssues(r).map(issue => <div key={issue.rule}><p>{accessIssueText(issue.rule, en)} ({issue.count})</p>{issue.rule === "other_house_data" || issue.rule === "roster_outside_assigned_houses" ? <Button variant="link" className="h-auto min-h-11 whitespace-normal px-0" onClick={() => onEditHouses(r.person.id)}>{c.fix}</Button> : issue.rule === "wrong_alert" ? <Button variant="link" className="h-auto min-h-11 whitespace-normal px-0" onClick={() => { setHighlight(true); alertsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{c.reviewAlerts}</Button> : <p className="text-sm text-muted-foreground">{en ? "Review the app’s house-less record rules; changing houses alone may not fix this." : "Revisar las reglas de registros sin casa; cambiar las casas puede no resolverlo."}</p>}</div>)}</section>
      <section><h3 className="font-semibold mb-2">{c.houses}</h3><div className="flex flex-wrap gap-2">{r.person.houses?.length ? r.person.houses.map(h => <span key={h} className="border border-border rounded px-2 py-1 text-sm">{h}</span>) : c.none}</div><p className="mt-3">{c.sections}: {r.person.sections_on ?? 0} · {c.alerts}: {r.person.alerts_on ?? 0}</p></section>
      <section><h3 className="font-semibold mb-2">{c.visible}</h3><TableCounts report={r} en={en} main/><details><summary className="min-h-11 py-3 cursor-pointer">{c.more}</summary><TableCounts report={r} en={en} main={false}/></details></section>
      <section ref={alertsRef} className="scroll-mt-24 space-y-3"><h3 className="font-semibold">{c.recent}</h3>{!(r.alerts_last_14_days?.length || r.alerts_that_look_wrong?.length) && <p className="text-muted-foreground">{c.noAlerts}</p>}{[...(r.alerts_last_14_days ?? []), ...(r.alerts_that_look_wrong ?? []).filter(a => !r.alerts_last_14_days?.some(b => a.when === b.when && a.title === b.title))].map((a, i) => { const why = wrongAlertReason(a, r.alerts_that_look_wrong ?? []); return <div key={i} className={`border-b border-border py-3 space-y-1 ${why ? "border-l-4 border-l-destructive pl-3" : ""} ${why && highlight ? "bg-destructive/10" : ""}`}><p className="font-medium">{a.title}</p><p className="text-sm text-muted-foreground">{accessTime(a.when, en)} · {a.house || c.none} · {a.from || (en ? "System" : "Sistema")}{a.read != null && ` · ${a.read ? c.read : c.unread}`}</p>{why && <p className="text-sm text-destructive">{why === "wrong_alert" ? accessIssueText(why, en) : why}</p>}</div>; })}</section>
    </>}
    <p className="text-sm text-muted-foreground border-t border-border pt-4">{c.note}</p>
  </div>;
}
function TableCounts({ report, en, main }: { report: AccessReport; en: boolean; main: boolean }) {
  return <div className="divide-y divide-border">{Object.entries(report.tables ?? {}).filter(([key]) => !!MAIN_ACCESS_TABLES[key] === main).map(([key, value]) => <div key={key} className="flex flex-wrap items-center gap-2 py-3"><span className="flex-1 min-w-0">{accessTableName(key, en)}</span><span>{value.can_see}</span>{value.outside_their_houses > 0 && <span className="text-sm text-destructive border border-destructive rounded px-2 py-1">{value.outside_their_houses} {ACCESS_COPY[en ? "en" : "es"].outside}</span>}</div>)}</div>;
}
function levelLabel(level: string | null, en: boolean) { const labels: Record<string, [string, string]> = { master_admin: ["Master admin", "Administradora principal"], admin: ["Admin", "Administrador"], manager: ["Manager", "Gerente"], staff: ["Staff", "Personal"], principal: ["Family", "Familia"], extended_family: ["Extended family", "Familia extendida"] }; return labels[level ?? ""]?.[en ? 0 : 1] ?? level ?? "—"; }