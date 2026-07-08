import { useState } from "react";
import { RefreshCw, Wrench, Building2, User, Calendar, Bell, RotateCcw, Trash2, Edit2, LayoutGrid, Table2, MapPin, Search, ArrowUpDown, ArrowUp, ArrowDown, Download, Copy } from "lucide-react";
import { PlannedMaintenanceEntry } from "@/hooks/usePlannedMaintenance";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays, isPast } from "date-fns";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { exportPlannedMaintenancePDF } from "./plannedExportPDF";

const MONTHS_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

const STATUS_LABELS: Record<string, string> = {
  future:              "Future (Too Early)",
  to_be_booked:        "To Be Booked",
  booked:              "Booked",
  initiated_by_vendor: "Initiated by Vendor",
  recurring:           "Recurring",
  as_needed:           "As Needed",
  completed:           "Completed",
  cancelled:           "Cancelled",
};

const STATUS_BASE_COLOR: Record<string, string> = {
  future:              "bg-slate-500/15 text-slate-400 border-slate-500/30",
  to_be_booked:        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  booked:              "bg-blue-500/15 text-blue-400 border-blue-500/30",
  initiated_by_vendor: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  recurring:           "bg-teal-500/15 text-teal-400 border-teal-500/30",
  as_needed:           "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  completed:           "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled:           "bg-muted text-muted-foreground border-border",
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
  onCopy: (entry: PlannedMaintenanceEntry, targetPropertyId: string) => void;
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
  onCopy,
  refetch,
}: Props) {
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState<string | null>(null);
  const [viewMode, setViewMode] = useLocalStorage<PlannedViewMode>("planned_maintenance_view_mode", "list");
  // Cascading sort: stack of up to 3 { col, asc } entries. Index 0 = primary, 1 = secondary, 2 = tertiary.
  const [sortStack, setSortStack] = useState<{ col: string; asc: boolean }[]>([{ col: "Title", asc: true }]);

  function handleSort(col: string) {
    setSortStack(prev => {
      const idx = prev.findIndex(s => s.col === col);
      if (idx === 0) {
        // Same primary → just flip direction
        const next = [...prev];
        next[0] = { col, asc: !next[0].asc };
        return next;
      }
      // Promote this column to primary; keep others (minus this one) as tiebreakers, cap depth at 3
      const rest = prev.filter(s => s.col !== col);
      return [{ col, asc: true }, ...rest].slice(0, 3);
    });
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

  function getDateUrgencyClass(entry: PlannedMaintenanceEntry): string {
    if (entry.status === "cancelled") return "text-muted-foreground";
    if (entry.recurrence_months === -1 || entry.recurrence_months === -2) return "text-muted-foreground"; // weekly/monthly = neutral
    // Completed entries: the Date column shows the NEXT service date — use normal urgency, not green
    const targetDate = getTargetDate(entry);
    if (!targetDate) return "text-muted-foreground";
    const now = new Date();
    const days = differenceInDays(targetDate, now);
    if (entry.status === "completed") return "text-muted-foreground"; // future next-service = neutral
    if (days < 0) return "text-[hsl(var(--status-urgent))] font-semibold"; // overdue = red
    if (days <= 14) return "text-orange-400 font-semibold"; // ≤2 weeks = orange
    if (days <= 30) return "text-amber-400 font-medium"; // ≤1 month = amber
    return "text-muted-foreground";
  }

  function getStatusColorClass(entry: PlannedMaintenanceEntry): string {
    if (entry.status === "completed") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (entry.status === "cancelled") return "bg-muted text-muted-foreground border-border";
    if (entry.status === "booked") return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    if (entry.status === "initiated_by_vendor") return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    // to_be_booked: use reminder-window urgency
    if (entry.status === "to_be_booked") {
      if (entry.recurrence_months === -1 || entry.recurrence_months === -2) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      const targetDate = getTargetDate(entry);
      if (!targetDate) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      const days = differenceInDays(targetDate, new Date());
      if (days < 0) return "bg-red-500/15 text-red-400 border-red-500/30"; // overdue
      const halfReminder = Math.floor(entry.reminder_days / 2);
      if (days <= halfReminder) return "bg-red-500/15 text-red-400 border-red-500/30"; // imminent
      if (days <= entry.reminder_days) return "bg-orange-500/15 text-orange-400 border-orange-500/30"; // in reminder window
      return "bg-amber-500/15 text-amber-400 border-amber-500/30"; // normal
    }
    return STATUS_BASE_COLOR[entry.status] ?? "bg-muted text-muted-foreground border-border";
  }

  function getTargetDate(entry: PlannedMaintenanceEntry): Date | null {
    if (entry.date_type === "specific" && entry.scheduled_date) return parseISO(entry.scheduled_date);
    if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year)
      return new Date(entry.scheduled_year, entry.scheduled_month - 1, 1);
    return null;
  }

  function firstName(name: string | undefined | null): string {
    if (!name) return "";
    return name.split(" ")[0];
  }

  function getSortValue(entry: PlannedMaintenanceEntry, col: string): string {
    switch (col) {
      case "Title": return entry.title.toLowerCase();
      case "Status": return entry.status;
      case "Contractor": return (entry.vendor_name ?? "").toLowerCase();
      case "Property": return (entry.property_name ?? "").toLowerCase();
      case "Assigned": return (entry.assignee_name ?? "").toLowerCase();
      case "Last Service": return entry.last_service_date ?? "9999-12-31";
      case "Date": {
        if (entry.recurrence_months === -1) return "0000-00-01"; // Weekly first
        if (entry.recurrence_months === -2) return "0000-00-02"; // Monthly second
        return entry.scheduled_date ?? `${entry.scheduled_year ?? 9999}-${String(entry.scheduled_month ?? 99).padStart(2, "0")}`;
      }
      case "Reminder": return String(entry.reminder_days).padStart(5, "0");
      case "Recurrence": return String(entry.recurrence_months ?? 0).padStart(5, "0");
      default: return "";
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    for (const { col, asc } of sortStack) {
      const av = getSortValue(a, col);
      const bv = getSortValue(b, col);
      const cmp = asc ? av.localeCompare(bv) : bv.localeCompare(av);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });


  function formatDate(entry: PlannedMaintenanceEntry) {
    if (entry.recurrence_months === -1) return "Weekly";
    if (entry.recurrence_months === -2) return "Monthly";
    if (entry.date_type === "specific" && entry.scheduled_date) {
      const start = format(parseISO(entry.scheduled_date), "dd MMM yyyy");
      if (entry.scheduled_end_date && entry.scheduled_end_date !== entry.scheduled_date) {
        return `${start} → ${format(parseISO(entry.scheduled_end_date), "dd MMM yyyy")}`;
      }
      return start;
    }
    if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year) {
      return `${MONTHS_SHORT[entry.scheduled_month - 1]} ${entry.scheduled_year}`;
    }
    return "—";
  }

  function getReminderUrgencyClass(entry: PlannedMaintenanceEntry): string {
    if (entry.status !== "to_be_booked") return "text-muted-foreground";
    const targetDate = getTargetDate(entry);
    if (!targetDate) return "text-muted-foreground";
    const days = differenceInDays(targetDate, new Date());
    if (days < 0) return "text-[hsl(var(--status-urgent))] font-semibold";
    if (days <= entry.reminder_days / 2) return "text-[hsl(var(--status-urgent))] font-semibold"; // imminent = red
    if (days <= entry.reminder_days) return "text-orange-400 font-semibold"; // within reminder window = orange
    return "text-muted-foreground";
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
            <button
              onClick={() => exportPlannedMaintenancePDF({
                entries: sorted,
                viewMode,
                filters: {
                  propertyName: propertyFilter
                    ? properties.find(p => p.id === propertyFilter)?.name ?? null
                    : null,
                  status: filterStatus || null,
                  search: search || null,
                },
              })}
              disabled={sorted.length === 0}
              title="Download current view as PDF"
              className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed">
              <Download size={15} />
            </button>
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
        {["", "future", "to_be_booked", "booked", "initiated_by_vendor", "recurring", "as_needed", "completed", "cancelled"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cn("flex-shrink-0 text-xs rounded-full border px-3 py-1 font-medium transition-colors",
              filterStatus === s
                ? "bg-gold/10 border-gold/50 text-gold"
                : "border-border text-muted-foreground hover:border-gold/30"
            )}>
            {s === "" ? "All" : STATUS_LABELS[s] ?? s}
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
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onClick={() => onEdit(entry)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(entry); } }}
              className="bg-card border border-border rounded-xl p-3.5 space-y-2.5 cursor-pointer hover:border-gold/30 active:scale-[0.99] transition-all"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{entry.title}</p>
                  {entry.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.description}</p>
                  )}
                </div>
                <span className={cn("flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  getStatusColorClass(entry)
                )}>
                  {STATUS_LABELS[entry.status] ?? entry.status}
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
                    <User size={10} /> {firstName(entry.assignee_name)}
                  </span>
                )}
                <span className={cn("flex items-center gap-1 text-[11px]", getDateUrgencyClass(entry))}>
                  <Calendar size={10} /> {formatDate(entry)}
                  {entry.date_type === "month_only" && (
                    <span className="text-[9px] opacity-70 font-medium ml-0.5">(approx.)</span>
                  )}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Bell size={10} /> {entry.reminder_days > 0 ? `${entry.reminder_days}d reminder` : "No reminder"}
                </span>
                {entry.recurrence_months && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <RotateCcw size={10} /> {entry.recurrence_months === -1 ? "Weekly" : entry.recurrence_months === -2 ? "Monthly" : `Every ${entry.recurrence_months}mo`}
                  </span>
                )}
              </div>

              {/* Actions */}
              {canManage && (
                <div className="flex items-center gap-2 pt-0.5 border-t border-border/50" onClick={e => e.stopPropagation()}>
                  <select
                    value={entry.status}
                    onChange={e => onStatusChange(entry.id, e.target.value as PlannedMaintenanceEntry["status"])}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 h-7 text-[11px] rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="future">Future (Too Early)</option>
                    <option value="to_be_booked">To Be Booked</option>
                    <option value="booked">Booked</option>
                    <option value="initiated_by_vendor">Initiated by Vendor</option>
                    <option value="recurring">Recurring</option>
                    <option value="as_needed">As Needed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Edit2 size={13} />
                  </button>
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setCopyOpen(copyOpen === entry.id ? null : entry.id); }}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title="Copy to another property">
                      <Copy size={13} />
                    </button>
                    {copyOpen === entry.id && (
                      <div className="absolute right-0 top-full mt-1 z-20 w-52 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1"
                        onClick={e => e.stopPropagation()}>
                        <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Copy to…</p>
                        {properties.filter(p => p.id !== entry.property_id).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground/60">No other properties</p>
                        )}
                        {properties.filter(p => p.id !== entry.property_id).map(p => (
                          <button key={p.id}
                            onClick={() => { onCopy(entry, p.id); setCopyOpen(null); }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2">
                            <MapPin size={10} className="text-muted-foreground" /> {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {confirmDelete === entry.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); onDelete(entry.id); setConfirmDelete(null); }}
                        className="text-[10px] bg-destructive text-destructive-foreground px-2 py-1 rounded font-medium">
                        Confirm
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                        className="text-[10px] text-muted-foreground px-2 py-1 rounded hover:bg-muted">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(entry.id); }}
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
                {["Title", "Status", "Last Service", "Date", "Contractor", "Property", "Assigned", "Reminder", "Recurrence"].map((h, i) => {
                  const stackIdx = sortStack.findIndex(s => s.col === h);
                  const active = stackIdx !== -1;
                  const isPrimary = stackIdx === 0;
                  const asc = active ? sortStack[stackIdx].asc : true;
                  return (
                    <th key={i}
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
                {canManage && <th className="px-3 py-2.5">
                  {sortStack.length > 1 && (
                    <button
                      onClick={() => setSortStack([{ col: sortStack[0].col, asc: sortStack[0].asc }])}
                      className="text-[9px] text-muted-foreground hover:text-foreground uppercase tracking-wider"
                      title="Clear secondary sorts">
                      Clear sort
                    </button>
                  )}
                </th>}
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
                        className={cn(
                          "h-7 text-[11px] rounded border px-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer",
                          entry.status === "completed" ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" :
                          entry.status === "cancelled" ? "border-border text-muted-foreground bg-muted" :
                          entry.status === "future" ? "border-slate-500/40 text-slate-400 bg-slate-500/10" :
                          entry.status === "booked" ? "border-orange-500/40 text-orange-400 bg-orange-500/10" :
                          entry.status === "initiated_by_vendor" ? "border-purple-500/40 text-purple-400 bg-purple-500/10" :
                          entry.status === "recurring" ? "border-teal-500/40 text-teal-400 bg-teal-500/10" :
                          entry.status === "as_needed" ? "border-indigo-500/40 text-indigo-400 bg-indigo-500/10" :
                          entry.status === "to_be_booked" ? (() => {
                            const target = getTargetDate(entry);
                            if (!target || entry.recurrence_months === -1 || entry.recurrence_months === -2)
                              return "border-amber-500/40 text-amber-400 bg-amber-500/10";
                            const days = differenceInDays(target, new Date());
                            if (days < 0 || days <= Math.floor(entry.reminder_days / 2))
                              return "border-red-500/40 text-red-400 bg-red-500/10";
                            if (days <= entry.reminder_days)
                              return "border-orange-500/40 text-orange-400 bg-orange-500/10";
                            return "border-amber-500/40 text-amber-400 bg-amber-500/10";
                          })() : "border-border text-muted-foreground bg-muted"
                        )}
                      >
                        <option value="future">Future (Too Early)</option>
                        <option value="to_be_booked">To Be Booked</option>
                        <option value="booked">Booked</option>
                        <option value="initiated_by_vendor">Initiated by Vendor</option>
                        <option value="recurring">Recurring</option>
                        <option value="as_needed">As Needed</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                        getStatusColorClass(entry)
                      )}>
                        {STATUS_LABELS[entry.status] ?? entry.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {entry.last_service_date
                      ? <span className={cn("text-xs", entry.status === "completed" ? "text-emerald-400 font-medium" : "text-muted-foreground")}>{format(parseISO(entry.last_service_date), "dd MMM yyyy")}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={cn("flex items-center gap-1 text-xs", getDateUrgencyClass(entry))}>
                      <Calendar size={9} /> {formatDate(entry)}
                      {entry.date_type === "month_only" && (
                        <span className="text-[9px] opacity-70 font-medium ml-0.5">(est.)</span>
                      )}
                    </span>
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
                      ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><User size={9} /> {firstName(entry.assignee_name)}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={cn("flex items-center gap-1 text-xs", entry.reminder_days > 0 ? getReminderUrgencyClass(entry) : "text-muted-foreground/40")}>
                      <Bell size={9} /> {entry.reminder_days > 0 ? `${entry.reminder_days}d` : "Off"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {entry.recurrence_months
                      ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><RotateCcw size={9} /> {entry.recurrence_months === -1 ? "Weekly" : entry.recurrence_months === -2 ? "Monthly" : `Every ${entry.recurrence_months}mo`}</span>
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
