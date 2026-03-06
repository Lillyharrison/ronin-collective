import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  X, MapPin, User, Calendar, Paperclip, BookOpen, Image as ImageIcon,
  ChevronDown, Check, Send, Trash2, Clock, AlertTriangle, Package,
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
  const { userId, isAdmin, isMasterAdmin } = usePermissions();
  const isL = language === "es";
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle]               = useState(task?.title_en ?? "");
  const [description, setDescription]   = useState(task?.description_en ?? "");
  const [priority, setPriority]         = useState(task?.priority ?? 2);
  const [dueDate, setDueDate]           = useState(task?.due_date ? task.due_date.slice(0, 10) : "");
  const [assignedTo, setAssignedTo]     = useState(task?.assigned_to ?? "");
  const [propertyId, setPropertyId]     = useState(task?.property_id ?? "");
  const [department, setDepartment]     = useState(task?.assigned_department ?? "");
  const [role, setRole]                 = useState(task?.assigned_role ?? "");
  const [linkedChecklist, setLinkedChecklist] = useState(task?.linked_checklist_id ?? "");
  const [isDraft, setIsDraft]           = useState(task?.is_draft ?? defaultDraft);
  const [attachments, setAttachments]   = useState<TaskAttachment[]>(task?.attachments ?? []);
  const [uploading, setUploading]       = useState(false);
  const [saving, setSaving]             = useState(false);

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
      assigned_department: department || null,
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

  const handleDelete = async () => {
    if (!task?.id || !window.confirm("Delete this task?")) return;
    await supabase.from("tasks").delete().eq("id", task.id);
    onSaved();
    onClose();
  };

  const isEditing = !!task?.id;
  const selectedProfile = profiles.find(p => p.id === assignedTo);
  const selectedProperty = properties.find(p => p.id === propertyId);
  const selectedChecklist = checklists.find(c => c.id === linkedChecklist);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-2xl border border-border shadow-2xl z-10 flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
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
              onChange={e => { setAssignedTo(e.target.value); if (e.target.value) { setDepartment(""); setRole(""); } }}
              className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground"
            >
              <option value="">{isL ? "Persona específica…" : "Specific person…"}</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? "Unknown"}{p.job_title ? ` — ${p.job_title}` : ""}</option>)}
            </select>
            {!assignedTo && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
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
