import { X, Pencil, Trash2, Calendar, MapPin, User, Link as LinkIcon, ChevronRight } from "lucide-react";
import { IssueStatusBadge, IssuePriorityBadge, STATUS_CONFIG } from "./IssueStatusBadge";
import type { MaintenanceIssue, IssueStatus, MaintenanceCategory } from "@/hooks/useMaintenanceIssues";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  issue: MaintenanceIssue;
  onClose: () => void;
  onEdit?: (issue: MaintenanceIssue) => void;
  onStatusChange?: (issue: MaintenanceIssue, status: IssueStatus) => void;
  onDelete?: (id: string) => void;
  categories: MaintenanceCategory[];
}

const STATUSES: IssueStatus[] = ["reported", "approved", "assigned", "scheduled", "in_progress", "resolved"];

export function IssueDetailDrawer({ issue, onClose, onEdit, onStatusChange, onDelete, categories: _cats }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <IssueStatusBadge status={issue.status} />
              <IssuePriorityBadge priority={issue.priority} />
            </div>
            <h2 className="font-semibold text-foreground text-base leading-snug">{issue.title}</h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onEdit && (
              <button onClick={() => onEdit(issue)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Main photo */}
          {issue.photo_url && (
            <div className="rounded-xl overflow-hidden">
              <img src={issue.photo_url} alt={issue.title} className="w-full h-52 object-cover" />
            </div>
          )}

          {/* Description */}
          {issue.description && (
            <p className="text-sm text-foreground/80 leading-relaxed">{issue.description}</p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            {issue.property_name && (
              <div className="bg-muted/40 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><MapPin size={9}/> Property</p>
                <p className="text-sm font-medium text-foreground">{issue.property_name}</p>
                {issue.location_detail && <p className="text-xs text-muted-foreground mt-0.5">{issue.location_detail}</p>}
              </div>
            )}
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Category</p>
              <p className="text-sm font-medium text-foreground">{issue.category}</p>
            </div>
            {issue.reporter_name && (
              <div className="bg-muted/40 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><User size={9}/> Reported by</p>
                <p className="text-sm font-medium text-foreground">{issue.reporter_name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}</p>
              </div>
            )}
            {issue.assignee_name && (
              <div className="bg-muted/40 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><User size={9}/> Assigned to</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {issue.assignee_avatar
                    ? <img src={issue.assignee_avatar} alt={issue.assignee_name} className="w-5 h-5 rounded-full object-cover" />
                    : <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                        {issue.assignee_name.charAt(0)}
                      </div>
                  }
                  <p className="text-sm font-medium text-foreground">{issue.assignee_name}</p>
                </div>
              </div>
            )}
            {issue.scheduled_date && (
              <div className="bg-muted/40 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar size={9}/> Scheduled</p>
                <p className="text-sm font-medium text-foreground">{format(new Date(issue.scheduled_date), "MMM d, yyyy")}</p>
              </div>
            )}
            {issue.resolved_at && (
              <div className="bg-[hsl(var(--status-done)/0.08)] border border-[hsl(var(--status-done)/0.2)] rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Resolved</p>
                <p className="text-sm font-medium text-[hsl(var(--status-done))]">{format(new Date(issue.resolved_at), "MMM d, yyyy")}</p>
              </div>
            )}
          </div>

          {/* Recurring link */}
          {issue.related_issue_title && (
            <div className="flex items-center gap-2 bg-amber-400/10 border border-amber-400/30 rounded-xl px-4 py-3">
              <LinkIcon size={14} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">Recurring — linked to previous incident</p>
                <p className="text-xs font-medium text-foreground truncate">{issue.related_issue_title}</p>
              </div>
            </div>
          )}

          {/* Close-out photo */}
          {issue.close_out_photo_url && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Close-out photo</p>
              <div className="rounded-xl overflow-hidden">
                <img src={issue.close_out_photo_url} alt="Close-out" className="w-full h-40 object-cover" />
              </div>
            </div>
          )}

          {/* Status progression (admin/manager) */}
          {onStatusChange && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Move to status</p>
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {STATUSES.map((s, idx) => {
                  const isActive = issue.status === s;
                  const isPast = STATUSES.indexOf(issue.status) > idx;
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <div key={s} className="flex items-center flex-shrink-0">
                      <button
                        onClick={() => !isActive && onStatusChange(issue, s)}
                        disabled={isActive}
                        className={cn(
                          "text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all",
                          isActive ? cn(cfg.className, "scale-105 shadow-sm") :
                          isPast ? "border-border text-muted-foreground/40 bg-muted/20" :
                          "border-border text-muted-foreground hover:border-gold/40 hover:text-foreground cursor-pointer"
                        )}
                      >
                        {s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                      {idx < STATUSES.length - 1 && (
                        <ChevronRight size={10} className="mx-0.5 text-muted-foreground/30 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {onDelete && (
          <div className="sticky bottom-0 bg-background border-t border-border px-5 py-4">
            {confirmDelete ? (
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:bg-muted">
                  Cancel
                </button>
                <button
                  onClick={() => { onDelete(issue.id); onClose(); }}
                  className="flex-1 rounded-xl bg-[hsl(var(--status-urgent))] text-white py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Yes, delete
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 text-[hsl(var(--status-urgent))] text-sm hover:opacity-80 transition-opacity"
              >
                <Trash2 size={14} /> Delete issue
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// useState needs to be imported
import { useState } from "react";
