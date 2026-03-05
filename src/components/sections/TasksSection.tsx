import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import {
  CheckSquare, Clock, AlertTriangle, Circle,
  ChevronDown, Filter, Plus, MapPin, User, ClipboardList, ChevronRight,
} from "lucide-react";

type TaskStatus = "pending" | "in_progress" | "completed" | "urgent";

interface Task {
  id: string;
  title_en: string;
  title_es: string | null;
  description_en: string | null;
  description_es: string | null;
  status: TaskStatus;
  priority: number;
  category: string | null;
  due_date: string | null;
  assigned_to: string | null;
  property_id: string | null;
  created_at: string;
  property?: { name: string } | null;
  assignee?: { full_name: string | null } | null;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; labelEs: string; icon: React.ReactNode; className: string; dotClass: string }> = {
  pending:     { label: "Pending",     labelEs: "Pendiente",   icon: <Circle size={13} />,         className: "bg-muted text-muted-foreground",         dotClass: "bg-muted-foreground" },
  in_progress: { label: "In Progress", labelEs: "En Progreso", icon: <Clock size={13} />,           className: "bg-accent/10 text-accent",               dotClass: "bg-accent" },
  completed:   { label: "Done",        labelEs: "Completado",  icon: <CheckSquare size={13} />,     className: "bg-[hsl(var(--status-done)/0.12)] text-status-done", dotClass: "bg-status-done" },
  urgent:      { label: "Urgent",      labelEs: "Urgente",     icon: <AlertTriangle size={13} />,   className: "bg-[hsl(var(--status-urgent)/0.12)] text-status-urgent", dotClass: "bg-status-urgent" },
};

const PRIORITY_LABEL: Record<number, { label: string; className: string }> = {
  1: { label: "Urgent",  className: "text-status-urgent" },
  2: { label: "Normal",  className: "text-muted-foreground" },
  3: { label: "Low",     className: "text-muted-foreground/50" },
};

type FilterStatus = "all" | TaskStatus;

const FILTERS: { key: FilterStatus; label: string; labelEs: string }[] = [
  { key: "all",         label: "All",        labelEs: "Todas" },
  { key: "urgent",      label: "Urgent",     labelEs: "Urgentes" },
  { key: "pending",     label: "Pending",    labelEs: "Pendientes" },
  { key: "in_progress", label: "In Progress",labelEs: "En Progreso" },
  { key: "completed",   label: "Completed",  labelEs: "Completadas" },
];

export function TasksSection() {
  const { language } = useLanguage();
  const { userId, isAdmin, isManager, assignedPropertyIds, loading: permLoading } = usePermissions();
  const { openChecklistDetail, setActiveSection } = useNavigation();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isL = language === "es";

  async function fetchTasks() {
    if (!userId) return;
    setLoading(true);

    let query = supabase
      .from("tasks")
      .select(`
        id, title_en, title_es, description_en, description_es,
        status, priority, category, due_date, assigned_to, property_id, created_at,
        property:properties(name),
        assignee:profiles!tasks_assigned_to_fkey(full_name)
      `)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    // Role-based filter
    if (!isAdmin && !isManager) {
      // Staff: only their assigned tasks
      query = query.eq("assigned_to", userId);
    } else if (assignedPropertyIds.length > 0 && !isAdmin) {
      // Manager: tasks for their properties
      query = query.in("property_id", assignedPropertyIds);
    }
    // Admin / master_admin: see all

    const { data, error } = await query;
    if (!error && data) setTasks(data as unknown as Task[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!permLoading) fetchTasks();
  }, [permLoading, userId, isAdmin, isManager]);

  async function updateStatus(taskId: string, newStatus: TaskStatus) {
    setUpdatingId(taskId);
    const updates: Partial<Task> & { completed_at?: string | null } = { status: newStatus };
    if (newStatus === "completed") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;

    await supabase.from("tasks").update(updates).eq("id", taskId);
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...updates } : t));
    setUpdatingId(null);
  }

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const counts: Record<FilterStatus, number> = {
    all: tasks.length,
    urgent: tasks.filter((t) => t.status === "urgent").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  return (
    <div className="animate-fade-in pb-6">
      {/* Header bar */}
      <div className="sticky top-14 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">
            {filtered.length} {isL ? "tareas" : "tasks"}
          </span>
        </div>
        {(isAdmin || isManager) && (
          <button className="flex items-center gap-1.5 bg-gold text-charcoal text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95 transition-transform">
            <Plus size={13} />
            {isL ? "Nueva" : "New Task"}
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              filter === f.key
                ? "bg-gold text-charcoal border-gold"
                : "bg-card text-muted-foreground border-border hover:border-gold/40"
            }`}
          >
            {isL ? f.labelEs : f.label}
            {counts[f.key] > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                filter === f.key ? "bg-charcoal/20" : "bg-muted"
              }`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="px-4 space-y-2">

        {/* Partial checklists prompt */}
        <PartialChecklistsWidget />
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-card border border-border p-10 text-center mt-4">
            <CheckSquare size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm font-medium">
              {isL ? "Sin tareas aquí" : "No tasks here"}
            </p>
            <p className="text-muted-foreground/50 text-xs mt-1">
              {isL ? "Todo al día ✓" : "All clear ✓"}
            </p>
          </div>
        ) : (
          filtered.map((task) => {
            const statusCfg = STATUS_CONFIG[task.status];
            const priorityCfg = PRIORITY_LABEL[task.priority] ?? PRIORITY_LABEL[2];
            const isExpanded = expandedId === task.id;
            const title = isL && task.title_es ? task.title_es : task.title_en;
            const description = isL && task.description_es ? task.description_es : task.description_en;
            const isUpdating = updatingId === task.id;

            return (
              <div
                key={task.id}
                className={`bg-card border rounded-xl overflow-hidden transition-all ${
                  task.status === "urgent" ? "border-status-urgent/40" : "border-border"
                }`}
              >
                {/* Task row */}
                <button
                  className="w-full flex items-start gap-3 p-4 text-left active:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : task.id)}
                >
                  {/* Priority dot */}
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${statusCfg.dotClass}`} />

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusCfg.className}`}>
                        {statusCfg.icon}
                        {isL ? statusCfg.labelEs : statusCfg.label}
                      </span>
                      {/* Priority */}
                      {task.priority === 1 && (
                        <span className={`text-[10px] font-semibold ${priorityCfg.className}`}>
                          ● {isL ? "Urgente" : "Urgent"}
                        </span>
                      )}
                      {/* Property */}
                      {task.property?.name && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <MapPin size={9} />
                          {task.property.name}
                        </span>
                      )}
                      {/* Assignee */}
                      {task.assignee?.full_name && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <User size={9} />
                          {task.assignee.full_name.split(" ")[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronDown
                    size={16}
                    className={`text-muted-foreground flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                    {description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                    )}

                    {task.due_date && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock size={12} />
                        {isL ? "Vence:" : "Due:"}{" "}
                        {new Date(task.due_date).toLocaleDateString(isL ? "es-ES" : "en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </div>
                    )}

                    {task.category && (
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {isL ? "Categoría:" : "Category:"} {task.category}
                      </div>
                    )}

                    {/* Status actions */}
                    {task.status !== "completed" && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {task.status !== "in_progress" && (
                          <button
                            disabled={isUpdating}
                            onClick={() => updateStatus(task.id, "in_progress")}
                            className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-50"
                          >
                            {isL ? "Iniciar" : "Start"}
                          </button>
                        )}
                        <button
                          disabled={isUpdating}
                          onClick={() => updateStatus(task.id, "completed")}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(var(--status-done)/0.1)] text-status-done border border-[hsl(var(--status-done)/0.2)] hover:bg-[hsl(var(--status-done)/0.2)] transition-colors disabled:opacity-50"
                        >
                          {isUpdating ? "…" : isL ? "Completar" : "Complete"}
                        </button>
                        {(isAdmin || isManager) && task.status !== "urgent" && (
                          <button
                            disabled={isUpdating}
                            onClick={() => updateStatus(task.id, "urgent")}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(var(--status-urgent)/0.1)] text-status-urgent border border-[hsl(var(--status-urgent)/0.2)] hover:bg-[hsl(var(--status-urgent)/0.2)] transition-colors disabled:opacity-50"
                          >
                            {isL ? "Marcar Urgente" : "Mark Urgent"}
                          </button>
                        )}
                      </div>
                    )}

                    {task.status === "completed" && (
                      <button
                        disabled={isUpdating}
                        onClick={() => updateStatus(task.id, "pending")}
                        className="text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition-colors disabled:opacity-50"
                      >
                        {isL ? "Reabrir" : "Reopen"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Widget showing assigned + in-progress checklists for the current staff user
function PartialChecklistsWidget() {
  const { openChecklistDetail, setActiveSection } = useNavigation();
  const { assignedPropertyIds, isAdmin, userId, loading: permLoading } = usePermissions();
  const [assignedChecklists, setAssignedChecklists] = useState<Array<{
    id: string; title: string; icon: string; propertyId: string | null; propertyName?: string;
  }>>([]);

  useEffect(() => {
    if (permLoading || !userId) return;

    async function load() {
      // Load user profile for role + department
      const { data: profile } = await supabase
        .from("profiles")
        .select("department, level, assigned_property_ids")
        .eq("id", userId!)
        .single();

      if (!profile) return;

      // Load user role
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .single();

      const userRole = roleRow?.role ?? profile.level ?? "staff";
      const userDept = profile.department ?? "";
      const propIds: string[] = profile.assigned_property_ids ?? assignedPropertyIds;

      // Query checklist templates assigned to this user
      let q = supabase
        .from("checklist_templates")
        .select("id, title, icon, property_id")
        .neq("recurrence", "none");

      if (propIds.length > 0) {
        q = q.or(`property_id.in.(${propIds.join(",")}),is_universal.eq.true`);
      } else {
        q = q.eq("is_universal", true);
      }

      const { data: templates } = await q;
      if (!templates) return;

      // Filter by role and department match
      const relevant = templates.filter((t: any) => {
        const roleMatch = !t.assigned_role || t.assigned_role === userRole || (t.assigned_role === "staff" && ["staff", "manager", "admin", "master_admin"].includes(userRole));
        const deptMatch = !t.assigned_department || !userDept || t.assigned_department === userDept;
        return roleMatch && deptMatch;
      });

      // Enrich with property names
      const uniquePropIds = [...new Set(relevant.map((t: any) => t.property_id).filter(Boolean))] as string[];
      let propNames: Record<string, string> = {};
      if (uniquePropIds.length) {
        const { data: props } = await supabase.from("properties").select("id, name").in("id", uniquePropIds);
        (props ?? []).forEach((p: any) => { propNames[p.id] = p.name; });
      }

      setAssignedChecklists(relevant.map((t: any) => ({
        id: t.id,
        title: t.title,
        icon: t.icon,
        propertyId: t.property_id,
        propertyName: t.property_id ? propNames[t.property_id] : undefined,
      })));
    }

    load();
  }, [permLoading, userId, assignedPropertyIds]);

  if (assignedChecklists.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <ClipboardList size={12} className="text-[hsl(var(--gold))]" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">My Checklists</span>
        </div>
        <button onClick={() => setActiveSection("checklists")} className="text-[10px] text-[hsl(var(--gold))] hover:underline">View all</button>
      </div>
      <div className="space-y-1.5">
        {assignedChecklists.map(t => (
          <button
            key={t.id}
            onClick={() => openChecklistDetail(t.id, t.propertyId)}
            className="w-full flex items-center gap-2.5 bg-card border border-border rounded-xl px-3 py-2.5 hover:bg-muted/40 transition-colors"
          >
            <span className="text-sm">{t.icon}</span>
            <div className="flex-1 text-left min-w-0">
              <span className="text-xs font-medium text-foreground truncate block">{t.title}</span>
              {t.propertyName && <span className="text-[10px] text-muted-foreground">{t.propertyName}</span>}
            </div>
            <span className="text-[10px] text-[hsl(var(--gold))] font-medium flex-shrink-0">Open</span>
            <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
