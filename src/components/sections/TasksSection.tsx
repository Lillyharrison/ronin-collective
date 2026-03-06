import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { cn } from "@/lib/utils";
import {
  Plus, Circle, Clock, CheckSquare, AlertTriangle, Bot,
} from "lucide-react";
import { TaskCard, KanbanTask, STATUS_CONFIG, TaskStatus } from "@/components/tasks/TaskCard";
import { TaskModal, FullTask } from "@/components/tasks/TaskModal";

// ─── Partial checklists widget (keep from original) ───────────────────────────
function PartialChecklistsWidget() {
  const { openChecklistDetail } = useNavigation();
  const { assignedPropertyIds, isAdmin, userId, loading: permLoading } = usePermissions();
  const { language } = useLanguage();
  const [assignedChecklists, setAssignedChecklists] = useState<Array<{
    id: string; title: string; icon: string; propertyId: string | null;
  }>>([]);

  useEffect(() => {
    if (permLoading || !userId) return;
    async function load() {
      const { data: profile } = await supabase.from("profiles").select("department, level, assigned_property_ids").eq("id", userId!).single();
      if (!profile) return;
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userId!).single();
      const userRole = roleRow?.role ?? profile.level ?? "staff";
      const propIds: string[] = profile.assigned_property_ids ?? assignedPropertyIds;
      let q = supabase.from("checklist_templates").select("id, title, icon, property_id, recurrence, assigned_role, assigned_department").in("category", ["cleaning", "audit", "checklist", "activity"]).eq("is_published", true);
      if (propIds.length > 0) {
        q = q.or(`property_id.in.(${propIds.join(",")}),is_universal.eq.true`);
      } else {
        q = q.eq("is_universal", true);
      }
      const { data: templates } = await q;
      if (!templates) return;
      const relevant = templates.filter((t: any) => {
        const roleMatch = !t.assigned_role || t.assigned_role === userRole;
        const deptMatch = !t.assigned_department || !profile.department || t.assigned_department === profile.department;
        return roleMatch && deptMatch;
      });
      const today = new Date().toISOString().slice(0, 10);
      const relevantIds = relevant.map((t: any) => t.id);
      if (!relevantIds.length) return;
      const [{ data: sessions }, { data: itemCounts }] = await Promise.all([
        supabase.from("checklist_sessions").select("template_id, item_id").in("template_id", relevantIds).eq("session_date", today),
        supabase.from("checklist_items").select("template_id, id").in("template_id", relevantIds),
      ]);
      const sessionMap: Record<string, Set<string>> = {};
      for (const s of sessions ?? []) {
        if (!sessionMap[s.template_id]) sessionMap[s.template_id] = new Set();
        sessionMap[s.template_id].add(s.item_id);
      }
      const itemCountMap: Record<string, number> = {};
      for (const item of itemCounts ?? []) {
        itemCountMap[item.template_id] = (itemCountMap[item.template_id] ?? 0) + 1;
      }
      const incomplete = relevant.filter((t: any) => {
        const total = itemCountMap[t.id] ?? 0;
        if (total === 0) return false;
        const done = sessionMap[t.id]?.size ?? 0;
        return done < total;
      });
      setAssignedChecklists(incomplete.map((t: any) => ({ id: t.id, title: t.title, icon: t.icon, propertyId: t.property_id })));
    }
    load();
  }, [permLoading, userId, assignedPropertyIds]);

  if (!assignedChecklists.length) return null;
  return (
    <div className="mb-3">
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">
        {language === "es" ? "Listas pendientes hoy" : "Pending checklists today"}
      </p>
      {assignedChecklists.map(c => (
        <button
          key={c.id}
          onClick={() => openChecklistDetail(c.id, c.propertyId ?? undefined)}
          className="w-full flex items-center gap-2 mb-1.5 px-3 py-2.5 bg-card border border-border rounded-xl text-left hover:border-[hsl(var(--gold)/0.3)] transition-colors"
        >
          <span className="text-base">{c.icon}</span>
          <span className="flex-1 text-sm font-medium text-foreground truncate">{c.title}</span>
          <CheckSquare size={13} className="text-muted-foreground flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────
interface ColumnProps {
  status: TaskStatus;
  tasks: KanbanTask[];
  onTaskClick: (task: KanbanTask) => void;
  onAddClick?: () => void;
  isAdmin: boolean;
}

function KanbanColumn({ status, tasks, onTaskClick, onAddClick, isAdmin }: ColumnProps) {
  const { language } = useLanguage();
  const cfg = STATUS_CONFIG[status];
  const ICONS: Record<TaskStatus, React.ReactNode> = {
    urgent:     <AlertTriangle size={12} />,
    pending:    <Circle size={12} />,
    in_progress:<Clock size={12} />,
    completed:  <CheckSquare size={12} />,
  };

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Column header */}
      <div className={cn("flex items-center justify-between px-3 py-2 rounded-t-xl border-b", cfg.badge)}>
        <div className="flex items-center gap-1.5">
          {ICONS[status]}
          <span className="text-xs font-semibold">
            {language === "es" ? cfg.labelEs : cfg.label}
          </span>
          <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full font-bold">
            {tasks.length}
          </span>
        </div>
        {isAdmin && status !== "completed" && onAddClick && (
          <button
            onClick={onAddClick}
            className="p-1 rounded-lg hover:bg-black/10 transition-colors"
          >
            <Plus size={13} />
          </button>
        )}
      </div>
      {/* Cards */}
      <div className="bg-muted/30 rounded-b-xl p-2 space-y-2 min-h-[80px] max-h-[55vh] overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-16">
            <p className="text-[10px] text-muted-foreground/50 italic">
              {language === "es" ? "Sin tareas" : "No tasks"}
            </p>
          </div>
        ) : (
          tasks.map(t => <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />)
        )}
      </div>
    </div>
  );
}

// ─── Main TasksSection ────────────────────────────────────────────────────────
export function TasksSection() {
  const { language } = useLanguage();
  const { userId, isAdmin, isManager, isMasterAdmin, assignedPropertyIds, loading: permLoading } = usePermissions();
  const isL = language === "es";

  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  const [modalTask, setModalTask]   = useState<FullTask | null | undefined>(undefined);
  const [newStatus, setNewStatus]   = useState<TaskStatus>("pending");

  async function fetchTasks() {
    if (!userId) return;
    setLoading(true);

    let query = supabase
      .from("tasks")
      .select(`
        id, title_en, title_es, description_en, status, priority, due_date,
        assigned_to, property_id, assigned_department, assigned_role,
        linked_checklist_id, is_draft, ai_suggested, attachments, created_at,
        property:properties(name),
        assignee:profiles!tasks_assigned_to_fkey(full_name),
        linked_checklist:checklist_templates(title, icon)
      `)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (!isAdmin && !isManager) {
      query = query.eq("assigned_to", userId).eq("is_draft", false);
    } else if (!isAdmin && assignedPropertyIds.length > 0) {
      query = query.in("property_id", assignedPropertyIds);
    }

    const { data } = await query;
    const all = (data as unknown as KanbanTask[]) ?? [];
    setTasks(all);
    setDraftCount(all.filter(t => t.is_draft).length);
    setLoading(false);
  }

  useEffect(() => {
    if (!permLoading) fetchTasks();
  }, [permLoading, userId, isAdmin, isManager]);

  const liveTasks = tasks.filter(t => !t.is_draft);
  const draftTasks = tasks.filter(t => t.is_draft);

  const columns: TaskStatus[] = ["urgent", "pending", "in_progress", "completed"];
  const byStatus = (s: TaskStatus) => liveTasks.filter(t => t.status === s);

  const openNew = (status: TaskStatus) => {
    setNewStatus(status);
    setModalTask(null);
  };

  const openEdit = (task: KanbanTask) => {
    setModalTask({
      id: task.id,
      title_en: task.title_en,
      title_es: task.title_es,
      description_en: task.description_en,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      assigned_to: task.assigned_to,
      property_id: task.property_id,
      assigned_department: task.assigned_department,
      assigned_role: task.assigned_role,
      linked_checklist_id: task.linked_checklist_id,
      is_draft: task.is_draft,
      ai_suggested: task.ai_suggested,
      attachments: (task.attachments ?? []) as any,
    });
  };

  return (
    <div className="animate-fade-in pb-6">
      {/* Header */}
      <div className="bg-charcoal px-5 pt-6 pb-4 border-b border-charcoal-light">
        <h1 className="font-display text-3xl text-cream leading-tight">
          {isL ? "Tareas" : "Tasks"} <span className="text-gold">&</span>{" "}
          {isL ? "Asignaciones" : "Assignments"}
        </h1>
        <p className="text-cream/40 text-xs mt-1 tracking-wide">
          {isL ? "Kanban en tiempo real" : "Real-time estate task board"}
        </p>
      </div>

      {/* Top bar: new task button */}
      {(isAdmin || isManager || isMasterAdmin) && (
        <div className="flex justify-end px-4 py-3 border-b border-border">
          <button
            onClick={() => openNew("pending")}
            className="flex items-center gap-1.5 bg-[hsl(var(--gold))] text-charcoal text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
          >
            <Plus size={13} /> {isL ? "Nueva" : "New"}
          </button>
        </div>
      )}

      {/* Draft tasks banner */}
      {draftCount > 0 && (isAdmin || isMasterAdmin) && (
        <button
          onClick={() => setShowDrafts(v => !v)}
          className="w-full flex items-center gap-2.5 px-4 py-3 bg-[hsl(var(--gold)/0.08)] border-b border-[hsl(var(--gold)/0.2)] text-left"
        >
          <Bot size={14} className="text-[hsl(var(--gold))] flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-[hsl(var(--gold))]">
              {draftCount} {isL ? "tarea(s) en borrador" : `draft task${draftCount > 1 ? "s" : ""}`} {isL ? "de Ronin pendientes" : "awaiting review"}
            </p>
            <p className="text-[10px] text-[hsl(var(--gold)/0.6)]">
              {isL ? "Toca para revisar y publicar" : "Tap to review & publish"}
            </p>
          </div>
          <span className="text-[10px] text-[hsl(var(--gold)/0.6)]">{showDrafts ? "▲" : "▼"}</span>
        </button>
      )}

      {/* Draft tasks list */}
      {showDrafts && draftTasks.length > 0 && (
        <div className="px-4 py-3 bg-[hsl(var(--gold)/0.04)] border-b border-[hsl(var(--gold)/0.15)] space-y-2">
          {draftTasks.map(t => (
            <TaskCard key={t.id} task={t} onClick={() => openEdit(t)} />
          ))}
        </div>
      )}

      {/* Partial checklists widget */}
      <div className="px-4 pt-4">
        <PartialChecklistsWidget />
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 pt-2 pb-4">
          {columns.map(s => (
            <div key={s}>
              <div className="h-8 rounded-t-xl bg-muted animate-pulse mb-2" />
              {[1,2].map(i => <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse mb-2" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 pt-2 pb-4">
          {columns.map(s => (
            <KanbanColumn
              key={s}
              status={s}
              tasks={byStatus(s)}
              onTaskClick={openEdit}
              onAddClick={() => openNew(s)}
              isAdmin={isAdmin || isMasterAdmin}
            />
          ))}
        </div>
      )}

      {/* Task modal */}
      {modalTask !== undefined && (
        <TaskModal
          task={modalTask}
          defaultDraft={false}
          onClose={() => setModalTask(undefined)}
          onSaved={fetchTasks}
        />
      )}
    </div>
  );
}
