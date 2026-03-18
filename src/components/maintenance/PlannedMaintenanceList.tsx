import { useState } from "react";
import { Plus, RefreshCw, Wrench, Building2, User, Calendar, Bell, RotateCcw, CheckCircle2, Trash2, Edit2 } from "lucide-react";
import { PlannedMaintenanceEntry } from "@/hooks/usePlannedMaintenance";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

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

interface Props {
  entries: PlannedMaintenanceEntry[];
  loading: boolean;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (entry: PlannedMaintenanceEntry) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: PlannedMaintenanceEntry["status"]) => void;
  refetch: () => void;
}

export function PlannedMaintenanceList({ entries, loading, canManage, onAdd, onEdit, onDelete, onStatusChange, refetch }: Props) {
  const [filterStatus, setFilterStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = filterStatus ? entries.filter(e => e.status === filterStatus) : entries;

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
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refetch}
            className={cn("p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground", loading && "text-amber-400")}>
            <RefreshCw size={15} className={cn(loading && "animate-spin")} />
          </button>
          {canManage && (
            <button onClick={onAdd}
              className="flex items-center gap-1.5 bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
              <Plus size={14} /> Add Entry
            </button>
          )}
        </div>
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
            <button onClick={onAdd}
              className="text-xs text-gold hover:underline font-medium">
              + Add the first entry
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 pb-4 space-y-3">
          {filtered.map(entry => (
            <div key={entry.id} className="bg-card border border-border rounded-xl p-3.5 space-y-2.5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{entry.title}</p>
                  {entry.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                    STATUS_CONFIG[entry.status]?.color ?? "bg-muted text-muted-foreground border-border"
                  )}>
                    {STATUS_CONFIG[entry.status]?.label ?? entry.status}
                  </span>
                </div>
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
                  {/* Status quick-change */}
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
      )}
    </div>
  );
}
