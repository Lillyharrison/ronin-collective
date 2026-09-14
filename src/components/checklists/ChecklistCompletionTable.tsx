import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, parseISO, isPast } from "date-fns";
import { toast } from "sonner";
import {
  ArrowUpDown, ArrowUp, ArrowDown, Smartphone, Link2, FileText, Search, RefreshCw,
} from "lucide-react";

type Source = "app" | "public_link" | "task";
type RowStatus = "complete" | "partial" | "pending" | "overdue";

interface LogRow {
  id: string;
  source: Source;
  template_id: string | null;
  checklist_title: string | null;
  property_id: string | null;
  property_name: string | null;
  person_id: string | null;
  person_name: string | null;
  completion_date: string | null;   // yyyy-mm-dd (or due date for tasks)
  completed_at: string | null;
  items_done: number;
  items_total: number;
  status: RowStatus;
}

const STATUS_STYLE: Record<RowStatus, string> = {
  complete: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  partial:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  pending:  "bg-muted text-muted-foreground border-border",
  overdue:  "bg-red-500/15 text-red-400 border-red-500/30",
};

const STATUS_LABEL: Record<RowStatus, string> = {
  complete: "Complete",
  partial:  "Partial",
  pending:  "Pending",
  overdue:  "Overdue",
};

const COLUMNS = ["Property", "Checklist", "Completed by", "Date", "Progress", "Status", "Source"] as const;
type Column = typeof COLUMNS[number];

export function ChecklistCompletionTable() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | RowStatus>("");
  const [search, setSearch] = useState("");
  const [sortStack, setSortStack] = useState<{ col: Column; asc: boolean }[]>([{ col: "Date", asc: false }]);

  const load = async () => {
    setLoading(true);

    const [completions, tasks] = await Promise.all([
      supabase
        .from("checklist_completion_log")
        .select("id, source, template_id, checklist_title, property_id, property_name, person_id, person_name, completion_date, completed_at, items_done, items_total")
        .order("completed_at", { ascending: false })
        .limit(500),
      supabase
        .from("tasks")
        .select("id, title_en, due_date, created_at, property_id, assigned_to, linked_checklist_id, status, properties(name), checklist_templates:linked_checklist_id(title)")
        .eq("category", "checklist")
        .neq("status", "completed")
        .order("due_date", { ascending: false, nullsFirst: false })
        .limit(300),
    ]);

    const completionRows: LogRow[] = ((completions.data as any[]) ?? []).map(r => ({
      id: `c-${r.id}`,
      source: r.source as Source,
      template_id: r.template_id,
      checklist_title: r.checklist_title,
      property_id: r.property_id,
      property_name: r.property_name,
      person_id: r.person_id,
      person_name: r.person_name,
      completion_date: r.completion_date,
      completed_at: r.completed_at,
      items_done: r.items_done ?? 0,
      items_total: r.items_total ?? 0,
      status: (r.items_done ?? 0) >= (r.items_total ?? 0) && (r.items_total ?? 0) > 0 ? "complete" : "partial",
    }));

    const taskList = ((tasks.data as any[]) ?? []);
    const assigneeIds = Array.from(new Set(taskList.map(t => t.assigned_to).filter(Boolean))) as string[];
    let nameMap = new Map<string, string>();
    if (assigneeIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", assigneeIds);
      nameMap = new Map(((profs as any[]) ?? []).map(p => [p.id as string, (p.full_name as string) ?? ""]));
    }

    const taskRows: LogRow[] = taskList.map(t => {
      const due = t.due_date as string | null;
      const overdue = !!due && isPast(new Date(due));
      return {
        id: `t-${t.id}`,
        source: "task" as Source,
        template_id: t.linked_checklist_id ?? null,
        checklist_title: t.checklist_templates?.title ?? t.title_en ?? "Checklist",
        property_id: t.property_id ?? null,
        property_name: t.properties?.name ?? null,
        person_id: t.assigned_to ?? null,
        person_name: t.assigned_to ? (nameMap.get(t.assigned_to) || "—") : "Unassigned",
        completion_date: due ? due.slice(0, 10) : (t.created_at as string).slice(0, 10),
        completed_at: due ?? t.created_at,
        items_done: 0,
        items_total: 0,
        status: overdue ? "overdue" : "pending",
      };
    });

    setRows([...completionRows, ...taskRows]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const properties = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => { if (r.property_id && r.property_name) map.set(r.property_id, r.property_name); });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  function handleSort(col: Column) {
    setSortStack(prev => {
      const idx = prev.findIndex(s => s.col === col);
      if (idx === 0) {
        const next = [...prev];
        next[0] = { col, asc: !next[0].asc };
        return next;
      }
      const rest = prev.filter(s => s.col !== col);
      return [{ col, asc: true }, ...rest].slice(0, 3);
    });
  }

  function valueFor(r: LogRow, col: Column): string | number {
    switch (col) {
      case "Property":     return (r.property_name ?? "").toLowerCase();
      case "Checklist":    return (r.checklist_title ?? "").toLowerCase();
      case "Completed by": return (r.person_name ?? "").toLowerCase();
      case "Date":         return r.completed_at ? new Date(r.completed_at).getTime() : 0;
      case "Progress":     return r.items_total ? r.items_done / r.items_total : -1;
      case "Status":       return r.status;
      case "Source":       return r.source;
    }
  }

  const filtered = rows.filter(r => {
    if (propertyFilter && r.property_id !== propertyFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (r.checklist_title ?? "").toLowerCase().includes(q) ||
        (r.person_name ?? "").toLowerCase().includes(q) ||
        (r.property_name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    for (const s of sortStack) {
      const av = valueFor(a, s.col);
      const bv = valueFor(b, s.col);
      if (av < bv) return s.asc ? -1 : 1;
      if (av > bv) return s.asc ? 1 : -1;
    }
    return 0;
  });

  const deleteOlderThan = async (days: number) => {
    if (!confirm(`Permanently delete all public link submissions older than ${days} days?`)) return;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const { error } = await supabase
      .from("checklist_public_sessions")
      .delete()
      .eq("status", "submitted")
      .lt("submitted_at", cutoff);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Old public link submissions cleared");
    await load();
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search checklist, person, property"
            className="w-full pl-8 pr-3 py-2 text-sm bg-card border border-border rounded-lg focus:border-gold outline-none"
          />
        </div>
        <select
          value={propertyFilter}
          onChange={e => setPropertyFilter(e.target.value)}
          className="text-sm px-3 py-2 bg-card border border-border rounded-lg outline-none focus:border-gold">
          <option value="">All properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as "" | RowStatus)}
          className="text-sm px-3 py-2 bg-card border border-border rounded-lg outline-none focus:border-gold">
          <option value="">All statuses</option>
          <option value="complete">Complete</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
        <button onClick={load} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-gold" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[30, 60, 90].map(d => (
          <button key={d} onClick={() => deleteOlderThan(d)}
            className="text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-gold">
            Clear &gt; {d} days
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground self-center">Applies to public link submissions only</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-card border border-border rounded-xl animate-pulse" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <FileText size={28} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Nothing to show.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-xl bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {COLUMNS.map(h => {
                  const stackIdx = sortStack.findIndex(s => s.col === h);
                  const active = stackIdx !== -1;
                  const isPrimary = stackIdx === 0;
                  const asc = active ? sortStack[stackIdx].asc : true;
                  return (
                    <th key={h}
                      onClick={() => handleSort(h)}
                      className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors">
                      <span className={cn("inline-flex items-center gap-1", isPrimary && "text-foreground")}>
                        {h}
                        {active
                          ? (asc
                              ? <ArrowUp size={10} className={cn(!isPrimary && "opacity-50")} />
                              : <ArrowDown size={10} className={cn(!isPrimary && "opacity-50")} />)
                          : <ArrowUpDown size={10} className="opacity-30" />}
                        {active && !isPrimary && (
                          <span className="text-[8px] font-bold opacity-60 leading-none">{stackIdx + 1}</span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const pct = r.items_total ? Math.round((r.items_done / r.items_total) * 100) : 0;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.property_name ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-foreground truncate max-w-[220px]">{r.checklist_title ?? "Checklist"}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.person_name || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {r.completion_date ? format(parseISO(r.completion_date), "d MMM yyyy") : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.items_total > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs tabular-nums text-foreground">{r.items_done}/{r.items_total}</span>
                          <span className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <span
                              className={cn("block h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-amber-500")}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border", STATUS_STYLE[r.status])}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        {r.source === "public_link"
                          ? <><Link2 size={11} /> Public link</>
                          : r.source === "app"
                            ? <><Smartphone size={11} /> In-app</>
                            : <><FileText size={11} /> Outstanding</>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
