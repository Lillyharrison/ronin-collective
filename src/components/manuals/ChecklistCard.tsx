import { cn } from "@/lib/utils";
import { useChecklistSessions } from "@/hooks/useChecklists";
import { ChecklistTemplate } from "@/hooks/useChecklists";
import { ChevronRight, RefreshCw } from "lucide-react";

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
  // Always load today's sessions for live progress indicator
  const { completedIds, sessions } = useChecklistSessions(template.id, propertyId);
  const colorCls = COLOR_BG[template.color] ?? COLOR_BG.green;
  // We don't know item count without loading items — show session count as proxy
  const completedCount = completedIds.size;
  const hasProgress = completedCount > 0;
  const recurrenceLabel = template.recurrence && template.recurrence !== "none"
    ? RECURRENCE_LABELS[template.recurrence]
    : null;

  return (
    <button
      onClick={onOpenDetail}
      className="w-full bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-muted/30 active:scale-[0.99] transition-all text-left"
    >
      <span className={cn("w-9 h-9 rounded-xl border flex items-center justify-center text-base flex-shrink-0", colorCls)}>
        {template.icon}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight truncate">{template.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {hasProgress ? (
            <span className={cn("text-[10px] font-semibold", colorCls.split(" ").find(c => c.startsWith("text-")))}>
              {completedCount} done today
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">Tap to open</span>
          )}
          {recurrenceLabel && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <RefreshCw size={8} /> {recurrenceLabel}
            </span>
          )}
        </div>
        {/* Live progress bar (shown when there's any progress) */}
        {hasProgress && (
          <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full">
            <div
              className="h-full bg-[hsl(var(--gold))] rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, completedCount * 10)}%` }}
            />
          </div>
        )}
      </div>

      <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
    </button>
  );
}
