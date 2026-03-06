import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { Clock, MapPin, User, BookOpen, Paperclip, AlertTriangle, Circle, CheckSquare, ChevronRight, Package } from "lucide-react";

export type TaskStatus = "pending" | "in_progress" | "completed" | "urgent";

export interface KanbanTask {
  id: string;
  title_en: string;
  title_es?: string | null;
  description_en?: string | null;
  status: TaskStatus;
  priority: number;
  due_date?: string | null;
  assigned_to?: string | null;
  property_id?: string | null;
  assigned_department?: string | null;
  assigned_role?: string | null;
  linked_checklist_id?: string | null;
  is_draft?: boolean;
  ai_suggested?: boolean;
  attachments?: { url: string; type: string; name: string }[];
  created_at: string;
  property?: { name: string } | null;
  assignee?: { full_name: string | null } | null;
  linked_checklist?: { title: string; icon: string } | null;
}

interface Props {
  task: KanbanTask;
  onClick: () => void;
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; labelEs: string; dot: string; badge: string }> = {
  pending:     { label: "Pending",     labelEs: "Pendiente",   dot: "bg-muted-foreground",  badge: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", labelEs: "En Progreso", dot: "bg-accent",             badge: "bg-accent/10 text-accent" },
  completed:   { label: "Completed",   labelEs: "Completado",  dot: "bg-status-done",        badge: "bg-[hsl(var(--status-done)/0.12)] text-status-done" },
  urgent:      { label: "Urgent",      labelEs: "Urgente",     dot: "bg-status-urgent",      badge: "bg-[hsl(var(--status-urgent)/0.12)] text-status-urgent" },
};

export function TaskCard({ task, onClick }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";
  const title = isL && task.title_es ? task.title_es : task.title_en;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed";
  const hasAttachments = (task.attachments?.length ?? 0) > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left bg-card border rounded-xl p-3 shadow-sm active:scale-[0.98] transition-all hover:border-[hsl(var(--gold)/0.3)] hover:shadow-md",
        task.status === "urgent" ? "border-status-urgent/30" : "border-border",
        task.is_draft ? "opacity-70 border-dashed" : "",
      )}
    >
      {/* Top row: badges */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {task.ai_suggested && (
          <span className="text-[9px] font-bold bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))] border border-[hsl(var(--gold)/0.3)] px-1.5 py-0.5 rounded-full leading-none">
            ✦ RONIN
          </span>
        )}
        {task.is_draft && (
          <span className="text-[9px] font-bold bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded-full leading-none">
            DRAFT
          </span>
        )}
        {task.priority === 1 && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold text-status-urgent">
            <AlertTriangle size={9} /> {isL ? "URGENTE" : "URGENT"}
          </span>
        )}
      </div>

      {/* Title */}
      <p className={cn(
        "text-sm font-medium leading-snug mb-2",
        task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"
      )}>
        {title}
      </p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {task.due_date && (
          <span className={cn("flex items-center gap-0.5 text-[10px]", isOverdue ? "text-status-urgent" : "text-muted-foreground")}>
            <Clock size={9} />
            {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
        {task.property?.name && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <MapPin size={9} /> {task.property.name}
          </span>
        )}
        {task.assignee?.full_name && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <User size={9} /> {task.assignee.full_name.split(" ")[0]}
          </span>
        )}
        {(task.assigned_department || task.assigned_role) && !task.assignee?.full_name && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <User size={9} /> {task.assigned_department || task.assigned_role}
          </span>
        )}
        {task.linked_checklist && (
          <span className="flex items-center gap-0.5 text-[10px] text-[hsl(var(--gold))]">
            <BookOpen size={9} /> {task.linked_checklist.title}
          </span>
        )}
        {hasAttachments && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Paperclip size={9} /> {task.attachments?.length}
          </span>
        )}
      </div>
    </button>
  );
}
