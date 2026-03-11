import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Bot, ChevronRight, Clock, Send } from "lucide-react";
import { TaskModal, FullTask } from "@/components/tasks/TaskModal";

interface DraftTask {
  id: string;
  title_en: string;
  description_en: string | null;
  due_date: string | null;
  priority: number;
  status: "pending" | "in_progress" | "completed" | "urgent";
  property_id: string | null;
  assigned_to: string | null;
  assigned_department: string | null;
  assigned_role: string | null;
  linked_checklist_id: string | null;
  is_draft: boolean;
  ai_suggested: boolean;
  attachments: { url: string; type: string; name: string }[];
  created_at: string;
  property?: { name: string } | null;
  linked_checklist?: { title: string; icon: string } | null;
}

export function DraftTasksWidget() {
  const { isMasterAdmin, isAdmin, loading: permLoading } = usePermissions();
  const { setActiveSection } = useNavigation();
  const { language } = useLanguage();
  const isL = language === "es";

  const [drafts, setDrafts]       = useState<DraftTask[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editTask, setEditTask]   = useState<FullTask | null>(null);

  useEffect(() => {
    if (permLoading || (!isMasterAdmin && !isAdmin)) { setLoading(false); return; }

    function fetchDrafts() {
      supabase
        .from("tasks")
        .select(`
          id, title_en, description_en, due_date, priority, status, property_id,
          assigned_to, assigned_department, assigned_role, linked_checklist_id,
          is_draft, ai_suggested, attachments, created_at,
          property:properties(name),
          linked_checklist:checklist_templates(title, icon)
        `)
        .eq("is_draft", true)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setDrafts((data as unknown as DraftTask[]) ?? []);
          setLoading(false);
        });
    }

    fetchDrafts();

    // Subscribe to realtime so widget disappears immediately when drafts are deleted
    const channel = supabase
      .channel("draft_tasks_widget")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, fetchDrafts)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [permLoading, isMasterAdmin, isAdmin]);

  if (!isMasterAdmin && !isAdmin) return null;
  if (loading || drafts.length === 0) return null;

  return (
    <>
      <div className="mx-4 mt-4 rounded-xl bg-[hsl(var(--gold)/0.06)] border border-[hsl(var(--gold)/0.2)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--gold)/0.15)]">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-[hsl(var(--gold))]" />
            <span className="text-xs font-semibold text-[hsl(var(--gold))] tracking-wide">
              {isL ? `RONIN — ${drafts.length} borrador${drafts.length > 1 ? "es" : ""}` : `RONIN — ${drafts.length} Draft Task${drafts.length > 1 ? "s" : ""}`}
            </span>
          </div>
          <button
            onClick={() => setActiveSection("tasks")}
            className="text-[10px] text-[hsl(var(--gold)/0.7)] hover:text-[hsl(var(--gold))] flex items-center gap-0.5 transition-colors"
          >
            {isL ? "Ver todas" : "View all"} <ChevronRight size={10} />
          </button>
        </div>
        {/* Draft list */}
        <div className="divide-y divide-[hsl(var(--gold)/0.1)]">
          {drafts.slice(0, 3).map(task => (
            <button
              key={task.id}
              onClick={() => setEditTask({
                id: task.id,
                title_en: task.title_en,
                description_en: task.description_en,
                status: task.status,
                priority: task.priority,
                due_date: task.due_date,
                assigned_to: task.assigned_to,
                property_id: task.property_id,
                assigned_department: task.assigned_department,
                assigned_role: task.assigned_role,
                linked_checklist_id: task.linked_checklist_id,
                is_draft: true,
                ai_suggested: task.ai_suggested,
                attachments: (task.attachments as { url: string; type: "image" | "file"; name: string }[]),
              })}
              className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[hsl(var(--gold)/0.06)] active:bg-[hsl(var(--gold)/0.1)] transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-[hsl(var(--gold)/0.15)] flex items-center justify-center flex-shrink-0 mt-0.5">
                {task.ai_suggested ? <Bot size={12} className="text-[hsl(var(--gold))]" /> : <Send size={12} className="text-[hsl(var(--gold))]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{task.title_en}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {task.property?.name && (
                    <span className="text-[10px] text-muted-foreground truncate">{task.property.name}</span>
                  )}
                  {task.due_date && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                      <Clock size={8} />
                      {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                  {task.linked_checklist && (
                    <span className="text-[10px] text-[hsl(var(--gold)/0.7)] flex-shrink-0">
                      {task.linked_checklist.icon} {task.linked_checklist.title}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={14} className="text-[hsl(var(--gold)/0.4)] flex-shrink-0 mt-0.5" />
            </button>
          ))}
          {drafts.length > 3 && (
            <button
              onClick={() => setActiveSection("tasks")}
              className="w-full px-4 py-2.5 text-center text-[11px] text-[hsl(var(--gold)/0.7)] hover:text-[hsl(var(--gold))] transition-colors"
            >
              +{drafts.length - 3} {isL ? "más" : "more"} →
            </button>
          )}
        </div>
      </div>
      {/* Edit modal */}
      {editTask && (
        <TaskModal
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={() => {
            setEditTask(null);
            supabase.from("tasks").select("id").eq("is_draft", true).then(({ data }) => {
              if (data) setDrafts(prev => prev.filter(d => data.some(r => r.id === d.id)));
            });
          }}
        />
      )}
    </>
  );
}
