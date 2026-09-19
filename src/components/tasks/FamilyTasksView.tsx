import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { filterAssignableStaff } from "@/lib/assignableStaff";
import { notifyUsers } from "@/lib/notifySection";
import { cn } from "@/lib/utils";
import { Send, User, MapPin, Clock, X } from "lucide-react";
import { toast } from "sonner";

interface SimpleTask {
  id: string;
  title_en: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  property_id: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, { en: string; es: string; cls: string }> = {
  pending:     { en: "Pending",     es: "Pendiente",   cls: "bg-muted text-muted-foreground" },
  in_progress: { en: "In progress", es: "En progreso", cls: "bg-accent/10 text-accent" },
  completed:   { en: "Completed",   es: "Completado",  cls: "bg-[hsl(var(--status-done)/0.12)] text-status-done" },
  urgent:      { en: "Urgent",      es: "Urgente",     cls: "bg-[hsl(var(--status-urgent)/0.12)] text-status-urgent" },
};

export function FamilyTasksView() {
  const { userId } = usePermissions();
  const { language } = useLanguage();
  const isL = language === "es";
  const { pendingTaskIdRef, setPendingTaskId } = useNavigation();

  const [staff, setStaff] = useState<{ id: string; full_name: string | null }[]>([]);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [tasks, setTasks] = useState<SimpleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [assignedTo, setAssignedTo] = useState("");
  const [what, setWhat] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Edit modal state
  const [editingTask, setEditingTask] = useState<SimpleTask | null>(null);
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editWhat, setEditWhat] = useState("");
  const [editPropertyId, setEditPropertyId] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (t: SimpleTask) => {
    setEditingTask(t);
    setEditAssignedTo(t.assigned_to ?? "");
    setEditWhat(t.title_en);
    setEditPropertyId(t.property_id ?? "");
    setEditDueDate(t.due_date ? t.due_date.slice(0, 10) : "");
  };

  const closeEdit = () => setEditingTask(null);

  const saveEdit = async () => {
    if (!editingTask) return;
    if (!editWhat.trim()) { toast.error(isL ? "Escribe la tarea" : "Please describe the task"); return; }
    if (!editAssignedTo) { toast.error(isL ? "Elige a quién enviar" : "Please choose who to send it to"); return; }
    setEditSaving(true);
    const { data, error } = await supabase.from("tasks").update({
      title_en: editWhat.trim(),
      assigned_to: editAssignedTo,
      property_id: editPropertyId || null,
      due_date: editDueDate || null,
    } as any).eq("id", editingTask.id).select();
    setEditSaving(false);
    if (error || !data || data.length === 0) {
      toast.error(isL ? "No se pudo guardar" : "Could not save changes");
      return;
    }
    if (editAssignedTo !== editingTask.assigned_to && editAssignedTo !== userId) {
      notifyUsers([editAssignedTo], {
        title: `📋 You've been assigned a task: ${editWhat.trim()}`,
        body: editPropertyId ? `Property: ${properties.find(p => p.id === editPropertyId)?.name ?? ""}` : undefined,
        type: "info",
        action_url: "tasks",
        entity_id: editingTask.id,
        entity_type: "task",
        property_id: editPropertyId || undefined,
      }, userId);
    }
    toast.success(isL ? "Cambios guardados" : "Changes saved");
    closeEdit();
    loadTasks();
  };

  const deleteEdit = async () => {
    if (!editingTask) return;
    if (!window.confirm(isL ? "¿Eliminar esta tarea? Esto no se puede deshacer." : "Delete this task? This can't be undone.")) return;
    setEditSaving(true);
    await supabase.from("notifications").delete().eq("entity_id", editingTask.id).eq("entity_type", "task");
    const { data, error } = await supabase.from("tasks").delete().eq("id", editingTask.id).select();
    setEditSaving(false);
    if (error || !data || data.length === 0) {
      toast.error(isL ? "No se pudo eliminar" : "Could not delete the task");
      return;
    }
    toast.success(isL ? "Tarea eliminada" : "Task deleted");
    closeEdit();
    loadTasks();
  };

  const loadTasks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("id, title_en, status, due_date, assigned_to, property_id, created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setTasks((data as SimpleTask[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    (async () => {
      const [{ data: profiles }, { data: props }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, level").order("full_name"),
        supabase.from("properties").select("id, name").order("sort_order").limit(50),
      ]);
      setStaff(filterAssignableStaff((profiles ?? []) as { id: string; full_name: string | null; level?: string | null }[]));
      setProperties((props ?? []) as { id: string; name: string }[]);
    })();
    loadTasks();
  }, [loadTasks]);

  // Consume notification deep-link: highlight the task
  useEffect(() => {
    const pending = pendingTaskIdRef.current;
    if (!pending || loading) return;
    setHighlightId(pending);
    setPendingTaskId(null);
    const el = document.getElementById(`fam-task-${pending}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, pendingTaskIdRef, setPendingTaskId]);

  const nameOf = (id: string | null) =>
    staff.find(s => s.id === id)?.full_name ?? (isL ? "Sin asignar" : "Unassigned");

  const submit = async () => {
    if (!what.trim()) { toast.error(isL ? "Escribe la tarea" : "Please describe the task"); return; }
    if (!assignedTo) { toast.error(isL ? "Elige a quién enviar" : "Please choose who to send it to"); return; }
    setSaving(true);
    const { data: inserted, error } = await supabase.from("tasks").insert({
      title_en: what.trim(),
      status: "pending",
      priority: 2,
      is_draft: false,
      category: "general",
      assigned_to: assignedTo,
      property_id: propertyId || null,
      due_date: dueDate || null,
      created_by: userId,
    } as any).select("id").single();
    setSaving(false);
    if (error) {
      toast.error(isL ? "No se pudo enviar" : "Could not send the task");
      return;
    }
    const newTaskId = (inserted as { id: string } | null)?.id;
    if (newTaskId) {
      if (assignedTo !== userId) {
        notifyUsers([assignedTo], {
          title: `📋 You've been assigned a task: ${what.trim()}`,
          body: propertyId ? `Property: ${properties.find(p => p.id === propertyId)?.name ?? ""}` : undefined,
          type: "info",
          action_url: "tasks",
          entity_id: newTaskId,
          entity_type: "task",
          property_id: propertyId || undefined,
        }, userId);
      }
    }
    toast.success(isL ? "Tarea enviada" : "Task sent");
    setWhat(""); setDueDate(""); setPropertyId("");
    loadTasks();
  };

  const inputCls = "w-full text-base bg-card border border-border rounded-xl px-3 py-3 text-foreground focus:outline-none focus:border-[hsl(var(--gold)/0.5)]";

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Send a task */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">
          {isL ? "Enviar una tarea" : "Send a task"}
        </p>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{isL ? "Para" : "To"}</label>
          <select className={inputCls} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
            <option value="">{isL ? "Elegir persona" : "Choose a person"}</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name ?? "—"}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{isL ? "Qué" : "What"}</label>
          <input
            className={inputCls}
            value={what}
            onChange={e => setWhat(e.target.value)}
            placeholder={isL ? "Ej. Limpiar la terraza" : "e.g. Clean the terrace"}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{isL ? "Propiedad" : "Property"}</label>
            <select className={inputCls} value={propertyId} onChange={e => setPropertyId(e.target.value)}>
              <option value="">{isL ? "Opcional" : "Optional"}</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{isL ? "Fecha límite" : "Due date"}</label>
            <input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-[hsl(var(--gold))] text-charcoal text-sm font-semibold px-4 py-3 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          <Send size={15} /> {saving ? (isL ? "Enviando…" : "Sending…") : (isL ? "Enviar tarea" : "Send task")}
        </button>
      </div>

      {/* Sent tasks */}
      <div>
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
          {isL ? "Tareas enviadas" : "Tasks you've sent"}
        </p>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-6 text-center">
            {isL ? "Aún no has enviado tareas" : "You haven't sent any tasks yet"}
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => {
              const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.pending;
              return (
                <div
                  key={t.id}
                  id={`fam-task-${t.id}`}
                  onClick={() => openEdit(t)}
                  className={cn(
                    "bg-card border rounded-xl p-3 cursor-pointer active:scale-[0.99] transition-transform",
                    highlightId === t.id ? "border-[hsl(var(--gold))] ring-1 ring-[hsl(var(--gold)/0.4)]" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground leading-snug">{t.title_en}</p>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", st.cls)}>
                      {isL ? st.es : st.en}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <User size={10} /> {nameOf(t.assigned_to)}
                    </span>
                    {t.property_id && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin size={10} /> {properties.find(p => p.id === t.property_id)?.name ?? ""}
                      </span>
                    )}
                    {t.due_date && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock size={10} />
                        {new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit / delete sent task */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeEdit} />
          <div className="relative w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl z-10 flex flex-col h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <p className="text-sm font-semibold text-foreground">{isL ? "Editar tarea" : "Edit task"}</p>
              <button
                onClick={closeEdit}
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={isL ? "Cerrar" : "Close"}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{isL ? "Para" : "To"}</label>
                <select className={inputCls} value={editAssignedTo} onChange={e => setEditAssignedTo(e.target.value)}>
                  <option value="">{isL ? "Elegir persona" : "Choose a person"}</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.full_name ?? "—"}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{isL ? "Qué" : "What"}</label>
                <input className={inputCls} value={editWhat} onChange={e => setEditWhat(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{isL ? "Propiedad" : "Property"}</label>
                  <select className={inputCls} value={editPropertyId} onChange={e => setEditPropertyId(e.target.value)}>
                    <option value="">{isL ? "Opcional" : "Optional"}</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{isL ? "Fecha límite" : "Due date"}</label>
                  <input type="date" className={inputCls} value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-border flex items-center gap-2">
              <button
                onClick={deleteEdit}
                disabled={editSaving}
                className="min-h-[44px] px-4 rounded-xl border border-[hsl(var(--status-urgent)/0.4)] text-status-urgent text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {isL ? "Eliminar" : "Delete"}
              </button>
              <div className="flex-1" />
              <button
                onClick={closeEdit}
                className="min-h-[44px] px-4 rounded-xl border border-border text-muted-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
              >
                {isL ? "Cancelar" : "Cancel"}
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="min-h-[44px] px-5 bg-[hsl(var(--gold))] text-charcoal text-sm font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {editSaving ? (isL ? "Guardando…" : "Saving…") : (isL ? "Guardar" : "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
