import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Trash2, CheckCircle2, FileText, X } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  share_token: string;
  template_id: string;
  property_id: string | null;
  assignee_name: string | null;
  checked_item_ids: string[];
  notes: string | null;
  submitted_at: string;
  template_title?: string;
  template_icon?: string;
  property_name?: string;
  item_count?: number;
}

export function ChecklistSubmissionsArchive() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Row | null>(null);
  const [detailItems, setDetailItems] = useState<{ id: string; title: string; icon: string; section: string | null }[]>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("checklist_public_sessions")
      .select("*")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(500);
    const list = (data as Row[]) ?? [];
    // Enrich with template title + property name
    const tplIds = Array.from(new Set(list.map(r => r.template_id)));
    const propIds = Array.from(new Set(list.map(r => r.property_id).filter(Boolean))) as string[];
    const [{ data: tpls }, { data: props }, { data: itemCounts }] = await Promise.all([
      tplIds.length
        ? supabase.from("checklist_templates").select("id, title, icon").in("id", tplIds)
        : Promise.resolve({ data: [] as any }),
      propIds.length
        ? supabase.from("properties").select("id, name").in("id", propIds)
        : Promise.resolve({ data: [] as any }),
      tplIds.length
        ? supabase.from("checklist_items").select("template_id").in("template_id", tplIds)
        : Promise.resolve({ data: [] as any }),
    ]);
    const tplMap = new Map((tpls ?? []).map((t: any) => [t.id, t]));
    const propMap = new Map((props ?? []).map((p: any) => [p.id, p.name]));
    const countMap = new Map<string, number>();
    for (const r of (itemCounts ?? []) as any[]) {
      countMap.set(r.template_id, (countMap.get(r.template_id) ?? 0) + 1);
    }
    setRows(list.map(r => ({
      ...r,
      template_title: tplMap.get(r.template_id)?.title,
      template_icon: tplMap.get(r.template_id)?.icon,
      property_name: r.property_id ? propMap.get(r.property_id) : undefined,
      item_count: countMap.get(r.template_id) ?? 0,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (row: Row) => {
    setDetail(row);
    const { data } = await supabase
      .from("checklist_items")
      .select("id, title, icon, section")
      .eq("template_id", row.template_id)
      .order("sort_order");
    setDetailItems((data as any) ?? []);
  };

  const deleteOne = async (id: string) => {
    if (!confirm("Permanently delete this submission?")) return;
    const { error } = await supabase.from("checklist_public_sessions").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    setRows(prev => prev.filter(r => r.id !== id));
    toast.success("Deleted");
    if (detail?.id === id) setDetail(null);
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Permanently delete ${selected.size} submission${selected.size > 1 ? "s" : ""}?`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("checklist_public_sessions").delete().in("id", ids);
    if (error) { toast.error("Delete failed"); return; }
    setRows(prev => prev.filter(r => !selected.has(r.id)));
    setSelected(new Set());
    toast.success(`Deleted ${ids.length}`);
  };

  const deleteOlderThan = async (days: number) => {
    if (!confirm(`Permanently delete all submissions older than ${days} days?`)) return;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const { error } = await supabase.from("checklist_public_sessions").delete().lt("submitted_at", cutoff);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Old submissions cleared");
    await load();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground px-1">
        Public submissions from share links. Tap a row for full detail. Delete what you no longer need.
      </p>

      <div className="flex flex-wrap gap-2">
        {selected.size > 0 && (
          <button onClick={deleteSelected}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[hsl(var(--status-urgent)/0.15)] text-[hsl(var(--status-urgent))] border border-[hsl(var(--status-urgent)/0.3)]">
            <Trash2 size={12} /> Delete selected ({selected.size})
          </button>
        )}
        <button onClick={() => deleteOlderThan(30)} className="text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-gold">Clear &gt; 30 days</button>
        <button onClick={() => deleteOlderThan(60)} className="text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-gold">Clear &gt; 60 days</button>
        <button onClick={() => deleteOlderThan(90)} className="text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-gold">Clear &gt; 90 days</button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <FileText size={28} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const date = new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
            const total = r.item_count ?? 0;
            const done = r.checked_item_ids?.length ?? 0;
            return (
              <div key={r.id}
                className={cn("bg-card border rounded-xl px-3 py-3 flex items-center gap-2",
                  selected.has(r.id) ? "border-[hsl(var(--gold))]" : "border-border")}>
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
                  className="w-4 h-4 accent-[hsl(var(--gold))] flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />
                <button onClick={() => openDetail(r)} className="flex-1 min-w-0 text-left flex items-center gap-3">
                  <span className="text-base flex-shrink-0">{r.template_icon ?? "✅"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.template_title ?? "Checklist"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.assignee_name ?? "Anonymous"}{r.property_name ? ` · ${r.property_name}` : ""} · {date}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[hsl(var(--status-done))] flex-shrink-0">
                    <CheckCircle2 size={12} /> {done}/{total}
                  </div>
                </button>
                <button onClick={() => deleteOne(r.id)}
                  className="p-2 rounded-lg text-[hsl(var(--status-urgent))] hover:bg-[hsl(var(--status-urgent)/0.1)]">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6"
             onClick={() => setDetail(null)}>
          <div className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col border border-border"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
              <span className="text-xl">{detail.template_icon ?? "✅"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{detail.template_title}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {detail.assignee_name ?? "Anonymous"} · {new Date(detail.submitted_at).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-2 rounded-lg hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {detailItems.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No items.</p>
              ) : (
                detailItems.map(it => {
                  const checked = detail.checked_item_ids.includes(it.id);
                  return (
                    <div key={it.id} className="flex items-start gap-2 text-sm">
                      <span className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                        checked ? "bg-[hsl(var(--status-done))] border-[hsl(var(--status-done))]" : "border-border"
                      )}>
                        {checked && <CheckCircle2 size={11} className="text-white" />}
                      </span>
                      <span className="text-base">{it.icon}</span>
                      <span className={cn("flex-1", checked && "line-through opacity-60")}>{it.title}</span>
                      {it.section && <span className="text-[10px] text-muted-foreground">{it.section}</span>}
                    </div>
                  );
                })
              )}
              {detail.notes && (
                <div className="mt-4 p-3 bg-muted/40 rounded-xl">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}
            </div>
            <div className="border-t border-border p-3 flex-shrink-0">
              <button onClick={() => deleteOne(detail.id)}
                className="w-full py-2.5 text-sm flex items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--status-urgent)/0.1)] text-[hsl(var(--status-urgent))] border border-[hsl(var(--status-urgent)/0.3)]">
                <Trash2 size={13} /> Delete this submission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
