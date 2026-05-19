import { cn } from "@/lib/utils";
import type { IssueStatus, IssuePriority } from "@/hooks/useMaintenanceIssues";

const STATUS_CONFIG: Record<IssueStatus, { label: string; className: string; dot: string }> = {
  reported:    { label: "Reported",    className: "bg-[hsl(var(--status-urgent)/0.12)] text-[hsl(var(--status-urgent))] border-[hsl(var(--status-urgent)/0.3)]",  dot: "bg-[hsl(var(--status-urgent))]" },
  approved:    { label: "Approved",    className: "bg-[hsl(var(--gold)/0.12)] text-[hsl(var(--gold))] border-[hsl(var(--gold)/0.3)]",                            dot: "bg-[hsl(var(--gold))]" },
  
  scheduled:   { label: "Scheduled",  className: "bg-[hsl(270_60%_65%/0.12)] text-[hsl(270_60%_70%)] border-[hsl(270_60%_65%/0.3)]",                           dot: "bg-[hsl(270_60%_65%)]" },
  in_progress: { label: "In Progress", className: "bg-[hsl(var(--status-pending)/0.12)] text-[hsl(var(--status-pending))] border-[hsl(var(--status-pending)/0.3)]", dot: "bg-[hsl(var(--status-pending))]" },
  resolved:    { label: "Resolved",   className: "bg-[hsl(var(--status-done)/0.12)] text-[hsl(var(--status-done))] border-[hsl(var(--status-done)/0.3)]",       dot: "bg-[hsl(var(--status-done))]" },
};

const PRIORITY_CONFIG: Record<IssuePriority, { label: string; className: string }> = {
  urgent: { label: "🔴 Urgent", className: "text-[hsl(var(--status-urgent))]" },
  high:   { label: "🟠 High",   className: "text-orange-400" },
  medium: { label: "🟡 Medium", className: "text-[hsl(var(--gold))]" },
  low:    { label: "⚪ Low",    className: "text-muted-foreground" },
};

export function IssueStatusBadge({ status, size = "sm" }: { status: IssueStatus; size?: "xs" | "sm" }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border font-semibold",
      size === "xs" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
      cfg.className
    )}>
      <span className={cn("rounded-full flex-shrink-0", size === "xs" ? "w-1 h-1" : "w-1.5 h-1.5", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function IssuePriorityBadge({ priority }: { priority: IssuePriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={cn("text-[10px] font-semibold", cfg.className)}>{cfg.label}</span>
  );
}

export { STATUS_CONFIG, PRIORITY_CONFIG };
