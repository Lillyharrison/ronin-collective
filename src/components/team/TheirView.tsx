import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { accessTime } from "./accessCheckLogic";
import { repeatIds, wrongHouseIds, type TheirView as View, type TheirEntry } from "./theirViewLogic";

const tabs = [
  ["alerts", "Alerts", "Alertas"], ["tasks", "Tasks", "Tareas"], ["repairs", "Repairs", "Reparaciones"],
  ["orders", "Orders", "Pedidos"], ["calendar_next_14_days", "Calendar", "Calendario"], ["shifts_next_14_days", "Shifts", "Turnos"],
] as const;
type Action = { kind: "selected" | "repeats" | "read"; count: number; ids: string[] };
export function TheirView({ target, name, en }: { target: string; name: string; en: boolean }) {
  const { userId, isMasterAdmin } = usePermissions();
  const client = useQueryClient();
  const key = ["their-view", userId, target];
  const [tab, setTab] = useState<keyof View>("alerts");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const text = (english: string, spanish: string) => en ? english : spanish;
  const view = useQuery({ queryKey: key, enabled: isMasterAdmin && !!userId, staleTime: 0, refetchOnWindowFocus: false, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_their_view", { _target: target });
    if (error) throw error;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid view");
    const result = data as unknown as View;
    // The RPC omits the entity id used by the database's repeat-group rule.
    // Read only metadata for these same, bounded alerts; never guess from copy/body.
    if (result.alerts?.length) {
      const oldest = result.alerts.reduce((date, a) => a.created_at < date ? a.created_at : date, result.alerts[0].created_at);
      const metadata = await supabase.from("notifications").select("id, entity_id").eq("user_id", target)
        .in("id", result.alerts.map(a => a.id)).gte("created_at", oldest).limit(80);
      if (!metadata.error) result.alerts = result.alerts.map(a => {
        const match = metadata.data?.find(n => n.id === a.id);
        return match ? { ...a, entity_id: match.entity_id } : a;
      });
    }
    return result;
  } });
  const remove = useMutation({ mutationFn: async (action: Action) => {
    if (!isMasterAdmin || !userId) throw new Error("Master admin only");
    const result = action.kind === "selected"
      ? await supabase.rpc("admin_delete_notifications", { _target: target, _ids: action.ids })
      : action.kind === "repeats"
        ? await supabase.rpc("admin_clear_duplicate_notifications", { _target: target })
        : await supabase.rpc("admin_clear_notifications", { _target: target, _only_read: true });
    if (result.error) throw result.error;
    return Number(result.data);
  }, onSuccess: async count => {
    setSelected([]); setConfirm(null);
    toast.success(text(`${count} alerts deleted`, `${count} alertas eliminadas`));
    await client.invalidateQueries({ queryKey: key });
  }, onError: () => toast.error(text("Alerts could not be deleted. Try again.", "No se pudieron eliminar las alertas. Inténtalo de nuevo.")) });
  if (!isMasterAdmin) return null;
  const alerts = view.data?.alerts ?? [];
  const repeats = repeatIds(alerts);
  // copies covers the full group even when the 80-alert preview cuts it off.
  const groups = new Map<string, number>();
  for (const a of alerts) {
    if (a.entity_id === undefined) continue;
    const group = JSON.stringify([a.title, a.kind, a.entity_id]);
    groups.set(group, Math.max(groups.get(group) ?? 0, a.copies - 1));
  }
  const repeatCount = [...groups.values()].reduce((sum, n) => sum + Math.max(0, n), 0);
  const readCount = alerts.filter(a => a.read).length;
  const rows = view.data?.[tab] ?? [];
  const selectedIds = selected.filter(id => alerts.some(a => a.id === id));
  return <section className="min-w-0 space-y-3" aria-label={text("Their view", "Lo que ve esta persona")}>
    <h3 className="font-display text-xl">{text("Their view", "Lo que ve esta persona")}</h3>
    <p className="text-sm text-muted-foreground">{text("This shows what the app's rules allow this person to see. Read only, except clearing alerts. Every action is logged.", "Esto muestra lo que las reglas de la aplicación permiten ver a esta persona. Solo lectura, excepto al eliminar alertas. Cada acción queda registrada.")}</p>
    {view.isPending ? <p role="status">{text("Loading…", "Cargando…")}</p> : view.isError ? <div role="alert"><p>{text("Could not load their view.", "No se pudo cargar lo que ve esta persona.")}</p><Button variant="outline" onClick={() => void view.refetch()}>{text("Retry", "Reintentar")}</Button></div> : <>
      <div role="tablist" className="grid grid-cols-2 sm:grid-cols-3 gap-2">{tabs.map(([id, english, spanish]) => <Button key={id} role="tab" aria-selected={tab === id} variant={tab === id ? "secondary" : "outline"} className="h-auto min-h-11 min-w-0 whitespace-normal break-words px-2" onClick={() => setTab(id)}>{text(english, spanish)} ({view.data?.[id]?.length ?? 0})</Button>)}</div>
      <div role="tabpanel" aria-label={tabs.find(([id]) => id === tab)?.[en ? 1 : 2]} className="min-w-0 space-y-3">
        {tab === "alerts" && <>
          <div className="flex flex-wrap gap-2 [&>button]:max-w-full [&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:break-words">
            <Button variant="outline" disabled={!repeatCount || remove.isPending || view.isFetching} onClick={() => setConfirm({ kind: "repeats", count: repeatCount, ids: [] })}>{text("Clear repeats", "Eliminar repetidas")}</Button>
            <Button variant="outline" disabled={!readCount || remove.isPending || view.isFetching} onClick={() => setConfirm({ kind: "read", count: readCount, ids: [] })}>{text("Clear read alerts", "Eliminar alertas leídas")}</Button>
            <Button variant="ghost" disabled={!repeats.length || remove.isPending} onClick={() => setSelected(repeats)}>{text("Select repeats", "Seleccionar repetidas")}</Button>
            <Button variant="ghost" disabled={remove.isPending} onClick={() => setSelected(wrongHouseIds(alerts))}>{text("Select wrong-house", "Seleccionar de otra casa")}</Button>
          </div>
          {selectedIds.length > 0 && <div className="border-y border-border py-2"><Button variant="destructive" disabled={remove.isPending || view.isFetching} onClick={() => setConfirm({ kind: "selected", count: selectedIds.length, ids: [...selectedIds] })}>{text(`Delete selected (${selectedIds.length})`, `Eliminar seleccionadas (${selectedIds.length})`)}</Button></div>}
          {alerts.map(a => <div key={a.id} className="flex min-w-0 gap-2 border-b border-border py-3">
            <label className="flex size-11 shrink-0 items-center justify-center"><Checkbox aria-label={text(`Select alert ${a.id}`, `Seleccionar alerta ${a.id}`)} disabled={remove.isPending} checked={selectedIds.includes(a.id)} onCheckedChange={checked => setSelected(ids => checked === true ? [...new Set([...ids, a.id])] : ids.filter(id => id !== a.id))}/></label>
            <div className="min-w-0 flex-1 space-y-1 break-words [overflow-wrap:anywhere]">
              <p className="text-sm text-muted-foreground">{accessTime(a.created_at, en)}</p>
              <p className="font-semibold">{!a.read && <span aria-label={text("Unread", "Sin leer")} className="inline-block size-2 rounded-full bg-gold mr-2"/>}{a.title}</p>
              {a.body && <p className="whitespace-pre-wrap">{a.body}</p>}
              <div className="flex flex-wrap gap-2 text-sm">{a.house && <span className="border border-border rounded px-2 py-1">{a.house}</span>}{a.copies > 1 && <span className="border border-border rounded px-2 py-1">{text(`x${a.copies} copies`, `x${a.copies} copias`)}</span>}{a.outside_their_houses && <span className="text-destructive border border-destructive rounded px-2 py-1">{text("Not their house", "No es su casa")}</span>}</div>
              <p className="text-sm text-muted-foreground">{text("from", "de")} {a.from || text("System", "Sistema")}</p>
            </div>
          </div>)}
        </>}
        {tab !== "alerts" && (rows as TheirEntry[]).map((row, i) => <div key={i} className="border-b border-border py-3 space-y-1 break-words [overflow-wrap:anywhere]">
          <p className="font-semibold">{row.title || row.item || row.date || "—"}</p>
          {row.status && <p>{statusLabel(row.status, en)}</p>}
          {row.house && <p className="text-sm text-muted-foreground">{row.house}</p>}
          {row.due && <p>{text("Due", "Fecha límite")}: {row.due}</p>}
          {row.assigned_to && <p>{text("Assigned to", "Asignado a")}: {row.assigned_to}</p>}
          {row.reported_by && <p>{text("Reported by", "Reportado por")}: {row.reported_by}</p>}
          {row.from && <p>{text("From", "De")}: {row.from}{row.to ? ` – ${row.to}` : ""}</p>}
          {row.mine != null && <p>{row.mine ? text("Their request", "Su solicitud") : text("Someone else's request", "Solicitud de otra persona")}</p>}
          {row.start && <p>{accessTime(row.start, en)}</p>}
        </div>)}
        {!rows.length && <p className="text-muted-foreground">{text("Nothing to show here.", "No hay nada que mostrar aquí.")}</p>}
      </div>
    </>}
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open && !remove.isPending) setConfirm(null); }}>
      <AlertDialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
        <AlertDialogTitle>{confirm?.kind === "repeats" ? text("Clear repeats", "Eliminar repetidas") : confirm?.kind === "read" ? text("Clear read alerts", "Eliminar alertas leídas") : text("Delete selected", "Eliminar seleccionadas")}</AlertDialogTitle>
        <AlertDialogDescription className="overflow-y-auto break-words">{text(`Delete ${confirm?.count ?? 0} alerts for ${name}? They will not see them any more.`, `¿Eliminar ${confirm?.count ?? 0} alertas de ${name}? Ya no podrá verlas.`)}{confirm?.kind !== "selected" && <span className="block">{text("This count covers groups shown here. Older alerts not shown here may also be cleared.", "Este número corresponde a las alertas mostradas aquí. También podrían eliminarse alertas anteriores que no aparecen aquí.")}</span>}</AlertDialogDescription>
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-4"><Button variant="outline" disabled={remove.isPending} onClick={() => setConfirm(null)}>{text("Cancel", "Cancelar")}</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (confirm) remove.mutate(confirm); }}>{text("Delete", "Eliminar")}</Button></div>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
function statusLabel(status: string, en: boolean) {
  const labels: Record<string, string> = { pending: "Pendiente", in_progress: "En curso", completed: "Completado", urgent: "Urgente", requested: "Solicitado", ordered: "Pedido", delivered: "Entregado", draft: "Borrador", received: "Recibido", open: "Abierto", scheduled: "Programado" };
  return en ? status.replace(/_/g, " ") : labels[status] ?? status;
}