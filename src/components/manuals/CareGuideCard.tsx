import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { BookOpen, Eye, EyeOff, ChevronRight, Printer } from "lucide-react";

interface CareGuideTemplate {
  id: string;
  title: string;
  icon: string;
  color: string;
  is_published: boolean;
  location?: string | null;
}

interface Props {
  template: CareGuideTemplate;
  onOpen: () => void;
  onChanged?: () => void;
}

const COLOR_MAP: Record<string, string> = {
  gold:   "border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.08)] text-[hsl(var(--gold))]",
  amber:  "border-[hsl(var(--status-progress)/0.4)] bg-[hsl(var(--status-progress)/0.08)] text-[hsl(var(--status-progress))]",
  blue:   "border-blue-500/40 bg-blue-500/8 text-blue-500",
  purple: "border-purple-500/40 bg-purple-500/8 text-purple-400",
  green:  "border-[hsl(var(--status-done)/0.4)] bg-[hsl(var(--status-done)/0.08)] text-[hsl(var(--status-done))]",
};

export function CareGuideCard({ template, onOpen, onChanged }: Props) {
  const { isMasterAdmin } = usePermissions();
  const colorCls = COLOR_MAP[template.color] ?? COLOR_MAP.gold;
  const isDraft = !template.is_published;

  const togglePublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase
      .from("checklist_templates")
      .update({ is_published: !template.is_published })
      .eq("id", template.id);
    onChanged?.();
  };

  return (
    <div
      className={cn(
        "bg-card border rounded-2xl overflow-hidden transition-all cursor-pointer hover:border-[hsl(var(--gold)/0.4)] hover:shadow-sm active:scale-[0.98]",
        isDraft ? "border-border opacity-60" : "border-border"
      )}
      onClick={onOpen}
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className={cn(
          "w-10 h-10 rounded-xl border flex items-center justify-center text-xl flex-shrink-0",
          isDraft ? "bg-muted border-muted-foreground/20 text-muted-foreground" : colorCls
        )}>
          {template.icon}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("font-display text-sm font-medium", isDraft ? "text-muted-foreground" : "text-foreground")}>
              {template.title}
            </p>
            {isDraft && isMasterAdmin && (
              <span className="text-[9px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full border border-border flex-shrink-0">
                DRAFT
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            {template.location
              ? <><span>📍</span> {template.location}</>
              : <><BookOpen size={9} /> Tap to view care guide</>}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isMasterAdmin && (
            <button
              onClick={togglePublish}
              title={isDraft ? "Publish this care guide" : "Unpublish (hide from staff)"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold tracking-wide transition-all",
                isDraft
                  ? "border-[hsl(var(--gold)/0.5)] bg-[hsl(var(--gold)/0.1)] text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold)/0.2)]"
                  : "border-[hsl(var(--status-done)/0.3)] text-[hsl(var(--status-done))] hover:border-[hsl(var(--status-done)/0.6)]"
              )}
            >
              {isDraft ? <><Eye size={12} /> PUBLISH</> : <><EyeOff size={12} /> LIVE</>}
            </button>
          )}
          <ChevronRight size={14} className="text-muted-foreground/50" />
        </div>
      </div>
    </div>
  );
}
