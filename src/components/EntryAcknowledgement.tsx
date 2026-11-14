import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ENTRY_ACK_CHANGED, acknowledgementColumns, canAcknowledgeEntry, needsAcknowledgement, type AcknowledgementEntry } from "@/lib/entryAcknowledgement";

export { ENTRY_ACK_CHANGED } from "@/lib/entryAcknowledgement";
type Props = { kind: "repair" | "task"; entry: AcknowledgementEntry; compact?: boolean };
type Snapshot = AcknowledgementEntry & { acknowledger_name?: string | null };

export function EntryAcknowledgement({ kind, entry, compact = false }: Props) {
  const viewer = usePermissions();
  const { language } = useLanguage();
  const es = language === "es";
  const cache = useQueryClient();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const key = ["entry-acknowledgement", viewer.userId, kind, entry.id];
  const { data, refetch } = useQuery({
    queryKey: key,
    enabled: (!compact && !!entry.ack_required) || (!!entry.acknowledged_at && (!compact || (entry.reported_by ?? entry.created_by) === viewer.userId)),
    staleTime: 0,
    refetchInterval: !compact && needsAcknowledgement(dataOrEntry()) ? 30_000 : false,
    queryFn: async (): Promise<Snapshot> => {
      const { data: row, error } = await supabase.from(kind === "repair" ? "maintenance_issues" : "tasks")
        .select(acknowledgementColumns).eq("id", entry.id).single();
      if (error) throw error;
      let name: string | null = null;
      if (row.acknowledged_by) {
        const { data: person } = await supabase.from("profiles").select("full_name").eq("id", row.acknowledged_by).maybeSingle();
        name = person?.full_name ?? null;
      }
      return { ...entry, ...row, acknowledger_name: name };
    },
  });
  function dataOrEntry() { return cache.getQueryData<Snapshot>(key) ?? entry; }
  const current = data ?? entry;
  const allowed = canAcknowledgeEntry(current, viewer);
  const sender = current.reported_by ?? current.created_by;

  const acknowledge = async () => {
    if (inFlight.current || !allowed || !needsAcknowledgement(current)) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("acknowledge-entry", { body: { kind, id: entry.id, note: note.trim() || null } });
      if (error) {
        const response = error.context;
        if (response instanceof Response) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error || error.message);
        }
        throw error;
      }
      if (!result?.acknowledged && !result?.already_acknowledged) throw new Error(result?.error || (es ? "No se pudo confirmar" : "Could not confirm acknowledgement"));
      const refreshed = await refetch();
      window.dispatchEvent(new Event(ENTRY_ACK_CHANGED));
      void cache.invalidateQueries({ queryKey: ["notification-record"] });
      toast.success(es ? "Enterado" : "Acknowledged");
      if (refreshed.error) toast.error(es ? "Confirmado. Vuelve a abrir para ver los detalles." : "Acknowledged. Reopen to refresh the details.");
      if (result.push_failed) toast.error(es ? "Confirmado, pero no se pudo enviar la notificación al teléfono." : "Acknowledged, but the phone notification could not be sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : es ? "No se pudo confirmar" : "Could not acknowledge entry");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (current.acknowledged_at) {
    if (compact && sender !== viewer.userId) return null;
    return <p className="text-xs text-muted-foreground leading-relaxed" role="status">
      {es ? "Enterado por" : "Acknowledged by"} {data?.acknowledger_name || (es ? "el equipo" : "the team")}, {format(new Date(current.acknowledged_at), "d MMM", { locale: es ? esLocale : undefined })}
      {current.acknowledged_note ? ` — ${current.acknowledged_note}` : ""}
    </p>;
  }
  if (!needsAcknowledgement(current)) return null;
  if (sender === viewer.userId) return <p className="text-xs text-muted-foreground">{es ? "Enviado. Esperando a que el equipo lo vea" : "Sent. Waiting for the team to see it"}</p>;
  if (!allowed) return null;
  if (compact) return <span className="inline-flex rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium bg-[hsl(var(--timesheet-review-tint))] text-[hsl(var(--timesheet-review-text))]">{es ? "Nuevo" : "New"}</span>;
  return <div className="space-y-2" onClick={e => e.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" className="min-h-11" disabled={busy} onClick={acknowledge}>{es ? "Enterado" : "Acknowledge"}</Button>
      <Button variant="link" className="min-h-11 text-muted-foreground" disabled={busy} aria-expanded={noteOpen} onClick={() => setNoteOpen(v => !v)}>{es ? "Añadir una nota" : "Add a note"}</Button>
    </div>
    {noteOpen && <Input autoFocus className="text-base" maxLength={1000} aria-label={es ? "Nota opcional" : "Optional note"} placeholder={es ? "Nota opcional" : "Optional note"} value={note} onChange={e => setNote(e.target.value)} disabled={busy} />}
  </div>;
}