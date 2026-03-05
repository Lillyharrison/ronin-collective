import { cn } from "@/lib/utils";
import { useChecklistSessions, useChecklistItems } from "@/hooks/useChecklists";
import { ChecklistTemplate } from "@/hooks/useChecklists";
import { ChevronRight, RefreshCw, CheckCircle2 } from "lucide-react";

interface Props {
  template: ChecklistTemplate;
  propertyId?: string | null;
  onOpenDetail?: () => void;
}

const COLOR_BG: Record<string, string> = {
  green:  "bg-[hsl(var(--status-done)/0.1)] border-[hsl(var(--status-done)/0.25)] text-[hsl(var(--status-done))]",
  amber:  "bg-[hsl(var(--status-progress)/0.1)] border-[hsl(var(--status-progress)/0.25)] text-[hsl(var(--status-progress))]",
  red:    "bg-[hsl(var(--status-urgent)/0.1)] border-[hsl(var(--status-urgent)/0.25)] text-[hsl(var(--status-urgent))]",
  blue:   "bg-blue-500/10 border-blue-500/25 text-blue-500",
  gold:   "bg-[hsl(var(--gold)/0.1)] border-[hsl(var(--gold)/0.25)] text-[hsl(var(--gold))]",
  purple: "bg-purple-500/10 border-purple-500/25 text-purple-400",
};

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Daily", weekly: "Weekly", biweekly: "Bi-weekly",
  monthly: "Monthly", annual: "Annual",
};

export function ChecklistCard({ template, propertyId, onOpenDetail }: Props) {
  const { completedIds } = useChecklistSessions(template.id, propertyId);
  const { items } = useChecklistItems(template.id);
  const colorCls = COLOR_BG[template.color] ?? COLOR_BG.green;

  const totalItems = items.length;
  const completedCount = completedIds.size;
  const isAllComplete = totalItems > 0 && completedCount >= totalItems;
  const hasProgress = completedCount > 0;
  const progressPct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  const recurrenceLabel = template.recurrence && template.recurrence !== "none"
    ? RECURRENCE_LABELS[template.recurrence]
    : null;

  return (
    <button
      onClick={onOpenDetail}
      className={cn(
        "w-full bg-card border rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-muted/30 active:scale-[0.99] transition-all text-left",
        isAllComplete ? "border-[hsl(var(--status-done)/0.4)]" : "border-border"
      )}
    >
      <span className={cn(
        "w-9 h-9 rounded-xl border flex items-center justify-center text-base flex-shrink-0",
        isAllComplete
          ? "bg-[hsl(var(--status-done)/0.15)] border-[hsl(var(--status-done)/0.3)] text-[hsl(var(--status-done))]"
          : colorCls
      )}>
        {isAllComplete ? <CheckCircle2 size={18} /> : template.icon}
      </span>

      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium leading-tight truncate",
          isAllComplete ? "text-[hsl(var(--status-done))]" : "text-foreground"
        )}>
          {template.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {isAllComplete ? (
            <span className="text-[10px] font-semibold text-[hsl(var(--status-done))]">
              ✓ Complete today
            </span>
          ) : hasProgress ? (
            <span className={cn("text-[10px] font-semibold", colorCls.split(" ").find(c => c.startsWith("text-")))}>
              {completedCount}/{totalItems} done
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {totalItems > 0 ? `${totalItems} items` : "Tap to open"}
            </span>
          )}
          {recurrenceLabel && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <RefreshCw size={8} /> {recurrenceLabel}
            </span>
          )}
          {template.assigned_department && (
            <span className="text-[9px] text-accent/70 capitalize font-medium">
              {template.assigned_department}
            </span>
          )}
        </div>
        {/* Progress bar — only shown when in progress */}
        {hasProgress && !isAllComplete && (
          <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full">
            <div
              className="h-full bg-[hsl(var(--gold))] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        {/* Complete bar */}
        {isAllComplete && (
          <div className="mt-1.5 h-1 bg-[hsl(var(--status-done)/0.2)] rounded-full overflow-hidden w-full">
            <div className="h-full bg-[hsl(var(--status-done))] rounded-full w-full" />
          </div>
        )}
      </div>

      <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
    </button>
  );
}
