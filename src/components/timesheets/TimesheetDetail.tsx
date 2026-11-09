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
  classification,
  flagLabel,
  hoursFor,
  monthEnd,
  monthName,
  timeLabel,
  rosterTime,
  reasonLabels,
  safeZone,
  type Timesheet,
  type Adjustment,
  type Property,
} from "./logic";
import { downloadSheet } from "./excel";
import { VisitEditor, type VisitSeed } from "./VisitEditor";
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
}: {
  staff: string;
  period: string;
  es: boolean;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const t = (a: string, b: string) => (es ? b : a);
  const [seed, setSeed] = useState<VisitSeed | null>(null);
  const [confirm, setConfirm] = useState<"issue" | "reopen" | "paid" | null>(
    null,
  );
  const [why, setWhy] = useState("");
  const [paid, setPaid] = useState(new Date().toISOString().slice(0, 10));
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
            .select("payee_name,hourly_rate,currency,rounding_minutes")
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
  const rate = active
    ? Number(active.hourly_rate)
    : d.settings?.hourly_rate == null
      ? null
      : Number(d.settings.hourly_rate);
  const rounding = d.settings?.rounding_minutes || 15;
  const hours = active
    ? Number(active.total_hours)
    : d.entries
        .filter((e) => e.status !== "not_worked")
        .reduce((sum, e) => sum + hoursFor(e, rounding), 0);
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
  const hoursAmount = active
    ? Number(active.hours_amount)
    : d.entries
        .filter((e) => e.status !== "not_worked")
        .reduce(
          (sum, e) =>
            sum + Math.round(hoursFor(e, rounding) * (rate || 0) * 100) / 100,
          0,
        );
  const total = hoursAmount + adjustments;
  const name =
    active?.payee_name || d.settings?.payee_name || d.profile.full_name;
  const green = d.entries.filter((e) => classification(e) === "green");
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
        <h2 className="text-xl font-semibold break-words">{name}</h2>
        <p>
          {monthName(period, es)} ·{" "}
          {rate == null
            ? t("Hourly rate not set", "Tarifa sin configurar")
            : money(rate) + " / h"}
        </p>
        <span
          className={
            active?.status === "paid"
              ? "timesheet-green"
              : active
                ? "timesheet-issued"
                : "text-muted-foreground"
          }
        >
          {active
            ? active.status === "paid"
              ? t("Paid", "Pagado")
              : `${t("Issued", "Emitido")} v${active.version}`
            : t("Review", "Revisión")}
        </span>
      </header>
      <div className="flex flex-wrap gap-2">
        {!active ? (
          <>
            <Button
              disabled={busy || !green.length}
              onClick={() =>
                mutate(() =>
                  result(
                    db.rpc("approve_time_entries", {
                      _ids: green.map((e) => e.id),
                    }),
                  ),
                )
              }
            >
              {t("Approve all green", "Aprobar todos los verdes")}
            </Button>
            <Button variant="outline" onClick={() => setSeed({ date: period })}>
              {t("Add visit", "Añadir visita")}
            </Button>
            <Button variant="outline" onClick={() => setAdjust(true)}>
              {t("Add expense or adjustment", "Añadir gasto o ajuste")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => exportFile(active)}>
              {t("Download Excel", "Descargar Excel")}
            </Button>
            {active.status === "issued" && (
              <Button variant="outline" onClick={() => setConfirm("paid")}>
                {t("Mark as paid", "Marcar pagado")}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setWhy("");
                setConfirm("reopen");
              }}
            >
              {t("Re-open", "Reabrir")}
            </Button>
          </>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="hidden lg:grid timesheet-grid font-semibold border-b py-2">
          <span>{t("Date / House", "Fecha / Casa")}</span>
          <span>{t("Rostered", "Horario")}</span>
          <span>{t("Clocked", "Registro")}</span>
          <span>{t("Hours / Amount", "Horas / Importe")}</span>
          <span>{t("Reason / Note", "Tipo / Nota")}</span>
          <span>{t("Actions", "Acciones")}</span>
        </div>
        {d.entries.map((e) => (
          <article
            key={e.id}
            className={`timesheet-line timesheet-${classification(e)} lg:grid timesheet-grid border-b py-3 space-y-2 lg:space-y-0`}
          >
            <div>
              {e.visit_date}
              <br />
              <strong>{e.property?.name || "—"}</strong>
            </div>
            <div>
              {rosterTime(e.scheduled_start)} – {rosterTime(e.scheduled_end)}
            </div>
            <div>
              {timeLabel(e.clock_in, e.property?.timezone)} –{" "}
              {timeLabel(e.clock_out, e.property?.timezone)}
              {(e.adj_in || e.adj_out) && (
                <p>
                  {t("Adjusted", "Ajustado")}:{" "}
                  {timeLabel(e.adj_in || e.clock_in, e.property?.timezone)} –{" "}
                  {timeLabel(e.adj_out || e.clock_out, e.property?.timezone)}
                </p>
              )}
              {[...e.flags, ...(!e.clock_out ? ["still_open"] : [])].map(
                (f) => (
                  <span className="timesheet-flag" key={f}>
                    {f === "still_open"
                      ? t("Still clocked in", "Sigue trabajando")
                      : flagLabel(f, es)}
                  </span>
                ),
              )}
            </div>
            <div>
              {hoursFor(e, rounding).toFixed(2)} h<br />
              {money(
                e.status === "not_worked"
                  ? 0
                  : hoursFor(e, rounding) * (rate || 0),
              )}
            </div>
            <div>
              {reasonLabels.find((r) => r[0] === e.reason)?.[es ? 2 : 1] ||
                e.reason}
              <p className="break-words">{e.note}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {!active && (
                <>
                  {e.status === "pending" && (
                    <Button
                      variant="outline"
                      disabled={busy || !e.clock_out}
                      onClick={() =>
                        mutate(() =>
                          result(
                            db.rpc("approve_time_entries", { _ids: [e.id] }),
                          ),
                        )
                      }
                    >
                      {t("Approve", "Aprobar")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setSeed({ entry: e })}
                  >
                    {!e.clock_out
                      ? t("End visit", "Terminar visita")
                      : t("Edit", "Editar")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setSeed({ entry: e, notWorked: true })}
                  >
                    {t("Didn't work", "No trabajó")}
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
        {!d.entries.length && (
          <p className="py-4">
            {t("No recorded visits", "Sin visitas registradas")}
          </p>
        )}
      </div>
      {missing.map((v, i) => (
        <div
          key={`${v.property_id}-${v.visit_date}-${i}`}
          className="border-b py-3 timesheet-attention flex flex-wrap justify-between gap-2"
        >
          <span>
            {v.visit_date} · {v.property_name} ·{" "}
            {t("Rostered, no sign-in", "Programada, sin registro")}
          </span>
          {!active && (
            <Button
              variant="outline"
              onClick={() =>
                setSeed({
                  property_id: v.property_id,
                  date: v.visit_date,
                  start: v.start_time,
                  end: v.end_time,
                })
              }
            >
              {t("Add visit", "Añadir visita")}
            </Button>
          )}
        </div>
      ))}
      <section>
        <h3 className="font-semibold">
          {t("Expenses and adjustments", "Gastos y ajustes")}
        </h3>
        {d.adjustments.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap gap-2 justify-between border-b py-2"
          >
            <span>
              {a.occurred_on} · {a.description} · {money(Number(a.amount))}
            </span>
            {!active && !a.timesheet_id && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  mutate(() =>
                    result(
                      db
                        .from("timesheet_adjustments")
                        .delete()
                        .eq("id", a.id)
                        .is("timesheet_id", null)
                        .select("id")
                        .single(),
                    ),
                  )
                }
              >
                {t("Delete", "Eliminar")}
              </Button>
            )}
          </div>
        ))}
      </section>
      <footer className="border-y py-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <span>
          {t("Hours", "Horas")}
          <br />
          {hours.toFixed(2)}
        </span>
        <span>
          {t("Rate", "Tarifa")}
          <br />
          {money(rate || 0)}
        </span>
        <span>
          {t("Hours amount", "Importe horas")}
          <br />
          {money(hoursAmount)}
        </span>
        <span>
          {t("Adjustments", "Ajustes")}
          <br />
          {money(adjustments)}
        </span>
        <strong>
          {t("Total", "Total")}
          <br />
          {money(total)}
        </strong>
      </footer>
      {!active && (
        <>
          <Button
            disabled={
              busy ||
              !canIssue(period, d.entries, rate, !!active) ||
              (!d.entries.some((e) => e.status === "approved") &&
                !d.adjustments.some((a) => !a.timesheet_id))
            }
            onClick={() => setConfirm("issue")}
          >
            {t("Issue timesheet", "Emitir hoja de horas")}
          </Button>
          {d.entries.some((e) => e.status === "pending" || !e.clock_out) && (
            <p className="text-muted-foreground">
              {t(
                "Review all pending visits and add missing end times first.",
                "Revisa las visitas pendientes y añade las horas de fin.",
              )}
            </p>
          )}
        </>
      )}
      <section>
        <h3 className="font-semibold">{t("History", "Historial")}</h3>
        {history.data?.map((s) => (
          <div
            key={s.id}
            className="border-b py-3 flex flex-wrap justify-between gap-2"
          >
            <div>
              {monthName(s.period_start, es)} · v{s.version} ·{" "}
              {s.status === "superseded"
                ? t(
                    "Replaced by corrected version",
                    "Reemplazado por versión corregida",
                  )
                : s.status === "paid"
                  ? t("Paid", "Pagado")
                  : t("Issued", "Emitido")}
              <p>
                {Number(s.total_hours).toFixed(2)} h ·{" "}
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
        <h3 className="font-semibold">
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
