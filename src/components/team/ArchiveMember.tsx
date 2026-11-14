import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Archive, History, Loader2, RotateCcw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export type ArchiveBlockers = { tasks: number; repairs: number; planned_maintenance: number; orders: number; total: number };

export type ArchivedMember = {
  id: string;
  full_name: string | null;
  job_title: string | null;
  department: string | null;
  left_on: string | null;
  archive_note: string | null;
  keep_until: string | null;
};

/** Human-readable list of open work that blocks archiving. */
export function describeBlockers(b: ArchiveBlockers | null, isEN: boolean): string[] {
  if (!b || !b.total) return [];
  const rows: [number, string, string][] = [
    [b.tasks, "open task", "tarea abierta"],
    [b.repairs, "open repair", "reparación abierta"],
    [b.planned_maintenance, "planned job", "trabajo planificado"],
    [b.orders, "open order", "pedido abierto"],
  ];
  return rows.filter(([n]) => n > 0).map(([n, en, es]) => `${n} ${isEN ? en : es}${n === 1 ? "" : (isEN ? "s" : "s")}`);
}

const fmt = (d: string | null) => (d ? format(parseISO(d), "d MMM yyyy") : "—");
const errMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong");

// ─── Archive dialog ──────────────────────────────────────────────────────────
export function ArchiveMemberDialog({ member, isEN, open, onOpenChange, onArchived }: {
  member: { id: string; full_name: string | null };
  isEN: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onArchived: (id: string) => void;
}) {
  const [leftOn, setLeftOn] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [keepUntil, setKeepUntil] = useState("");
  const [blockers, setBlockers] = useState<ArchiveBlockers | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLeftOn(format(new Date(), "yyyy-MM-dd")); setNote(""); setKeepUntil(""); setError(null); setBlockers(null);
    setChecking(true);
    supabase.rpc("archive_blockers", { _profile_id: member.id }).then(({ data, error: e }) => {
      if (e) setError(e.message); else setBlockers(data as unknown as ArchiveBlockers);
      setChecking(false);
    });
  }, [open, member.id]);

  const lines = describeBlockers(blockers, isEN);
  const blocked = (blockers?.total ?? 0) > 0;

  async function submit() {
    if (!leftOn || blocked) return;
    setSubmitting(true); setError(null);
    const { error: e } = await supabase.rpc("archive_profile", {
      _profile_id: member.id, _left_on: leftOn, _note: note.trim() || null, _keep_until: keepUntil || null,
    } as never);
    setSubmitting(false);
    if (e) { setError(e.message); return; }
    toast.success(isEN ? `${member.full_name || "Person"} archived` : `${member.full_name || "Persona"} archivada`);
    onOpenChange(false);
    onArchived(member.id);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="z-[300]">
        <AlertDialogHeader>
          <AlertDialogTitle>{isEN ? `Archive ${member.full_name || "this person"}?` : `¿Archivar a ${member.full_name || "esta persona"}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {isEN
              ? "Their login and access are switched off, future shifts are removed and recurring patterns end on the leaving date. All history is kept."
              : "Se desactiva su acceso, se eliminan turnos futuros y los patrones terminan en la fecha de salida. Se conserva todo el historial."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">{isEN ? "Leaving date" : "Fecha de salida"} *</span>
            <Input type="date" required value={leftOn} onChange={e => setLeftOn(e.target.value)} className="mt-1" aria-label={isEN ? "Leaving date" : "Fecha de salida"} />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">{isEN ? "Note (optional)" : "Nota (opcional)"}</span>
            <Textarea value={note} onChange={e => setNote(e.target.value)} className="mt-1" rows={2} />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">{isEN ? "Keep records until (optional)" : "Conservar registros hasta (opcional)"}</span>
            <Input type="date" value={keepUntil} onChange={e => setKeepUntil(e.target.value)} className="mt-1" />
          </label>
          {checking && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{isEN ? "Checking open work…" : "Revisando trabajo abierto…"}</p>}
          {blocked && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">{isEN ? "Still assigned:" : "Aún asignado:"}</p>
              <ul className="list-disc pl-5 mt-1">{lines.map(l => <li key={l}>{l}</li>)}</ul>
              <p className="mt-2 text-muted-foreground">{isEN ? "Reassign these first, then archive." : "Reasigne esto primero y luego archive."}</p>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>{isEN ? "Cancel" : "Cancelar"}</AlertDialogCancel>
          <Button onClick={() => void submit()} disabled={submitting || checking || blocked || !leftOn} variant="destructive">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : (isEN ? "Archive" : "Archivar")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Archived list ───────────────────────────────────────────────────────────
export async function fetchArchivedMembers(): Promise<ArchivedMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, job_title, department, left_on, archive_note, keep_until")
    .eq("is_archived", true)
    .order("left_on", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ArchivedMember[];
}

export function ArchivedMembersList({ members, isEN, onRestored }: {
  members: ArchivedMember[];
  isEN: boolean;
  onRestored: () => void;
}) {
  const [historyFor, setHistoryFor] = useState<ArchivedMember | null>(null);
  const [restoreFor, setRestoreFor] = useState<ArchivedMember | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function restore() {
    if (!restoreFor) return;
    setRestoring(true);
    const { error } = await supabase.rpc("unarchive_profile", { _profile_id: restoreFor.id });
    setRestoring(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isEN ? "Restored — access is still off" : "Restaurado — el acceso sigue desactivado");
    setRestoreFor(null);
    onRestored();
  }

  if (!members.length) {
    return <p className="text-center py-12 text-muted-foreground text-sm">{isEN ? "No archived people" : "Sin personas archivadas"}</p>;
  }

  return (
    <div className="space-y-2">
      {members.map(m => (
        <div key={m.id} className="bg-card border border-border rounded-xl px-4 py-3">
          <p className="text-foreground text-sm font-medium">{m.full_name || "—"}</p>
          <p className="text-muted-foreground text-[0.6875rem]">{[m.job_title, m.department].filter(Boolean).join(" · ") || "—"}</p>
          <p className="text-muted-foreground text-[0.6875rem] mt-1">
            {isEN ? "Left" : "Salió"}: {fmt(m.left_on)}{m.keep_until ? ` · ${isEN ? "Keep until" : "Conservar hasta"}: ${fmt(m.keep_until)}` : ""}
          </p>
          {m.archive_note && <p className="text-[0.75rem] text-foreground/80 mt-1 whitespace-pre-wrap">{m.archive_note}</p>}
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => setHistoryFor(m)}><History size={14} className="mr-1" />{isEN ? "View history" : "Ver historial"}</Button>
            <Button size="sm" variant="outline" onClick={() => setRestoreFor(m)}><RotateCcw size={14} className="mr-1" />{isEN ? "Restore" : "Restaurar"}</Button>
          </div>
        </div>
      ))}

      <AlertDialog open={!!restoreFor} onOpenChange={o => { if (!o) setRestoreFor(null); }}>
        <AlertDialogContent className="z-[300]">
          <AlertDialogHeader>
            <AlertDialogTitle>{isEN ? `Restore ${restoreFor?.full_name || "this person"}?` : `¿Restaurar a ${restoreFor?.full_name || "esta persona"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {isEN
                ? "They will return to the team list, but their access stays off until you switch it back on in their profile."
                : "Volverá a la lista del equipo, pero su acceso seguirá desactivado hasta que lo active de nuevo en su perfil."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>{isEN ? "Cancel" : "Cancelar"}</AlertDialogCancel>
            <Button onClick={() => void restore()} disabled={restoring}>
              {restoring ? <Loader2 size={16} className="animate-spin" /> : (isEN ? "Restore" : "Restaurar")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {historyFor && <ArchivedHistoryPanel member={historyFor} isEN={isEN} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

// ─── Read-only history ───────────────────────────────────────────────────────
type ShiftRow = { id: string; shift_date: string; start_time: string | null; end_time: string | null; status: string; property: { name: string } | null };
type PatternRow = { id: string; day_of_week: number; start_time: string; end_time: string; effective_from: string; effective_to: string | null; property: { name: string } | null };
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const t5 = (t: string | null) => (t ? t.slice(0, 5) : "—");

function ArchivedHistoryPanel({ member, isEN, onClose }: { member: ArchivedMember; isEN: boolean; onClose: () => void }) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [count, setCount] = useState(0);
  const [range, setRange] = useState<[string | null, string | null]>([null, null]);
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, first, p] = await Promise.all([
        supabase.from("staff_shifts")
          .select("id, shift_date, start_time, end_time, status, property:properties(name)", { count: "exact" })
          .eq("staff_id", member.id).order("shift_date", { ascending: false }).limit(500),
        supabase.from("staff_shifts").select("shift_date").eq("staff_id", member.id).order("shift_date", { ascending: true }).limit(1),
        supabase.from("staff_schedules")
          .select("id, day_of_week, start_time, end_time, effective_from, effective_to, property:properties(name)")
          .eq("staff_id", member.id).order("effective_from", { ascending: false }).limit(100),
      ]);
      if (cancelled) return;
      const rows = (s.data ?? []) as unknown as ShiftRow[];
      setShifts(rows);
      setCount(s.count ?? rows.length);
      setRange([(first.data?.[0] as { shift_date?: string } | undefined)?.shift_date ?? null, rows[0]?.shift_date ?? null]);
      setPatterns((p.data ?? []) as unknown as PatternRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member.id]);

  const days = isEN ? DAYS_EN : DAYS_ES;
  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-background/80" onClick={onClose}>
      <div
        role="dialog"
        aria-label={isEN ? "History" : "Historial"}
        className="w-full sm:max-w-lg h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-medium text-foreground">{member.full_name} — {isEN ? "History" : "Historial"}</p>
          <button onClick={onClose} aria-label={isEN ? "Close" : "Cerrar"} className="w-11 h-11 flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {loading ? <Loader2 className="animate-spin mx-auto" /> : (
            <>
              <section>
                <p className="text-[0.625rem] font-bold tracking-widest uppercase text-gold mb-1">{isEN ? "Weekly patterns" : "Patrones semanales"}</p>
                {patterns.length === 0 ? <p className="text-muted-foreground">—</p> : (
                  <ul className="space-y-1">
                    {patterns.map(p => (
                      <li key={p.id} className="text-foreground/90">
                        {days[p.day_of_week]} {t5(p.start_time)}–{t5(p.end_time)} · {p.property?.name ?? "—"} · {fmt(p.effective_from)} → {p.effective_to ? fmt(p.effective_to) : "—"}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <p className="text-[0.625rem] font-bold tracking-widest uppercase text-gold mb-1">
                  {isEN ? "Shifts" : "Turnos"} ({count}){range[0] ? ` · ${fmt(range[0])} – ${fmt(range[1])}` : ""}
                </p>
                {shifts.length === 0 ? <p className="text-muted-foreground">—</p> : (
                  <ul className="divide-y divide-border">
                    {shifts.map(s => (
                      <li key={s.id} className="py-1.5 flex justify-between gap-2">
                        <span>{fmt(s.shift_date)} · {s.property?.name ?? "—"}</span>
                        <span className="text-muted-foreground">{t5(s.start_time)}–{t5(s.end_time)} · {s.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {count > shifts.length && <p className="text-muted-foreground text-[0.75rem] mt-1">{isEN ? `Showing newest ${shifts.length}` : `Mostrando ${shifts.length} más recientes`}</p>}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { Archive as ArchiveIcon };
