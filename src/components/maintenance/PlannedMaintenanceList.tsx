import { useState } from "react";
import { RefreshCw, Wrench, Building2, User, Calendar, Bell, RotateCcw, Trash2, Edit2, LayoutGrid, Table2, MapPin, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { PlannedMaintenanceEntry } from "@/hooks/usePlannedMaintenance";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useLocalStorage } from "@/hooks/useLocalStorage";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const STATUS_CONFIG = {
  unconfirmed: { label: "Unconfirmed", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  confirmed:   { label: "Confirmed",   color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  completed:   { label: "Completed",   color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled:   { label: "Cancelled",   color: "bg-muted text-muted-foreground border-border" },
};

type PlannedViewMode = "tile" | "list";

interface Props {
  entries: PlannedMaintenanceEntry[];
  loading: boolean;
  canManage: boolean;
  properties: { id: string; name: string }[];
  propertyFilter: string;
  onPropertyFilterChange: (value: string) => void;
  onAdd: () => void;
  onEdit: (entry: PlannedMaintenanceEntry) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: PlannedMaintenanceEntry["status"]) => void;
  refetch: () => void;
}

export function PlannedMaintenanceList({
  entries,
  loading,
  canManage,
  properties,
  propertyFilter,
  onPropertyFilterChange,
  onAdd,
  onEdit,
  onDelete,
  onStatusChange,
  refetch,
}: Props) {
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [viewMode, setViewMode] = useLocalStorage<PlannedViewMode>("planned_maintenance_view_mode", "list");
  const [sortCol, setSortCol] = useState<string>("Title");
  const [sortAsc, setSortAsc] = useState(true);

  function handleSort(col: string) {
    if (sortCol === col) { setSortAsc(!sortAsc); }
    else { setSortCol(col); setSortAsc(true); }
  }

  const filtered = entries.filter(e => {
    if (filterStatus && e.status !== filterStatus) return false;
    if (propertyFilter && e.property_id !== propertyFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.vendor_name ?? "").toLowerCase().includes(q) ||
        (e.property_name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  function getSortValue(entry: PlannedMaintenanceEntry, col: string): string {
    switch (col) {
      case "Title": return entry.title.toLowerCase();
      case "Status": return entry.status;
      case "Contractor": return (entry.vendor_name ?? "").toLowerCase();
      case "Property": return (entry.property_name ?? "").toLowerCase();
      case "Assigned": return (entry.assignee_name ?? "").toLowerCase();
      case "Date": return entry.scheduled_date ?? `${entry.scheduled_year ?? 9999}-${String(entry.scheduled_month ?? 99).padStart(2, "0")}`;
      case "Reminder": return String(entry.reminder_days).padStart(5, "0");
      case "Recurrence": return String(entry.recurrence_months ?? 0).padStart(5, "0");
      default: return "";
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    const av = getSortValue(a, sortCol);
    const bv = getSortValue(b, sortCol);
    return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  function formatDate(entry: PlannedMaintenanceEntry) {
    if (entry.date_type === "specific" && entry.scheduled_date) {
      return format(parseISO(entry.scheduled_date), "dd MMM yyyy");
    }
    if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year) {
      return `${MONTHS[entry.scheduled_month - 1]} ${entry.scheduled_year}`;
    }
    return "—";
  }

  return (
    <div className="animate-fade-in">
      {/* Top bar */}
      <div className="px-4 pt-2 pb-3 space-y-2.5">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search planned maintenance…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2">
          {/* Property filter */}
          {properties.length > 0 && (
            <select
              value={propertyFilter}
              onChange={e => onPropertyFilterChange(e.target.value)}
              className="flex-1 text-xs rounded-xl border border-input bg-background px-3 py-2 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold/30"
            >
              <option value="">All Properties</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {/* View toggle */}
            <div className="flex items-center border border-border rounded-full overflow-hidden">
              <button onClick={() => setViewMode("tile")} title="Tile view"
                className={cn("p-1.5 transition-colors", viewMode === "tile" ? "bg-gold/20 text-gold" : "text-muted-foreground hover:text-foreground")}>
                <LayoutGrid size={13} />
              </button>
              <button onClick={() => setViewMode("list")} title="List view"
                className={cn("p-1.5 transition-colors", viewMode === "list" ? "bg-gold/20 text-gold" : "text-muted-foreground hover:text-foreground")}>
                <Table2 size={13} />
              </button>
            </div>
            <button onClick={refetch}
              className={cn("p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground", loading && "text-amber-400")}>
              <RefreshCw size={15} className={cn(loading && "animate-spin")} />
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </p>
      </div>

      {/* Status filter pills */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {["", "unconfirmed", "confirmed", "completed", "cancelled"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cn("flex-shrink-0 text-xs rounded-full border px-3 py-1 font-medium transition-colors",
              filterStatus === s
                ? "bg-gold/10 border-gold/50 text-gold"
                : "border-border text-muted-foreground hover:border-gold/30"
            )}>
            {s === "" ? "All" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="px-4 space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3">
          <Wrench size={40} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No planned maintenance entries</p>
          {canManage && (
            <button onClick={onAdd} className="text-xs text-gold hover:underline font-medium">
              + Add the first entry
            </button>
          )}
        </div>
      ) : viewMode === "tile" ? (
        /* ── Tile view ── */
        <div className="px-4 pb-4 space-y-3">
          {sorted.map(entry => (
            <div key={entry.id} className="bg-card border border-border rounded-xl p-3.5 space-y-2.5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{entry.title}</p>
                  {entry.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.description}</p>
                  )}
                </div>
                <span className={cn("flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  STATUS_CONFIG[entry.status]?.color ?? "bg-muted text-muted-foreground border-border"
                )}>
                  {STATUS_CONFIG[entry.status]?.label ?? entry.status}
                </span>
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {entry.property_name && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Building2 size={10} /> {entry.property_name}
                  </span>
                )}
                {entry.vendor_name && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Wrench size={10} /> {entry.vendor_name}
                  </span>
                )}
                {entry.assignee_name && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <User size={10} /> {entry.assignee_name}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar size={10} /> {formatDate(entry)}
                  {entry.date_type === "month_only" && (
                    <span className="text-[9px] text-amber-400/70 font-medium ml-0.5">(unconfirmed)</span>
                  )}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Bell size={10} /> {entry.reminder_days}d reminder
                </span>
                {entry.recurrence_months && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <RotateCcw size={10} /> Every {entry.recurrence_months}mo
                  </span>
                )}
              </div>

              {/* Actions */}
              {canManage && (
                <div className="flex items-center gap-2 pt-0.5 border-t border-border/50">
                  <select
                    value={entry.status}
                    onChange={e => onStatusChange(entry.id, e.target.value as PlannedMaintenanceEntry["status"])}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 h-7 text-[11px] rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="unconfirmed">Unconfirmed</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button onClick={() => onEdit(entry)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Edit2 size={13} />
                  </button>
                  {confirmDelete === entry.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => { onDelete(entry.id); setConfirmDelete(null); }}
                        className="text-[10px] bg-destructive text-destructive-foreground px-2 py-1 rounded font-medium">
                        Confirm
                      </button>
                      <button onClick={() => setConfirmDelete(null)}
                        className="text-[10px] text-muted-foreground px-2 py-1 rounded hover:bg-muted">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(entry.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ── List / table view ── */
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Title", "Status", "Contractor", "Property", "Assigned", "Date", "Reminder", "Recurrence"].map((h, i) => (
                  <th key={i}
                    onClick={() => handleSort(h)}
                    className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors">
                    <span className="inline-flex items-center gap-1">
                      {h}
                      {sortCol === h ? (sortAsc ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} className="opacity-30" />}
                    </span>
                  </th>
                ))}
                {canManage && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map(entry => (
                <tr key={entry.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground truncate max-w-[200px]">{entry.title}</p>
                    {entry.description && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{entry.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {canManage ? (
                      <select
                        value={entry.status}
                        onChange={e => onStatusChange(entry.id, e.target.value as PlannedMaintenanceEntry["status"])}
                        onClick={e => e.stopPropagation()}
                        className="h-7 text-[11px] rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="unconfirmed">Unconfirmed</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                        STATUS_CONFIG[entry.status]?.color ?? "bg-muted text-muted-foreground border-border"
                      )}>
                        {STATUS_CONFIG[entry.status]?.label ?? entry.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {entry.vendor_name
                      ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Wrench size={9} /> {entry.vendor_name}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {entry.property_name
                      ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={9} /> {entry.property_name}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {entry.assignee_name
                      ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><User size={9} /> {entry.assignee_name}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar size={9} /> {formatDate(entry)}
                      {entry.date_type === "month_only" && (
                        <span className="text-[9px] text-amber-400/70 font-medium ml-0.5">(est.)</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Bell size={9} /> {entry.reminder_days}d
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {entry.recurrence_months
                      ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><RotateCcw size={9} /> Every {entry.recurrence_months}mo</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button onClick={() => onEdit(entry)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Edit2 size={12} />
                        </button>
                        {confirmDelete === entry.id ? (
                          <>
                            <button onClick={() => { onDelete(entry.id); setConfirmDelete(null); }}
                              className="text-[10px] bg-destructive text-destructive-foreground px-2 py-0.5 rounded font-medium">
                              Confirm
                            </button>
                            <button onClick={() => setConfirmDelete(null)}
                              className="text-[10px] text-muted-foreground px-1 py-0.5 rounded hover:bg-muted">
                              ✕
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDelete(entry.id)}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
