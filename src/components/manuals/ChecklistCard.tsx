import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { useChecklistSessions, useChecklistItems, ChecklistTemplate } from "@/hooks/useChecklists";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, RefreshCw, CheckCircle2, Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

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

export const ChecklistCard = forwardRef<HTMLDivElement, Props>(
  function ChecklistCard({ template, propertyId, onOpenDetail }, ref) {
  const { completedIds } = useChecklistSessions(template.id, propertyId);
  const { items } = useChecklistItems(template.id);
  const { isMasterAdmin } = usePermissions();
  const colorCls = COLOR_BG[template.color] ?? COLOR_BG.green;
  const isDraft = !template.is_published;

  const togglePublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase
      .from("checklist_templates")
      .update({ is_published: !template.is_published })
      .eq("id", template.id);
    // Trigger parent reload via page reload for simplicity
    window.location.reload();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Delete "${template.title}"?\n\nThis will permanently remove the checklist, all its items, completion history, and comments. This cannot be undone.`
    );
    if (!confirmed) return;
    // Children (items, sessions, comments) cascade or are removed via FK; delete template
    await supabase.from("checklist_comments").delete().eq("template_id", template.id);
    await supabase.from("checklist_sessions").delete().eq("template_id", template.id);
    await supabase.from("checklist_items").delete().eq("template_id", template.id);
    const { error } = await supabase.from("checklist_templates").delete().eq("id", template.id);
    if (error) {
      toast.error("Failed to delete checklist");
      return;
    }
    toast.success("Checklist deleted");
    window.location.reload();
  };

  const totalItems = items.length;
  const completedCount = completedIds.size;
  const isAllComplete = totalItems > 0 && completedCount >= totalItems;
  const hasProgress = completedCount > 0;
  const progressPct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  const recurrenceLabel = template.recurrence && template.recurrence !== "none"
    ? RECURRENCE_LABELS[template.recurrence]
    : null;

  return (
    <div
      ref={ref}
      className={cn(
        "w-full bg-card border rounded-xl px-4 py-3 flex items-center gap-3 transition-all text-left",
        isDraft ? "border-border opacity-60 grayscale-[40%]" : isAllComplete ? "border-[hsl(var(--status-done)/0.4)]" : "border-border"
      )}>
      <button onClick={onOpenDetail} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 active:scale-[0.99] transition-all text-left">
      <span className={cn(
        "w-9 h-9 rounded-xl border flex items-center justify-center text-base flex-shrink-0",
        isDraft
          ? "bg-muted border-muted-foreground/20 text-muted-foreground"
          : isAllComplete
          ? "bg-[hsl(var(--status-done)/0.15)] border-[hsl(var(--status-done)/0.3)] text-[hsl(var(--status-done))]"
          : colorCls
      )}>
        {isAllComplete && !isDraft ? <CheckCircle2 size={18} /> : template.icon}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn(
            "text-sm font-medium leading-tight truncate",
            isDraft ? "text-muted-foreground" : isAllComplete ? "text-[hsl(var(--status-done))]" : "text-foreground"
          )}>
            {template.title}
          </p>
          {isDraft && isMasterAdmin && (
            <span className="text-[9px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full border border-border flex-shrink-0">
              DRAFT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {!isDraft && isAllComplete ? (
            <span className="text-[10px] font-semibold text-[hsl(var(--status-done))]">
              ✓ Complete today
            </span>
          ) : !isDraft && hasProgress ? (
            <span className={cn("text-[10px] font-semibold", colorCls.split(" ").find(c => c.startsWith("text-")))}>
              {completedCount}/{totalItems} done
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {totalItems > 0 ? `${totalItems} items` : "Tap to open"}
            </span>
          )}
          {recurrenceLabel && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <RefreshCw size={8} /> {recurrenceLabel}
            </span>
          )}
          {template.assigned_department && (
            <span className="text-[9px] text-accent/70 capitalize font-medium">
              {template.assigned_department}
            </span>
          )}
        </div>
        {hasProgress && !isAllComplete && !isDraft && (
          <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full">
            <div
              className="h-full bg-[hsl(var(--gold))] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        {isAllComplete && !isDraft && (
          <div className="mt-1.5 h-1 bg-[hsl(var(--status-done)/0.2)] rounded-full overflow-hidden w-full">
            <div className="h-full bg-[hsl(var(--status-done))] rounded-full w-full" />
          </div>
        )}
      </div>
      </button>

      <div className="flex items-center gap-1 flex-shrink-0">
        {isMasterAdmin && (
          <>
            <button
              onClick={togglePublish}
              title={isDraft ? "Publish" : "Unpublish"}
              className={cn(
                "p-1.5 rounded-lg border transition-all",
                isDraft
                  ? "border-muted-foreground/20 text-muted-foreground hover:border-[hsl(var(--gold))] hover:text-[hsl(var(--gold))]"
                  : "border-[hsl(var(--status-done)/0.3)] text-[hsl(var(--status-done))] hover:border-[hsl(var(--status-done)/0.6)]"
              )}
            >
              {isDraft ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              onClick={handleDelete}
              title="Delete checklist"
              className="p-1.5 rounded-lg border border-[hsl(var(--status-urgent)/0.3)] text-[hsl(var(--status-urgent))] hover:border-[hsl(var(--status-urgent)/0.6)] hover:bg-[hsl(var(--status-urgent)/0.1)] transition-all"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
        {!isMasterAdmin && <ChevronRight size={16} className="text-muted-foreground" />}
        {isMasterAdmin && <ChevronRight size={16} className="text-muted-foreground" onClick={onOpenDetail} />}
      </div>
    </div>
  );
});
