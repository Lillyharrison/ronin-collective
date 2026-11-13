import { localDateKey } from "@/lib/calendarTime";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  db,
  result,
  allRows,
  monthEntries,
  sheetColumns,
  sheetById,
} from "./api";
import {
  canIssue,
  flagLabel,
  payPreview,
  snapshotByEntry,
  rateFor,
  type PayBasis,
  hoursFor,
  monthEnd,
  monthName,
  timeLabel,
  rosterTime,
  safeZone,
  type Timesheet,
  type Adjustment,
  type Property,
  type Entry,
} from "./logic";
import { downloadSheet } from "./excel";
import { VisitEditor, type VisitSeed } from "./VisitEditor";
import { ChevronDown, ChevronRight, Download, Info, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusChip } from "./StatusChip";
import { VisitCard, visitDate } from "./VisitCard";
import { mainStep, visitFlags } from "./presentation";
type Visit = {
  visit_date: string;
  property_id: string;
  property_name: string;
  start_time: string;
  end_time: string;
};
type Audit = {
  id: string;
  entry_id: string | null;
  timesheet_id: string | null;
  actor_id: string | null;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};
export function TimesheetDetail({
  staff,
  period,
  es,
  userId,
  onPeriodChange,
}: {
  staff: string;
  period: string;
  es: boolean;
  userId: string | null;
  onPeriodChange?: (period: string) => void;
}) {
  const qc = useQueryClient();
  const t = (a: string, b: string) => (es ? b : a);
  const [selectedVisit, setSelectedVisit] = useState<Entry | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [seed, setSeed] = useState<VisitSeed | null>(null);
  const [confirm, setConfirm] = useState<"issue" | "reopen" | "paid" | null>(
    null,
  );
  const [why, setWhy] = useState("");
  const [paid, setPaid] = useState(localDateKey(new Date()));
  const [adjust, setAdjust] = useState(false);
  const [kind, setKind] = useState("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [occurred, setOccurred] = useState("");
  const [busy, setBusy] = useState(false);
  const [auditLimit, setAuditLimit] = useState(50);
  const [historyLimit, setHistoryLimit] = useState(25);
  const q = useQuery({
    queryKey: ["timesheet-detail", userId, staff, period],
    queryFn: async () => {
      const [
        entries,
        visits,
        sheets,
        adjustments,
        settings,
        profile,
        properties,
      ] = await Promise.all([
        monthEntries(staff, period, monthEnd(period)),
        result<Visit[]>(
          db.rpc("effective_visits", {
            _staff: staff,
            _from: period,
            _to: monthEnd(period),
          }),
        ),
        allRows<Timesheet>((a, b) =>
          db
            .from("timesheets")
            .select(sheetColumns)
            .eq("staff_id", staff)
            .eq("period_start", period)
            .order("version", { ascending: false })
            .range(a, b),
        ),
        allRows<Adjustment>((a, b) =>
          db
            .from("timesheet_adjustments")
            .select("id,kind,description,amount,occurred_on,timesheet_id")
            .eq("staff_id", staff)
            .eq("period_start", period)
            .order("id")
            .range(a, b),
        ),
        result<any>(
          db
            .from("staff_time_settings")
            .select("payee_name,hourly_rate,daily_rate,pay_basis,currency,rounding_minutes")
            .eq("staff_id", staff)
            .maybeSingle(),
        ),
        result<any>(
          db.from("profiles").select("full_name").eq("id", staff).single(),
        ),
        allRows<Property>((a, b) =>
          db
            .from("properties")
            .select("id,name,timezone,latitude,longitude,geofence_radius_m")
            .order("id")
            .range(a, b),
        ),
      ]);
      return {
        entries,
        visits,
        sheets,
        adjustments,
        settings,
        profile,
        properties,
      };
    },
  });
  const history = useQuery({
    queryKey: ["timesheet-history", userId, staff, historyLimit],
    queryFn: () =>
      result<Timesheet[]>(
        db
          .from("timesheets")
          .select(sheetColumns.replace(",lines", ""))
          .eq("staff_id", staff)
          .order("period_start", { ascending: false })
          .order("version", { ascending: false })
          .limit(historyLimit),
      ),
  });
  const audit = useQuery({
    queryKey: ["timesheet-audit", userId, staff, period, auditLimit],
    enabled: !!q.data,
    queryFn: async () => {
      const ids = q.data?.entries.map((e) => e.id) || [],
        sheetIds = q.data?.sheets.map((s) => s.id) || [];
      if (!ids.length && !sheetIds.length)
        return { events: [] as Audit[], names: {} as Record<string, string> };
      const filters = [
        ids.length ? `entry_id.in.(${ids.join(",")})` : "",
        sheetIds.length ? `timesheet_id.in.(${sheetIds.join(",")})` : "",
      ]
        .filter(Boolean)
        .join(",");
      const events = await result<Audit[]>(
        db
          .from("time_entry_events")
          .select("id,entry_id,timesheet_id,actor_id,action,detail,created_at")
          .eq("staff_id", staff)
          .or(filters)
          .order("created_at", { ascending: false })
          .limit(auditLimit),
      );
      const actors = [
        ...new Set(
          [
            ...events.map((e) => e.actor_id),
            ...(history.data || []).map((s) => s.issued_by),
          ].filter(Boolean),
        ),
      ];
      const names = actors.length
        ? await result<{ id: string; full_name: string }[]>(
            db
              .from("profiles")
              .select("id,full_name")
              .in("id", actors)
              .limit(actors.length),
          )
        : [];
      return {
        events,
        names: Object.fromEntries(names.map((p) => [p.id, p.full_name])),
      };
    },
  });
  const issuerNames = useQuery({
    queryKey: [
      "timesheet-issuers",
      userId,
      history.data?.map((s) => s.issued_by),
    ],
    enabled: !!history.data,
    queryFn: async () => {
      const ids = [
        ...new Set(
          (history.data || []).map((s) => s.issued_by).filter(Boolean),
        ),
      ];
      if (!ids.length) return {} as Record<string, string>;
      const people = await result<{ id: string; full_name: string }[]>(
        db
          .from("profiles")
          .select("id,full_name")
          .in("id", ids)
          .limit(ids.length),
      );
      return Object.fromEntries(people.map((p) => [p.id, p.full_name]));
    },
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["timesheet-detail"] }),
      qc.invalidateQueries({ queryKey: ["timesheet-overview"] }),
      qc.invalidateQueries({ queryKey: ["timesheet-history"] }),
      qc.invalidateQueries({ queryKey: ["timesheet-audit"] }),
    ]);
  };
  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("Could not save", "No se pudo guardar"),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (q.isError)
    return (
      <div role="alert">
        {q.error.message}
        <Button onClick={() => q.refetch()}>{t("Retry", "Reintentar")}</Button>
      </div>
    );
  if (!q.data) return <p>{t("Loading…", "Cargando…")}</p>;
  const d = q.data;
  const active = d.sheets.find((s) => ["issued", "paid"].includes(s.status));
  const basis: PayBasis = (active?.pay_basis || d.settings?.pay_basis || "hourly") as PayBasis;
  const rate = active
    ? rateFor(basis, { hourly_rate: active.hourly_rate, daily_rate: active.day_rate })
    : rateFor(basis, d.settings);
  const rounding = d.settings?.rounding_minutes || 15;
  const preview = payPreview(d.entries, basis, rate, rounding);
  const snap = active ? snapshotByEntry(active.lines) : null;
  const hours = active ? Number(active.total_hours) : preview.hours;
  const days = active ? Number(active.days_paid ?? Object.values(snap || {}).filter(l => l.label === "full").length) : preview.days;
  const adjustments = active
    ? Number(active.adjustments_amount)
    : d.adjustments
        .filter((a) => !a.timesheet_id)
        .reduce((sum, a) => sum + Number(a.amount), 0);
  const currency = active?.currency || d.settings?.currency || "USD";
  const money = (n: number) =>
    new Intl.NumberFormat(es ? "es" : "en-US", {
      style: "currency",
      currency,
    }).format(n);
  const hoursAmount = active ? Number(active.hours_amount) : preview.amount;
  const payroll = basis === "payroll";
  const rateMissing = !active && !payroll && rate == null;
  const fmtH = (n: number) => (Math.round(n * 100) / 100).toString();
  const daysText = (n: number) => es ? `${n} ${n === 1 ? "día" : "días"}, ${fmtH(hours)} h` : `${n} ${n === 1 ? "day" : "days"}, ${fmtH(hours)} h`;
  const total = hoursAmount + adjustments;
  const name =
    active?.payee_name || d.settings?.payee_name || d.profile.full_name;
  const step = mainStep(d.entries, period, active?.status);
  const reviewCount = d.entries.filter(e => e.status === "pending" || (e.status !== "not_worked" && !(e.adj_out || e.clock_out))).length;
  const visitCount = d.entries.filter(e => e.status !== "not_worked").length;
  const issueAllowed = !payroll && canIssue(period, d.entries, rate, !!active) && (d.entries.some(e => e.status === "approved") || d.adjustments.some(a => !a.timesheet_id));
  const status = active?.status === "paid" ? "paid" : active ? "issued" : reviewCount ? "review" : payroll ? "payroll" : "ready";
  const missing = d.visits.filter(
    (v) =>
      v.visit_date <
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: safeZone(
            d.properties.find((p) => p.id === v.property_id)?.timezone,
          ),
        }).format(new Date()) &&
      !d.entries.some(
        (e) => e.property_id === v.property_id && e.visit_date === v.visit_date,
      ),
  );
  async function exportFile(sheet: Timesheet) {
    try {
      const snapshot = Array.isArray(sheet.lines)
        ? sheet
        : await sheetById(sheet.id);
      const ok = await downloadSheet(snapshot, d.profile.full_name);
      if (!ok)
        toast.message(
          t(
            "The record is saved. The file will regenerate on download.",
            "El registro está guardado. El archivo se regenerará al descargarlo.",
          ),
        );
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("Could not download", "No se pudo descargar"),
      );
    }
  }
  return (
    <div className="space-y-5 min-w-0">
      <header>
        <h2 className="font-display text-3xl font-medium break-words">{name}</h2>
        <p className="text-sm text-muted-foreground mt-1">{payroll ? t("Paid through TriNet payroll", "Pagado por nómina TriNet") : rate == null ? t(basis === "daily" ? "Day rate not set" : "Hourly rate not set", "Tarifa sin configurar") : basis === "daily" ? t(`Paid by the day, ${money(rate)} a day`, `Pago por día, ${money(rate)} por día`) : t(`Paid by timesheet, ${money(rate)} an hour`, `Pago por hoja de horas, ${money(rate)} por hora`)}</p>
      </header>
      <section className="timesheet-summary space-y-4" aria-label={t("Month summary", "Resumen del mes")}>
        <div className="grid grid-cols-2 gap-3">
          <div>{basis === "daily" ? <p className="text-2xl font-medium tabular-nums">{daysText(days)}</p> : <p className="text-3xl font-medium tabular-nums">{hours.toFixed(2)} <span className="text-xl">h</span></p>}<p className="text-sm text-muted-foreground mt-2">{visitCount} {t(visitCount === 1 ? "visit" : "visits", visitCount === 1 ? "visita" : "visitas")}</p></div>
          <div className="text-right min-w-0">{!payroll && <p className="text-2xl font-medium tabular-nums break-words">{money(total)}</p>}<div className="mt-2"><StatusChip status={status} count={reviewCount} paidDate={active?.paid_on} es={es} /></div></div>
        </div>
        {step.kind === "open" && <Button className="w-full min-h-12 font-medium" disabled={busy} onClick={() => setSelectedVisit(step.entry)}>{t(`Fix ${step.count} ${step.count === 1 ? "visit" : "visits"}`, `Corregir ${step.count} ${step.count === 1 ? "visita" : "visitas"}`)}</Button>}
        {step.kind === "pending" && <div><Button className="w-full min-h-12 font-medium" disabled={busy} onClick={() => mutate(() => result(db.rpc("approve_time_entries", { _ids: step.ids })))}>{t(`Approve ${step.count} ${step.count === 1 ? "visit" : "visits"}`, `Aprobar ${step.count} ${step.count === 1 ? "visita" : "visitas"}`)}</Button><p className="text-sm text-muted-foreground text-center mt-2">{t("Then you can issue the timesheet", "Después puedes emitir la hoja de horas")}</p></div>}
        {payroll && <p className="text-sm text-muted-foreground">{t("Paid through TriNet. Hours are recorded for reference.", "Pagado por TriNet. Las horas se registran como referencia.")}</p>}
        {rateMissing && <p className="timesheet-warning"><Info size={16} className="shrink-0" />{t("No rate yet. Add it in the Contract tab.", "Aún sin tarifa. Añádela en la pestaña Contrato.")}</p>}
        {step.kind === "ready" && !payroll && <Button className="w-full min-h-12 font-medium" disabled={busy || !issueAllowed} onClick={() => setConfirm("issue")}>{t("Issue timesheet", "Emitir hoja de horas")}</Button>}
        {step.kind === "unfinished" && <p className="text-sm text-muted-foreground">{t(`You can issue this after ${visitDate(monthEnd(period), es, true)}`, `Puedes emitirla después del ${visitDate(monthEnd(period), es, true)}`)}</p>}
        {active && <>
          <div className="flex gap-2">
            <Button className="min-h-12 flex-1 font-medium gap-2" onClick={() => exportFile(active)}><Download size={18} />{t("Download Excel", "Descargar Excel")}</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="h-12 w-12 shrink-0" aria-label={t("Timesheet actions", "Acciones de la hoja")}><MoreHorizontal size={20} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {active.status === "issued" && <DropdownMenuItem className="min-h-11" onSelect={() => setConfirm("paid")}>{t("Mark as paid", "Marcar pagado")}</DropdownMenuItem>}
                <DropdownMenuItem className="min-h-11" onSelect={() => { setWhy(""); setConfirm("reopen"); }}>{t("Re-open", "Reabrir")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-sm text-muted-foreground">{t("Issued", "Emitido")} {new Date(active.issued_at).toLocaleDateString(es ? "es" : "en-US")} {t("by", "por")} {issuerNames.data?.[active.issued_by || ""] || audit.data?.names[active.issued_by || ""] || "—"}, {t("version", "versión")} {active.version}</p>
        </>}
      </section>
      <section className="space-y-2" aria-label={t("Visits", "Visitas")}>
        <div className="timesheet-visits-heading">
          <span className="text-xs font-medium">{t("VISITS", "VISITAS")}</span>
          <div className="timesheet-key text-xs text-muted-foreground"><span><i className="timesheet-dot timesheet-dot-green" />{t("All fine", "Todo bien")}</span><span><i className="timesheet-dot timesheet-dot-amber" />{t("Take a look", "Revisar")}</span><span><i className="timesheet-dot timesheet-dot-grey" />{t("Approved", "Aprobado")}</span></div>
        </div>
        {d.entries.map(e => <VisitCard key={e.id} entry={e} issued={!!active || !!e.timesheet_id} rounding={rounding} es={es} hours={snap?.[e.id]?.hours} dayLabel={snap ? snap[e.id]?.label : basis === "daily" ? preview.labels[e.id] : undefined} onOpen={() => setSelectedVisit(e)} />)}
        {!d.entries.length && <p className="text-sm text-muted-foreground py-4">{t("No recorded visits", "Sin visitas registradas")}</p>}
      </section>
      <section className="space-y-2">
        {d.adjustments.map(a => <div key={a.id} className="timesheet-quiet-row gap-2">
          <span className="min-w-0 flex-1 break-words text-sm">{a.description}</span><span className="shrink-0 tabular-nums text-sm">{money(Number(a.amount))}</span>
          {!active && !a.timesheet_id && <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("Delete adjustment", "Eliminar ajuste")} disabled={busy} onClick={() => mutate(() => result(db.from("timesheet_adjustments").delete().eq("id", a.id).is("timesheet_id", null).select("id").single()))}><Trash2 size={16} /></Button>}
        </div>)}
        {!active && <Button variant="ghost" className="timesheet-quiet-row timesheet-add w-full justify-start gap-2 text-sm font-normal" onClick={() => setAdjust(true)}><Plus size={18} />{t("Add an expense or adjustment", "Añadir gasto o ajuste")}</Button>}
      </section>
      {missing.length > 0 && <section>
        <Button variant="ghost" className="timesheet-quiet-row w-full justify-between text-sm font-normal" aria-expanded={showMissing} onClick={() => setShowMissing(!showMissing)}><span className="flex items-center gap-2"><i className="timesheet-dot timesheet-dot-amber" />{t("Rostered, no sign-in", "Programadas, sin registro")} ({missing.length})</span>{showMissing ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</Button>
        {showMissing && missing.map((v, i) => <div key={`${v.property_id}-${v.visit_date}-${i}`} className="border-b py-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{visitDate(v.visit_date, es)} · {v.property_name} · {rosterTime(v.start_time)} – {rosterTime(v.end_time)}</span>{!active && <Button variant="outline" className="min-h-11" onClick={() => setSeed({ property_id: v.property_id, date: v.visit_date, start: v.start_time, end: v.end_time })}>{t("Add visit", "Añadir visita")}</Button>}</div>)}
      </section>}
      <section>
        <Button variant="ghost" className="timesheet-quiet-row w-full justify-between text-sm font-normal" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>{t("History and activity", "Historial y actividad")}{showHistory ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</Button>
        {showHistory && <div className="space-y-5 py-3">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-muted-foreground">{!payroll && <><dt>{t("Rate", "Tarifa")}</dt><dd className="text-right">{money(rate || 0)} {basis === "daily" ? t("/ day", "/ día") : "/ h"}</dd></>}<dt>{t("Hours amount", "Importe horas")}</dt><dd className="text-right">{money(hoursAmount)}</dd><dt>{t("Adjustments", "Ajustes")}</dt><dd className="text-right">{money(adjustments)}</dd><dt>{t("Total", "Total")}</dt><dd className="text-right font-medium text-foreground">{money(total)}</dd></dl>
          {!active && <Button variant="outline" className="min-h-11 gap-2" onClick={() => setSeed({ date: period })}><Plus size={16} />{t("Add visit", "Añadir visita")}</Button>}
      <section>
        <h3 className="font-medium">{t("History", "Historial")}</h3>
        {history.data?.map((s) => (
          <div
            key={s.id}
            className="border-b py-3 flex flex-wrap justify-between gap-2"
          >
            <div>
              <Button variant="link" className="p-0 min-h-11 font-medium" onClick={() => onPeriodChange?.(s.period_start)}>{monthName(s.period_start, es)}</Button> · v{s.version} ·{" "}
              {s.status === "superseded"
                ? t(
                    "Replaced by corrected version",
                    "Reemplazado por versión corregida",
                  )
                : s.status === "paid"
                  ? t("Paid", "Pagado")
                  : t("Issued", "Emitido")}
              <p>
                {s.pay_basis === "daily" && s.days_paid != null && `${s.days_paid} ${t(s.days_paid === 1 ? "day" : "days", s.days_paid === 1 ? "día" : "días")}, `}{Number(s.total_hours).toFixed(2)} h ·{" "}
                {new Intl.NumberFormat(es ? "es" : "en-US", {
                  style: "currency",
                  currency: s.currency,
                }).format(Number(s.total_amount))}{" "}
                · {t("Issued", "Emitido")}{" "}
                {new Date(s.issued_at).toLocaleDateString()} ·{" "}
                {issuerNames.data?.[s.issued_by || ""] || "—"}
                {s.paid_on && ` · ${t("Paid", "Pagado")} ${s.paid_on}`}
              </p>
            </div>
            <Button variant="outline" onClick={() => exportFile(s)}>
              {t("Download", "Descargar")}
            </Button>
          </div>
        ))}
        {history.data?.length === historyLimit && (
          <Button
            variant="outline"
            onClick={() => setHistoryLimit((n) => n + 25)}
          >
            {t("Load more", "Cargar más")}
          </Button>
        )}
      </section>
      <section>
        <h3 className="font-medium">
          {t("Audit trail", "Registro de cambios")}
        </h3>
        {audit.data?.events.map((a) => (
          <div className="border-b py-2" key={a.id}>
            {a.action.replace(/_/g, " ")} ·{" "}
            {audit.data?.names[a.actor_id || ""] || "—"} ·{" "}
            {new Date(a.created_at).toLocaleString(es ? "es" : "en-US")}
            <p>
              {String(
                a.detail.why || a.detail.reason || a.detail.reopen_reason || "",
              )}
            </p>
          </div>
        ))}
        {audit.data?.events.length === auditLimit && (
          <Button
            variant="outline"
            onClick={() => setAuditLimit((n) => n + 50)}
          >
            {t("Load more", "Cargar más")}
          </Button>
        )}
      </section>
        </div>}
      </section>
      {selectedVisit && (
        <Dialog open onOpenChange={v => !v && setSelectedVisit(null)}>
          <DialogContent aria-describedby={undefined} className="timesheet-detail-sheet h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
            <DialogHeader><DialogTitle className="font-medium">{visitDate(selectedVisit.visit_date, es)} · {selectedVisit.property?.name || "—"}</DialogTitle></DialogHeader>
            <div className="overflow-y-auto flex-1 space-y-4">
              <div className="space-y-2">{visitFlags(selectedVisit).map(f => <p key={f} className="timesheet-warning"><Info size={16} className="shrink-0" />{f === "still_open" ? t("Still clocked in", "Sigue trabajando") : flagLabel(f, es)}</p>)}</div>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-muted-foreground">{t("Rostered", "Horario")}</dt><dd>{rosterTime(selectedVisit.scheduled_start)} – {rosterTime(selectedVisit.scheduled_end)}</dd></div>
                <div><dt className="text-muted-foreground">{t("Clocked", "Registro")}</dt><dd>{timeLabel(selectedVisit.clock_in, selectedVisit.property?.timezone)} – {timeLabel(selectedVisit.clock_out, selectedVisit.property?.timezone)}</dd></div>
                {(selectedVisit.adj_in || selectedVisit.adj_out) && <div><dt className="text-muted-foreground">{t("Adjusted", "Ajustado")}</dt><dd>{timeLabel(selectedVisit.adj_in || selectedVisit.clock_in, selectedVisit.property?.timezone)} – {timeLabel(selectedVisit.adj_out || selectedVisit.clock_out, selectedVisit.property?.timezone)}</dd></div>}
                <div><dt className="text-muted-foreground">{t("Hours", "Horas")}</dt><dd>{(snap?.[selectedVisit.id]?.hours ?? hoursFor(selectedVisit, rounding)).toFixed(2)} h{!payroll && ` · ${money(snap?.[selectedVisit.id]?.amount ?? preview.amounts[selectedVisit.id] ?? 0)}`}</dd></div>
              </dl>
              {selectedVisit.note && <p className="text-sm break-words">{selectedVisit.note}</p>}
            </div>
            {!active && !selectedVisit.timesheet_id && <div className="border-t pt-4 space-y-2">
              {selectedVisit.status === "pending" && <Button className="w-full min-h-11" disabled={busy || !selectedVisit.clock_out} onClick={async () => { const ok = await mutate(() => result(db.rpc("approve_time_entries", { _ids: [selectedVisit.id] }))); if (ok) setSelectedVisit(null); }}>{t("Approve", "Aprobar")}</Button>}
              <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="min-h-11" onClick={() => { setSeed({ entry: selectedVisit }); setSelectedVisit(null); }}>{t("Edit times", "Editar horas")}</Button><Button variant="ghost" className="min-h-11" onClick={() => { setSeed({ entry: selectedVisit, notWorked: true }); setSelectedVisit(null); }}>{t("Didn't work", "No trabajó")}</Button></div>
            </div>}
          </DialogContent>
        </Dialog>
      )}
      {seed && (
        <VisitEditor
          seed={seed}
          staff={staff}
          properties={d.properties}
          es={es}
          onClose={() => setSeed(null)}
          onSaved={refresh}
        />
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
      >
        <AlertDialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
          <AlertDialogTitle>
            {confirm === "issue"
              ? t("Issue timesheet", "Emitir hoja de horas")
              : confirm === "paid"
                ? t("Mark as paid", "Marcar pagado")
                : t("Re-open timesheet", "Reabrir hoja de horas")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === "issue"
              ? `${hours.toFixed(2)} h · ${money(total)}`
              : confirm === "reopen"
                ? t(
                    "The issued version stays in history. Re-issuing creates a corrected version.",
                    "La versión emitida queda en el historial. Se creará una versión corregida.",
                  )
                : t("Choose the payment date.", "Elige la fecha de pago.")}
          </AlertDialogDescription>
          <div className="flex-1 overflow-y-auto">
            {confirm === "reopen" && (
              <Label>
                {t("Reason (required)", "Motivo (obligatorio)")}
                <Input value={why} onChange={(e) => setWhy(e.target.value)} />
              </Label>
            )}
            {confirm === "paid" && (
              <Input
                aria-label={t("Paid date", "Fecha de pago")}
                type="date"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>{t("Cancel", "Cancelar")}</AlertDialogCancel>
            <Button
              disabled={
                busy ||
                (confirm === "reopen" && !why.trim()) ||
                (confirm === "paid" && !paid)
              }
              onClick={async () => {
                if (confirm === "issue") {
                  const ok = await mutate(async () => {
                    const id = await result<string>(
                      db.rpc("issue_timesheet", {
                        _staff_id: staff,
                        _period_start: period,
                      }),
                    );
                    const sheet = await sheetById(id);
                    setConfirm(null);
                    await exportFile(sheet);
                  });
                  if (ok) setConfirm(null);
                } else if (active) {
                  const ok = await mutate(() =>
                    result(
                      db.rpc(
                        confirm === "paid"
                          ? "mark_timesheet_paid"
                          : "reopen_timesheet",
                        confirm === "paid"
                          ? { _timesheet_id: active.id, _paid_on: paid }
                          : { _timesheet_id: active.id, _reason: why },
                      ),
                    ),
                  );
                  if (ok) setConfirm(null);
                }
              }}
            >
              {t("Confirm", "Confirmar")}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={adjust} onOpenChange={setAdjust}>
        <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t("Add expense or adjustment", "Añadir gasto o ajuste")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4">
            <Label>
              {t("Kind", "Tipo")}
              <select
                className="timesheet-input"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="expense">{t("Expense", "Gasto")}</option>
                <option value="adjustment">{t("Adjustment", "Ajuste")}</option>
              </select>
            </Label>
            <Label>
              {t("Description", "Descripción")}
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Label>
            <Label>
              {t("Amount", "Importe")}
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Label>
            <Label>
              {t("Date", "Fecha")}
              <Input
                type="date"
                value={occurred}
                onChange={(e) => setOccurred(e.target.value)}
              />
            </Label>
          </div>
          <Button
            disabled={busy || !description.trim() || amount === ""}
            onClick={async () => {
              if (
                await mutate(() =>
                  result(
                    db
                      .from("timesheet_adjustments")
                      .insert({
                        staff_id: staff,
                        period_start: period,
                        kind,
                        description,
                        amount: Number(amount),
                        occurred_on: occurred || null,
                        created_by: userId,
                      })
                      .select("id")
                      .single(),
                  ),
                )
              ) {
                setAdjust(false);
                setDescription("");
                setAmount("");
              }
            }}
          >
            {t("Save", "Guardar")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
