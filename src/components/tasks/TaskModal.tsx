import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { fireConfetti } from "@/lib/confetti";
import {
  X, MapPin, User, Calendar, Paperclip, BookOpen, Image as ImageIcon,
  ChevronDown, Check, Send, Trash2, Clock, AlertTriangle, Package,
  CheckSquare, MessageSquare,
} from "lucide-react";
import { format } from "date-fns";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
export interface TaskAttachment {
  url: string;
  type: "image" | "file";
  name: string;
}

export interface FullTask {
  id?: string;
  title_en: string;
  title_es?: string | null;
  description_en?: string | null;
  status: "pending" | "in_progress" | "completed" | "urgent";
  priority: number;
  due_date?: string | null;
  assigned_to?: string | null;
  property_id?: string | null;
  assigned_department?: string | null;
  assigned_role?: string | null;
  linked_checklist_id?: string | null;
  is_draft?: boolean;
  ai_suggested?: boolean;
  attachments?: TaskAttachment[];
  linked_inventory_ids?: string[];
  category?: string | null;
}

interface Profile { id: string; full_name: string | null; job_title: string | null; }
interface Property { id: string; name: string; }
interface ChecklistTemplate { id: string; title: string; icon: string; }

interface Props {
  task?: FullTask | null;
  onClose: () => void;
  onSaved: () => void;
  defaultDraft?: boolean;
}

const ROLES = ["master_admin", "admin", "manager", "staff", "principal"];
const DEPARTMENTS = ["Interior", "Exterior", "Kitchen", "Security", "Office", "All"];
const PRIORITIES = [
  { value: 1, label: "Urgent", labelEs: "Urgente", icon: <AlertTriangle size={12} />, cls: "text-status-urgent" },
  { value: 2, label: "Normal", labelEs: "Normal",  icon: <Clock size={12} />,         cls: "text-muted-foreground" },
  { value: 3, label: "Low",    labelEs: "Baja",    icon: <ChevronDown size={12} />,   cls: "text-muted-foreground/60" },
];

export function TaskModal({ task, onClose, onSaved, defaultDraft = false }: Props) {
  const { language } = useLanguage();
  const { userId, isAdmin, isMasterAdmin, isManager, department } = usePermissions();
  const isL = language === "es";
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Edit permission logic ────────────────────────────────────────────────────
  // Master admin / admin: always can edit
  // Manager: can edit if task belongs to their department (or no dept set)
  // Staff / assignee: read-only view
  const canEdit = (() => {
    if (!task?.id) return true; // new task — always edit mode
    if (isMasterAdmin || isAdmin) return true;
    if (isManager) {
      const taskDept = task?.assigned_department;
      return !taskDept || (!!department && taskDept.toLowerCase() === department.toLowerCase());
    }
    return false;
  })();

  // editMode: new tasks start in edit mode; existing tasks start in view mode
  const [editMode, setEditMode] = useState(!task?.id);

  // ── Edit state ───────────────────────────────────────────────────────────────
  const [title, setTitle]               = useState(task?.title_en ?? "");
  const [description, setDescription]   = useState(task?.description_en ?? "");
  const [priority, setPriority]         = useState(task?.priority ?? 2);
  const [dueDate, setDueDate]           = useState(task?.due_date ? task.due_date.slice(0, 10) : "");
  const [assignedTo, setAssignedTo]     = useState(task?.assigned_to ?? "");
  const [propertyId, setPropertyId]     = useState(task?.property_id ?? "");
  const [dept, setDept]                 = useState(task?.assigned_department ?? "");
  const [role, setRole]                 = useState(task?.assigned_role ?? "");
  const [linkedChecklist, setLinkedChecklist] = useState(task?.linked_checklist_id ?? "");
  const [isDraft, setIsDraft]           = useState(task?.is_draft ?? defaultDraft);
  const [attachments, setAttachments]   = useState<TaskAttachment[]>(task?.attachments ?? []);
  const [uploading, setUploading]       = useState(false);
  const [saving, setSaving]             = useState(false);

  // ── Read-only / assignee state ───────────────────────────────────────────────
  const [comment, setComment]           = useState("");
  const [completing, setCompleting]     = useState(false);
  const [completed, setCompleted]       = useState(task?.status === "completed");

  const [profiles, setProfiles]         = useState<Profile[]>([]);
  const [properties, setProperties]     = useState<Property[]>([]);
  const [checklists, setChecklists]     = useState<ChecklistTemplate[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("id, full_name, job_title").order("full_name"),
      supabase.from("properties").select("id, name").order("sort_order"),
      supabase.from("checklist_templates").select("id, title, icon").eq("is_published", true).order("sort_order"),
    ]).then(([p, pr, cl]) => {
      setProfiles((p.data as Profile[]) ?? []);
      setProperties((pr.data as Property[]) ?? []);
      setChecklists((cl.data as ChecklistTemplate[]) ?? []);
    });
  }, []);

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    const isImage = file.type.startsWith("image/");
    const ext = file.name.split(".").pop();
    const path = `task-attachments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("manuals").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("manuals").getPublicUrl(path);
      setAttachments(prev => [...prev, { url: data.publicUrl, type: isImage ? "image" : "file", name: file.name }]);
    }
    setUploading(false);
  };

  const handleSave = async (publishNow = false) => {
    if (!title.trim() || !userId) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      title_en: title.trim(),
      description_en: description.trim() || null,
      priority,
      status: task?.status ?? "pending",
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
      property_id: propertyId || null,
      assigned_department: dept || null,
      assigned_role: role || null,
      linked_checklist_id: linkedChecklist || null,
      is_draft: publishNow ? false : isDraft,
      attachments,
      linked_inventory_ids: task?.linked_inventory_ids ?? [],
      category: task?.category ?? null,
    };

    if (task?.id) {
      await supabase.from("tasks").update(payload as any).eq("id", task.id);
    } else {
      await supabase.from("tasks").insert({ ...payload, created_by: userId } as any);
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  const handleComplete = async () => {
    if (!task?.id || !userId) return;
    setCompleting(true);
    await supabase.from("tasks").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    } as any).eq("id", task.id);
    setCompleted(true);
    fireConfetti();
    setTimeout(() => {
      onSaved();
      onClose();
    }, 1800);
  };

  const handleDelete = async () => {
    if (!task?.id || !window.confirm("Delete this task?")) return;
    await supabase.from("tasks").delete().eq("id", task.id);
    onSaved();
    onClose();
  };

  const isEditing = !!task?.id;
  const selectedChecklist = checklists.find(c => c.id === linkedChecklist);
  const assigneeName = profiles.find(p => p.id === (task?.assigned_to ?? assignedTo))?.full_name ?? null;
  const propertyName = properties.find(p => p.id === (task?.property_id ?? propertyId))?.name ?? null;
  const checklistLinked = checklists.find(c => c.id === (task?.linked_checklist_id ?? linkedChecklist));
  const isOverdue = task?.due_date && new Date(task.due_date) < new Date() && task.status !== "completed";

  // ─────────────────────────────────────────────────────────────────────────────
  // READ-ONLY VIEW (all existing tasks — staff see only this; admins/managers
  // get an "Edit" button to switch into the full edit form)
  // ─────────────────────────────────────────────────────────────────────────────
  if (isEditing && !editMode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full sm:max-w-lg bg-card rounded-2xl border border-border shadow-2xl z-10 flex flex-col" style={{maxHeight: "min(90dvh, 640px)"}}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              {task.ai_suggested && (
                <span className="text-[10px] font-bold bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))] border border-[hsl(var(--gold)/0.3)] px-2 py-0.5 rounded-full">
                  ✦ RONIN
                </span>
              )}
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                task.status === "urgent" ? "bg-[hsl(var(--status-urgent)/0.12)] text-status-urgent border-status-urgent/30" :
                task.status === "completed" ? "bg-[hsl(var(--status-done)/0.12)] text-status-done border-[hsl(var(--status-done)/0.3)]" :
                task.status === "in_progress" ? "bg-accent/10 text-accent border-accent/30" :
                "bg-muted text-muted-foreground border-border"
              )}>
                {task.status === "urgent" ? (isL ? "URGENTE" : "URGENT") :
                 task.status === "completed" ? (isL ? "COMPLETADO" : "COMPLETED") :
                 task.status === "in_progress" ? (isL ? "EN PROGRESO" : "IN PROGRESS") :
                 (isL ? "PENDIENTE" : "PENDING")}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Title */}
            <h2 className="font-display text-lg font-semibold text-foreground leading-snug">{task.title_en}</h2>

            {/* Description */}
            {task.description_en && (
              <p className="text-sm text-muted-foreground leading-relaxed">{task.description_en}</p>
            )}

            {/* Meta pills */}
            <div className="flex flex-wrap gap-2">
              {task.due_date && (
                <span className={cn("flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border",
                  isOverdue ? "bg-[hsl(var(--status-urgent)/0.1)] text-status-urgent border-status-urgent/30"
                            : "bg-muted text-muted-foreground border-border")}>
                  <Clock size={10} />
                  {new Date(task.due_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              )}
              {propertyName && (
                <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-muted text-muted-foreground border-border">
                  <MapPin size={10} /> {propertyName}
                </span>
              )}
              {assigneeName && (
                <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-muted text-muted-foreground border-border">
                  <User size={10} /> {assigneeName}
                </span>
              )}
              {checklistLinked && (
                <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-[hsl(var(--gold)/0.1)] text-[hsl(var(--gold))] border-[hsl(var(--gold)/0.3)]">
                  <BookOpen size={10} /> {checklistLinked.icon} {checklistLinked.title}
                </span>
              )}
            </div>

            {/* Attachments (view only) */}
            {(task.attachments ?? []).length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                  {isL ? "Adjuntos" : "Attachments"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(task.attachments as TaskAttachment[]).map((a, i) => (
                    a.type === "image"
                      ? <img key={i} src={a.url} className="w-16 h-16 rounded-xl object-cover border border-border" />
                      : <a key={i} href={a.url} target="_blank" rel="noreferrer"
                          className="w-16 h-16 rounded-xl border border-border bg-muted flex flex-col items-center justify-center gap-1">
                          <Paperclip size={16} className="text-muted-foreground" />
                          <span className="text-[8px] text-muted-foreground truncate w-12 text-center">{a.name}</span>
                        </a>
                  ))}
                </div>
              </div>
            )}

            {/* Comment box */}
            {!completed && task.status !== "completed" && (
              <div>
                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <MessageSquare size={10} /> {isL ? "Comentario / Actualización" : "Comment / Update"}
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={isL ? "Añade una nota o actualización…" : "Add a note or update…"}
                  rows={3}
                  className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground resize-none"
                />
              </div>
            )}

            {/* Completed state */}
            {(completed || task.status === "completed") && (
              <div className="flex items-center gap-2 px-3 py-3 bg-[hsl(var(--status-done)/0.1)] border border-[hsl(var(--status-done)/0.3)] rounded-xl">
                <CheckSquare size={16} className="text-status-done flex-shrink-0" />
                <p className="text-sm font-medium text-status-done">
                  {isL ? "¡Tarea completada!" : "Task completed!"}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-4 flex gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {isL ? "Cerrar" : "Close"}
            </button>
            {canEdit && (
              <button
                onClick={() => setEditMode(true)}
                className="flex-shrink-0 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                ✏️ {isL ? "Editar" : "Edit"}
              </button>
            )}
            {task.status !== "completed" && !completed && (
              <button
                onClick={handleComplete}
                disabled={completing}
                className="flex-1 py-2.5 rounded-xl bg-[hsl(var(--status-done))] text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 transition-all active:scale-95"
              >
                <CheckSquare size={14} />
                {completing ? "🎉" : (isL ? "Marcar Completado" : "Mark Complete")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT VIEW (admin / manager / new task)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg bg-card rounded-2xl border border-border shadow-2xl z-10 flex flex-col" style={{maxHeight: "min(90dvh, 700px)"}}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                onClick={() => setEditMode(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground text-xs flex items-center gap-1"
                title="Back to view"
              >
                ← {isL ? "Ver" : "View"}
              </button>
            )}
            {task?.ai_suggested && (
              <span className="text-[10px] font-bold bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))] border border-[hsl(var(--gold)/0.3)] px-2 py-0.5 rounded-full">
                ✦ RONIN
              </span>
            )}
            {isDraft && (
              <span className="text-[10px] font-bold bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                DRAFT
              </span>
            )}
            <h2 className="font-display text-base font-semibold text-foreground">
              {isEditing ? (isL ? "Editar Tarea" : "Edit Task") : (isL ? "Nueva Tarea" : "New Task")}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Title */}
          <div>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={isL ? "Título de la tarea…" : "Task title…"}
              className="w-full text-sm font-medium bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Description */}
          <div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={isL ? "Descripción / instrucciones…" : "Description / instructions…"}
              rows={3}
              className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>

          {/* Priority + Due Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">
                {isL ? "Prioridad" : "Priority"}
              </label>
              <div className="flex gap-1">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border text-[10px] font-medium transition-all",
                      priority === p.value
                        ? p.value === 1
                          ? "bg-[hsl(var(--status-urgent)/0.15)] border-status-urgent/40 text-status-urgent"
                          : "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted border-border text-muted-foreground hover:border-border/80"
                    )}
                  >
                    {p.icon}
                    {isL ? p.labelEs : p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">
                {isL ? "Vence" : "Due Date"}
              </label>
              <div className="relative">
                <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full text-xs bg-muted border border-border rounded-xl pl-8 pr-3 py-2.5 outline-none focus:border-primary text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Assign to property */}
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <MapPin size={10} /> {isL ? "Propiedad" : "Property"}
            </label>
            <select
              value={propertyId}
              onChange={e => setPropertyId(e.target.value)}
              className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground"
            >
              <option value="">{isL ? "Sin propiedad específica" : "No specific property"}</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Assign to person, department, or role */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
              <User size={10} /> {isL ? "Asignar a" : "Assign to"}
            </label>
            <select
              value={assignedTo}
              onChange={e => { setAssignedTo(e.target.value); if (e.target.value) { setDept(""); setRole(""); } }}
              className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground"
            >
              <option value="">{isL ? "Persona específica…" : "Specific person…"}</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? "Unknown"}{p.job_title ? ` — ${p.job_title}` : ""}</option>)}
            </select>
            {!assignedTo && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={dept}
                  onChange={e => setDept(e.target.value)}
                  className="text-sm bg-muted border border-border rounded-xl px-3 py-2 outline-none focus:border-primary text-foreground"
                >
                  <option value="">{isL ? "Departamento…" : "Department…"}</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="text-sm bg-muted border border-border rounded-xl px-3 py-2 outline-none focus:border-primary text-foreground"
                >
                  <option value="">{isL ? "Rol…" : "Role…"}</option>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Link checklist */}
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <BookOpen size={10} /> {isL ? "Lista vinculada" : "Linked Checklist"}
            </label>
            <select
              value={linkedChecklist}
              onChange={e => setLinkedChecklist(e.target.value)}
              className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground"
            >
              <option value="">{isL ? "Sin lista vinculada" : "No checklist linked"}</option>
              {checklists.map(c => <option key={c.id} value={c.id}>{c.icon} {c.title}</option>)}
            </select>
            {selectedChecklist && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[hsl(var(--gold))]">
                <BookOpen size={10} /> Linked: {selectedChecklist.icon} {selectedChecklist.title}
              </div>
            )}
          </div>

          {/* Inventory placeholder */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/50 border border-dashed border-border rounded-xl">
            <Package size={14} className="text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              {isL ? "Inventario vinculado — próximamente" : "Linked inventory items — coming soon"}
            </p>
          </div>

          {/* Attachments */}
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Paperclip size={10} /> {isL ? "Adjuntos" : "Attachments"}
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative group">
                  {a.type === "image" ? (
                    <img src={a.url} className="w-16 h-16 rounded-xl object-cover border border-border" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl border border-border bg-muted flex flex-col items-center justify-center gap-1">
                      <Paperclip size={16} className="text-muted-foreground" />
                      <span className="text-[8px] text-muted-foreground truncate w-12 text-center">{a.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-16 h-16 rounded-xl border border-dashed border-border bg-muted flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors"
              >
                <ImageIcon size={16} className="text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground">{uploading ? "…" : isL ? "Añadir" : "Add"}</span>
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
          </div>

          {/* Draft toggle — admin only */}
          {(isAdmin || isMasterAdmin) && (
            <div className="flex items-center justify-between px-3 py-2.5 bg-muted/50 border border-border rounded-xl">
              <div>
                <p className="text-xs font-medium text-foreground">{isL ? "Guardar como borrador" : "Save as draft"}</p>
                <p className="text-[10px] text-muted-foreground">{isL ? "No visible para el equipo hasta publicar" : "Not visible to staff until published"}</p>
              </div>
              <button
                onClick={() => setIsDraft(v => !v)}
                className={cn(
                  "w-10 h-6 rounded-full border transition-all relative",
                  isDraft ? "bg-[hsl(var(--gold)/0.2)] border-[hsl(var(--gold)/0.5)]" : "bg-muted border-border"
                )}
              >
                <div className={cn("w-4 h-4 rounded-full absolute top-0.5 transition-all", isDraft ? "right-0.5 bg-[hsl(var(--gold))]" : "left-0.5 bg-muted-foreground")} />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 flex gap-2 flex-shrink-0">
          {isEditing && (isAdmin || isMasterAdmin) && (
            <button
              onClick={handleDelete}
              className="p-2.5 rounded-xl border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            {isL ? "Cancelar" : "Cancel"}
          </button>
          {isDraft && (
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !title.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[hsl(var(--status-done)/0.15)] border border-[hsl(var(--status-done)/0.3)] text-status-done text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors hover:bg-[hsl(var(--status-done)/0.25)]"
            >
              <Send size={13} /> {isL ? "Publicar" : "Publish"}
            </button>
          )}
          <button
            onClick={() => handleSave(false)}
            disabled={saving || !title.trim()}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            <Check size={13} /> {saving ? "…" : isDraft ? (isL ? "Guardar borrador" : "Save Draft") : (isL ? "Guardar" : "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
