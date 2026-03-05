import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChecklistItems, ChecklistItem } from "@/hooks/useChecklists";
import { cn } from "@/lib/utils";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, Printer, Eye, EyeOff, Plus, Pencil, Trash2,
  GripVertical, Image as ImageIcon, X, Settings, Users,
  Check, BookOpen,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────── */
interface CareGuideTemplate {
  id: string;
  title: string;
  icon: string;
  color: string;
  is_published: boolean;
  cover_image_url: string | null;
  assigned_role: string | null;
  assigned_department: string | null;
}

interface Props {
  template: CareGuideTemplate;
  onBack: () => void;
  onTemplateUpdate?: (t: CareGuideTemplate) => void;
}

/* ─── Constants ─────────────────────────────────────────────── */
const ICON_BANK = [
  "🪨","🪵","✨","⬜","🧴","🧽","💧","⛔","🔄","📅","💎","🌿","☀️","🔒","⚡","☕","🛡️","🎨","✅","⚠️","🔧","📸","🌡️","🧊","🫧",
  "🪥","🧻","🪣","🧹","🛁","🚿","🏡","🪞","🛏️","🔑","🗝️","🪟","🚪","🌊","🍃","🌺","🌸","🔍","📋","📌","💡","🕯️","🎭","🖼️",
  "🏺","⚗️","🔬","🧪","🌙","⭐","🎯","🏷️","🎀","📦","🛒","🔐","🛠️","⚙️","🔩","🪛","🔨","🪚","🏗️","🧲","⚖️","🪤","🗄️",
];

const ROLES = ["master_admin","admin","manager","staff","principal"];
const DEPARTMENTS = ["Interior","Exterior","Kitchen","Security","Office","All"];

const COLOR_MAP: Record<string, { border: string; bg: string; text: string }> = {
  gold:   { border: "border-[hsl(var(--gold)/0.5)]",   bg: "bg-[hsl(var(--gold)/0.1)]",   text: "text-[hsl(var(--gold))]" },
  amber:  { border: "border-amber-400/50",              bg: "bg-amber-400/10",              text: "text-amber-400" },
  blue:   { border: "border-blue-400/50",               bg: "bg-blue-400/10",               text: "text-blue-400" },
  purple: { border: "border-purple-400/50",             bg: "bg-purple-400/10",             text: "text-purple-400" },
  green:  { border: "border-[hsl(var(--status-done)/0.5)]", bg: "bg-[hsl(var(--status-done)/0.1)]", text: "text-[hsl(var(--status-done))]" },
};

/* ─── Sortable item wrapper ─────────────────────────────────── */
function SortableGuideItem({
  item, isAdmin, onUpdate, onDelete, onPhotoDrop,
}: {
  item: ChecklistItem;
  isAdmin: boolean;
  onUpdate: (id: string, changes: Partial<ChecklistItem>) => void;
  onDelete: (id: string) => void;
  onPhotoDrop: (id: string, file: File) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !isAdmin });

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editIcon, setEditIcon] = useState(item.icon);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    const changes: Partial<ChecklistItem> = {};
    if (editTitle.trim() && editTitle !== item.title) changes.title = editTitle.trim();
    if (editIcon !== item.icon) changes.icon = editIcon;
    if (Object.keys(changes).length) onUpdate(item.id, changes);
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="group relative"
      onDragOver={isAdmin ? e => e.preventDefault() : undefined}
      onDrop={isAdmin ? e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) onPhotoDrop(item.id, f); } : undefined}
    >
      {/* Dotted rule above */}
      <div className="border-t border-dashed border-border/50 mx-4" />

      <div className="flex items-start gap-3 px-4 py-3">
        {/* Drag handle */}
        {isAdmin && (
          <button
            {...attributes} {...listeners}
            className="mt-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/30 hover:text-muted-foreground transition-colors"
          >
            <GripVertical size={14} />
          </button>
        )}

        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {editing ? (
            <div className="relative">
              <button
                onClick={() => setShowIconPicker(v => !v)}
                className="text-xl w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-primary transition-colors"
              >
                {editIcon}
              </button>
              {showIconPicker && (
                <div className="absolute top-9 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-5 gap-1 shadow-xl w-48 max-h-52 overflow-y-auto">
                  {ICON_BANK.map(ic => (
                    <button key={ic} onClick={() => { setEditIcon(ic); setShowIconPicker(false); }}
                      className={cn("text-lg p-1.5 rounded-lg hover:bg-muted transition-colors", editIcon === ic && "bg-muted ring-1 ring-primary")}
                    >{ic}</button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xl leading-none">{item.icon}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={save}
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
              className="w-full text-sm bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary"
            />
          ) : (
            <p className="text-sm text-foreground leading-relaxed font-light tracking-wide">{item.title}</p>
          )}

          {item.photo_url && (
            <div className="mt-2 relative group/img">
              <img src={item.photo_url} alt="" className="h-28 w-full object-cover rounded-xl border border-border cursor-pointer" onClick={() => window.open(item.photo_url!, "_blank")} />
              {isAdmin && (
                <button
                  onClick={() => onUpdate(item.id, { photo_url: null })}
                  className="absolute top-1.5 right-1.5 bg-card/80 rounded-full p-1 opacity-0 group-hover/img:opacity-100 transition-opacity"
                >
                  <X size={12} className="text-muted-foreground" />
                </button>
              )}
            </div>
          )}
          {isAdmin && !item.photo_url && (
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-1 text-[10px] text-muted-foreground/40 italic hover:text-muted-foreground transition-colors"
            >
              + drop or click to add reference image
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoDrop(item.id, f); }} />
        </div>

        {/* Admin actions */}
        {isAdmin && !editing && (
          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => { setEditing(true); setEditTitle(item.title); setEditIcon(item.icon); }}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><Pencil size={12} /></button>
            <button onClick={() => onDelete(item.id)}
              className="p-1.5 rounded-lg hover:bg-muted text-[hsl(var(--status-urgent))] transition-colors"><Trash2 size={12} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────── */
export function CareGuideDetailPage({ template: initialTemplate, onBack, onTemplateUpdate }: Props) {
  const { isAdmin, isMasterAdmin } = usePermissions();
  const { language } = useLanguage();
  const [template, setTemplate] = useState(initialTemplate);
  const { items, loading, setItems } = useChecklistItems(template.id);

  // ── UI state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIcon, setNewIcon] = useState("▸");
  const [showNewIconPicker, setShowNewIconPicker] = useState(false);

  // ── Title / icon editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(template.title);
  const [showIconPicker, setShowIconPicker] = useState(false);

  // ── Back image (for print)
  const [backImageUrl, setBackImageUrl] = useState<string | null>(template.cover_image_url);
  const [backUploading, setBackUploading] = useState(false);
  const backImgRef = useRef<HTMLInputElement>(null);

  // ── Admin settings
  const [assignedRole, setAssignedRole] = useState(template.assigned_role ?? "");
  const [assignedDepartment, setAssignedDepartment] = useState(template.assigned_department ?? "");
  const [savingSettings, setSavingSettings] = useState(false);

  const updateTemplate = (changes: Partial<CareGuideTemplate>) => {
    const updated = { ...template, ...changes };
    setTemplate(updated);
    onTemplateUpdate?.(updated);
  };

  // ── DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, sort_order: idx }));
    setItems(reordered);
    await Promise.all(reordered.map(item =>
      supabase.from("checklist_items").update({ sort_order: item.sort_order }).eq("id", item.id)
    ));
  };

  // ── Item CRUD
  const handleUpdate = async (id: string, changes: Partial<ChecklistItem>) => {
    await supabase.from("checklist_items").update(changes).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("checklist_items").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handlePhotoDrop = async (itemId: string, file: File) => {
    const path = `care-guides/${itemId}-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("manuals").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("manuals").getPublicUrl(path);
      await handleUpdate(itemId, { photo_url: data.publicUrl });
    }
  };

  const addItem = async () => {
    if (!newTitle.trim()) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
    const { data } = await supabase.from("checklist_items").insert({
      template_id: template.id,
      title: newTitle.trim(),
      icon: newIcon,
      color: "default",
      sort_order: maxOrder,
    }).select().single();
    if (data) setItems(prev => [...prev, data as ChecklistItem]);
    setNewTitle(""); setNewIcon("▸"); setAddingItem(false);
  };

  // ── Title save
  const saveTitle = async () => {
    if (!titleDraft.trim()) { setEditingTitle(false); return; }
    await supabase.from("checklist_templates").update({ title: titleDraft.trim() }).eq("id", template.id);
    updateTemplate({ title: titleDraft.trim() });
    setEditingTitle(false);
  };

  // ── Icon save
  const saveIcon = async (icon: string) => {
    await supabase.from("checklist_templates").update({ icon }).eq("id", template.id);
    updateTemplate({ icon });
    setShowIconPicker(false);
  };

  // ── Publish toggle
  const togglePublish = async () => {
    await supabase.from("checklist_templates").update({ is_published: !template.is_published }).eq("id", template.id);
    updateTemplate({ is_published: !template.is_published });
  };

  // ── Back image upload
  const handleBackImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setBackUploading(true);
    const path = `care-guide-backs/${template.id}-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("manuals").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("manuals").getPublicUrl(path);
      await supabase.from("checklist_templates").update({ cover_image_url: data.publicUrl }).eq("id", template.id);
      setBackImageUrl(data.publicUrl);
      updateTemplate({ cover_image_url: data.publicUrl });
    }
    setBackUploading(false);
  };

  // ── Save admin settings
  const saveSettings = async () => {
    setSavingSettings(true);
    await supabase.from("checklist_templates").update({
      assigned_role: assignedRole || null,
      assigned_department: assignedDepartment || null,
    }).eq("id", template.id);
    updateTemplate({ assigned_role: assignedRole || null, assigned_department: assignedDepartment || null });
    setSavingSettings(false);
  };

  // ── Print (2-sided PDF via browser print)
  const handlePrint = () => {
    const printContent = document.getElementById("care-guide-print-area");
    if (!printContent) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${template.title} — Care Guide</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; background: white; color: #1a1a1a; }

          @page {
            size: A5 landscape;
            margin: 10mm;
          }

          .page {
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            page-break-after: always;
          }
          .page:last-child { page-break-after: auto; }

          /* FRONT PAGE */
          .front { padding: 16px 20px; }
          .front-header {
            display: flex; align-items: center; gap: 12px;
            padding-bottom: 10px;
            border-bottom: 2px solid #1a1a1a;
            margin-bottom: 14px;
          }
          .front-header .guide-icon { font-size: 28px; }
          .front-header h1 {
            font-size: 20px; font-weight: 700; letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .front-header .draft-badge {
            margin-left: auto;
            font-size: 9px; font-weight: 700;
            border: 1px solid #999;
            padding: 2px 6px; border-radius: 4px;
            color: #999; letter-spacing: 0.08em;
          }

          .items-list { list-style: none; }
          .item-row {
            display: flex; align-items: flex-start; gap: 10px;
            padding: 7px 0;
            border-bottom: 1px dashed #e0e0e0;
          }
          .item-row:last-child { border-bottom: none; }
          .item-icon { font-size: 17px; flex-shrink: 0; margin-top: 1px; }
          .item-text { font-size: 12px; line-height: 1.5; font-weight: 300; letter-spacing: 0.02em; }
          .item-photo {
            margin-top: 5px;
            width: 100%;
            max-height: 70px;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
          }

          .front-footer {
            margin-top: auto;
            padding-top: 10px;
            border-top: 1px solid #e0e0e0;
            font-size: 9px;
            color: #999;
            letter-spacing: 0.05em;
            text-transform: uppercase;
          }

          /* BACK PAGE */
          .back {
            position: relative;
            overflow: hidden;
          }
          .back-img {
            width: 100%; height: 100%;
            object-fit: cover;
          }
          .back-overlay {
            position: absolute; bottom: 0; left: 0; right: 0;
            background: linear-gradient(transparent, rgba(0,0,0,0.6));
            padding: 20px;
          }
          .back-overlay .back-label {
            color: white; font-size: 18px; font-weight: 700;
            letter-spacing: 0.06em; text-transform: uppercase;
          }
          .back-no-image {
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 10px; color: #ccc;
          }
          .back-no-image .back-icon { font-size: 60px; }
          .back-no-image .back-title {
            font-size: 22px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.08em; color: #888;
          }
        </style>
      </head>
      <body>
        <!-- FRONT -->
        <div class="page front">
          <div class="front-header">
            <span class="guide-icon">${template.icon}</span>
            <h1>${template.title}</h1>
            ${!template.is_published ? '<span class="draft-badge">DRAFT</span>' : ""}
          </div>
          <ul class="items-list">
            ${items.map(item => `
              <li class="item-row">
                <span class="item-icon">${item.icon}</span>
                <div>
                  <span class="item-text">${item.title}</span>
                  ${item.photo_url ? `<img src="${item.photo_url}" class="item-photo" />` : ""}
                </div>
              </li>
            `).join("")}
          </ul>
          <div class="front-footer">Estate Care Guide · ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long" })}</div>
        </div>

        <!-- BACK -->
        <div class="page back">
          ${backImageUrl
            ? `<img src="${backImageUrl}" class="back-img" />
               <div class="back-overlay"><span class="back-label">${template.title}</span></div>`
            : `<div class="back-no-image">
                 <span class="back-icon">${template.icon}</span>
                 <span class="back-title">${template.title}</span>
               </div>`
          }
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 600);
  };

  const colorSet = COLOR_MAP[template.color] ?? COLOR_MAP.gold;
  const isDraft = !template.is_published;

  return (
    <div className="animate-fade-in flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-charcoal border-b border-charcoal-light px-4 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors text-cream/60 hover:text-cream">
            <ArrowLeft size={18} />
          </button>
          <p className="text-xs text-cream/40 uppercase tracking-widest">
            {language === "es" ? "Guías de Cuidado" : "Care Guides"}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {isMasterAdmin && (
              <button
                onClick={() => setShowAdminPanel(v => !v)}
                className={cn(
                  "p-1.5 rounded-xl border transition-all",
                  showAdminPanel
                    ? "border-[hsl(var(--gold)/0.5)] text-[hsl(var(--gold))] bg-[hsl(var(--gold)/0.1)]"
                    : "border-white/20 text-cream/50 hover:text-cream"
                )}
              >
                <Settings size={15} />
              </button>
            )}
            <button
              onClick={handlePrint}
              className="p-1.5 rounded-xl border border-white/20 text-cream/50 hover:text-cream hover:border-white/40 transition-all"
              title="Print 2-sided card"
            >
              <Printer size={15} />
            </button>
          </div>
        </div>

        {/* Title row */}
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="relative">
            <button
              onClick={() => isMasterAdmin && setShowIconPicker(v => !v)}
              className={cn(
                "w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-2xl flex-shrink-0 transition-all",
                colorSet.border, colorSet.bg,
                isMasterAdmin && "cursor-pointer hover:scale-105"
              )}
            >
              {template.icon}
            </button>
            {showIconPicker && (
              <div className="absolute top-14 left-0 z-50 bg-card border border-border rounded-2xl p-3 grid grid-cols-6 gap-1.5 shadow-2xl w-64 max-h-56 overflow-y-auto">
                <p className="col-span-6 text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wider">Choose icon</p>
                {ICON_BANK.map(ic => (
                  <button key={ic} onClick={() => saveIcon(ic)}
                    className={cn("text-xl p-1.5 rounded-xl hover:bg-muted transition-colors", template.icon === ic && "bg-muted ring-1 ring-primary")}
                  >{ic}</button>
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            {editingTitle && isMasterAdmin ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                className="w-full font-display text-2xl text-cream bg-transparent border-b border-cream/30 outline-none pb-0.5"
              />
            ) : (
              <h1
                className={cn("font-display text-2xl leading-tight cursor-default", isDraft ? "text-cream/40" : "text-cream")}
                onClick={() => isMasterAdmin && setEditingTitle(true)}
              >
                {template.title}
                {isMasterAdmin && <Pencil size={12} className="inline ml-2 text-cream/30 hover:text-cream/60 transition-colors" />}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("text-xs font-medium", colorSet.text)}>
                <BookOpen size={10} className="inline mr-1" />
                {language === "es" ? "Guía de cuidado" : "Care guide"}
              </span>
              {isDraft && (
                <span className="text-[9px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full border border-border">
                  DRAFT
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Admin Panel ─────────────────────────────────────────── */}
      {showAdminPanel && isMasterAdmin && (
        <div className="bg-card border-b border-border px-4 py-4 space-y-4 flex-shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Admin Settings</p>

          {/* Published toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Status</p>
              <p className="text-xs text-muted-foreground">{isDraft ? "Draft — only visible to Master Admin" : "Published — visible to assigned users"}</p>
            </div>
            <button
              onClick={togglePublish}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                isDraft
                  ? "border-muted-foreground/20 text-muted-foreground hover:border-[hsl(var(--gold))] hover:text-[hsl(var(--gold))]"
                  : "border-[hsl(var(--status-done)/0.4)] text-[hsl(var(--status-done))] bg-[hsl(var(--status-done)/0.08)]"
              )}
            >
              {isDraft ? <><Eye size={12} /> Publish</> : <><EyeOff size={12} /> Unpublish</>}
            </button>
          </div>

          {/* Assign role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Assign to role</label>
              <select
                value={assignedRole}
                onChange={e => setAssignedRole(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">All roles</option>
                {ROLES.map(r => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Assign to dept.</label>
              <select
                value={assignedDepartment}
                onChange={e => setAssignedDepartment(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">All departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {savingSettings ? "Saving…" : <><Check size={14} /> Save Settings</>}
          </button>

          {/* Back image for print */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Back of card (for printing)</p>
            {backImageUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-border group">
                <img src={backImageUrl} alt="Back of card" className="w-full h-32 object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => backImgRef.current?.click()}
                    className="bg-card/90 rounded-xl px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    Replace
                  </button>
                  <button
                    onClick={async () => {
                      await supabase.from("checklist_templates").update({ cover_image_url: null }).eq("id", template.id);
                      setBackImageUrl(null); updateTemplate({ cover_image_url: null });
                    }}
                    className="bg-card/90 rounded-xl px-3 py-1.5 text-xs font-medium text-[hsl(var(--status-urgent))]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => backImgRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBackImageUpload(f); }}
                className="w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-all"
              >
                {backUploading ? (
                  <div className="text-xs">Uploading…</div>
                ) : (
                  <>
                    <ImageIcon size={20} />
                    <p className="text-xs">Drag & drop or click to add back image</p>
                    <p className="text-[10px] text-muted-foreground/60">This will print on the back of the care card</p>
                  </>
                )}
              </button>
            )}
            <input ref={backImgRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBackImageUpload(f); }} />
          </div>
        </div>
      )}

      {/* ── Guide items ─────────────────────────────────────────── */}
      <div id="care-guide-print-area" className="flex-1 overflow-y-auto pb-8">
        {/* Intro caption */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] text-muted-foreground/60 uppercase tracking-widest font-medium">
            {language === "es" ? "Instrucciones" : "Instructions"}
          </p>
        </div>

        {loading ? (
          <div className="px-4 space-y-2 pt-2">
            {[1,2,3,4].map(i => <div key={i} className="h-10 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="bg-card mx-4 rounded-2xl border border-border overflow-hidden">
                {items.length === 0 ? (
                  <div className="p-8 text-center">
                    <BookOpen size={24} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No guidelines yet.</p>
                  </div>
                ) : (
                  items.map((item, index) => (
                    <SortableGuideItem
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      onPhotoDrop={handlePhotoDrop}
                    />
                  ))
                )}

                {/* Add item row */}
                {isAdmin && (
                  <div className="border-t border-dashed border-border/50 px-4 py-3">
                    {addingItem ? (
                      <div className="flex items-center gap-2">
                        {/* New icon picker */}
                        <div className="relative">
                          <button onClick={() => setShowNewIconPicker(v => !v)}
                            className="text-lg w-8 h-8 border border-border rounded-lg flex items-center justify-center">
                            {newIcon}
                          </button>
                          {showNewIconPicker && (
                            <div className="absolute bottom-10 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-5 gap-1 shadow-xl w-44 max-h-52 overflow-y-auto">
                              {ICON_BANK.map(ic => (
                                <button key={ic} onClick={e => { e.stopPropagation(); setNewIcon(ic); setShowNewIconPicker(false); }}
                                  className={cn("text-base p-1 rounded hover:bg-muted", newIcon === ic && "bg-muted")}
                                >{ic}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <input
                          autoFocus value={newTitle}
                          onChange={e => setNewTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAddingItem(false); }}
                          placeholder="New guideline…"
                          className="flex-1 text-sm bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary"
                        />
                        <button onClick={addItem} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg font-medium">Add</button>
                        <button onClick={() => setAddingItem(false)} className="text-xs text-muted-foreground">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingItem(true)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors">
                        <Plus size={12} /> Add guideline
                      </button>
                    )}
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Back image preview (non-admin read view) */}
        {backImageUrl && !showAdminPanel && (
          <div className="mx-4 mt-4">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-2">Material reference</p>
            <div className="rounded-2xl overflow-hidden border border-border">
              <img src={backImageUrl} alt="Material" className="w-full h-40 object-cover" />
            </div>
          </div>
        )}

        {/* Print hint */}
        <div className="mx-4 mt-4 flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-2xl">
          <Printer size={14} className="text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            {language === "es"
              ? "Imprime esta guía como tarjeta de 2 caras (frente + foto del material)"
              : "Print this as a 2-sided card — instructions on the front, material photo on the back"}
          </p>
        </div>
      </div>
    </div>
  );
}
