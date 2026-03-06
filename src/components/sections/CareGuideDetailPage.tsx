import { useState, useRef, useEffect, useCallback } from "react";
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
  GripVertical, Image as ImageIcon, X, Settings, Check, BookOpen,
} from "lucide-react";
import ReactDOM from "react-dom";

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
  "🫆","🤲","👋","✋","💪","🧤","🪣","🚰","🫧","🌀","🔵","🟡","🟠","🟢","🔴","🟣","⬛","🟥","🟦","🟨","🟩","🟧","🟪",
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

/* ─── Portal Icon Picker ─────────────────────────────────────── */
function IconPickerPortal({
  anchor,
  selected,
  onSelect,
  onClose,
}: {
  anchor: HTMLButtonElement | null;
  selected: string;
  onSelect: (icon: string) => void;
  onClose: () => void;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pickerWidth = 272;
    const left = Math.min(rect.left, window.innerWidth - pickerWidth - 8);
    setStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left: Math.max(8, left),
      zIndex: 9999,
      width: pickerWidth,
    });
  }, [anchor]);

  if (!anchor) return null;

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      {/* Picker */}
      <div
        style={style}
        className="bg-card border border-border rounded-2xl p-3 shadow-2xl max-h-64 overflow-y-auto"
      >
        <p className="text-[10px] text-muted-foreground mb-2 font-semibold uppercase tracking-wider">Choose icon</p>
        <div className="grid grid-cols-8 gap-1">
          {ICON_BANK.map(ic => (
            <button
              key={ic}
              onMouseDown={e => { e.preventDefault(); onSelect(ic); }}
              className={cn(
                "text-xl p-1.5 rounded-xl hover:bg-muted transition-colors leading-none",
                selected === ic && "bg-muted ring-1 ring-primary"
              )}
            >
              {ic}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

/* ─── Sortable item wrapper ─────────────────────────────────── */
function SortableGuideItem({
  item, isAdmin, column, onUpdate, onDelete, onPhotoDrop,
}: {
  item: ChecklistItem;
  isAdmin: boolean;
  column: "basic" | "deep";
  onUpdate: (id: string, changes: Partial<ChecklistItem>) => void;
  onDelete: (id: string) => void;
  onPhotoDrop: (id: string, file: File) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !isAdmin });

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editIcon, setEditIcon] = useState(item.icon);
  const [iconAnchor, setIconAnchor] = useState<HTMLButtonElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    const changes: Partial<ChecklistItem> = {};
    if (editTitle.trim() && editTitle !== item.title) changes.title = editTitle.trim();
    if (editIcon !== item.icon) changes.icon = editIcon;
    if (Object.keys(changes).length) onUpdate(item.id, changes);
    setEditing(false);
  };

  // item color field: "basic" or "deep" for column; is_required for equipment
  const isEquipment = item.is_required;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="group relative"
      onDragOver={isAdmin ? e => e.preventDefault() : undefined}
      onDrop={isAdmin ? e => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f?.type.startsWith("image/")) onPhotoDrop(item.id, f);
      } : undefined}
    >
      <div className="border-t border-dashed border-border/40" />

      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {isAdmin && (
          <button
            {...attributes} {...listeners}
            className="mt-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/30 hover:text-muted-foreground transition-colors pt-0.5"
          >
            <GripVertical size={13} />
          </button>
        )}

        {/* Icon */}
        <div className="flex-shrink-0">
          {editing ? (
            <>
              <button
                ref={el => setIconAnchor(el)}
                onMouseDown={e => { e.preventDefault(); setIconAnchor(v => v ? null : e.currentTarget); }}
                className="text-xl w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-primary transition-colors"
              >
                {editIcon}
              </button>
              {iconAnchor && (
                <IconPickerPortal
                  anchor={iconAnchor}
                  selected={editIcon}
                  onSelect={ic => { setEditIcon(ic); setIconAnchor(null); }}
                  onClose={() => setIconAnchor(null)}
                />
              )}
            </>
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
            <p className="text-sm text-foreground leading-relaxed font-light">{item.title}</p>
          )}

          {item.photo_url && (
            <div className="mt-2 relative group/img">
              <img
                src={item.photo_url}
                alt=""
                className="w-full rounded-xl border border-border cursor-pointer object-contain"
                style={{ maxHeight: 200 }}
                onClick={() => window.open(item.photo_url!, "_blank")}
              />
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
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoDrop(item.id, f); }}
          />
        </div>

        {/* Admin actions */}
        {isAdmin && !editing && (
          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Equipment toggle */}
            <button
              onClick={() => onUpdate(item.id, { is_required: !isEquipment })}
              title={isEquipment ? "Mark as instruction" : "Mark as equipment"}
              className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-colors",
                isEquipment
                  ? "border-amber-400/40 text-amber-400 bg-amber-400/10"
                  : "border-muted-foreground/20 text-muted-foreground hover:border-primary"
              )}
            >
              {isEquipment ? "EQ" : "INST"}
            </button>
            {/* Column toggle */}
            <button
              onClick={() => onUpdate(item.id, { color: column === "basic" ? "deep" : "basic" })}
              title="Move to other column"
              className="px-1.5 py-0.5 rounded text-[9px] font-semibold border border-muted-foreground/20 text-muted-foreground hover:border-primary transition-colors"
            >
              {column === "basic" ? "→ Deep" : "← Basic"}
            </button>
            <button
              onClick={() => { setEditing(true); setEditTitle(item.title); setEditIcon(item.icon); }}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1.5 rounded-lg hover:bg-muted text-[hsl(var(--status-urgent))] transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Column Section ─────────────────────────────────────────── */
function ColumnSection({
  title, items, isAdmin, onUpdate, onDelete, onPhotoDrop, onAddItem, colorAccent,
}: {
  title: string;
  items: ChecklistItem[];
  isAdmin: boolean;
  onUpdate: (id: string, changes: Partial<ChecklistItem>) => void;
  onDelete: (id: string) => void;
  onPhotoDrop: (id: string, file: File) => void;
  onAddItem: (column: "basic" | "deep", isEquipment: boolean) => void;
  colorAccent: string;
}) {
  const col = title.toLowerCase().includes("basic") ? "basic" : "deep";
  const equipment = items.filter(i => i.is_required);
  const instructions = items.filter(i => !i.is_required);

  return (
    <div className="flex-1 min-w-0 space-y-2">
      {/* Column header */}
      <div className={cn("px-3 py-2 rounded-xl border", colorAccent)}>
        <h3 className="text-xs font-bold uppercase tracking-widest">{title}</h3>
      </div>

      {/* Equipment */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-3 py-1.5 bg-muted/30 border-b border-border">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Equipment</p>
        </div>
        {equipment.map(item => (
          <SortableGuideItem key={item.id} item={item} isAdmin={isAdmin} column={col}
            onUpdate={onUpdate} onDelete={onDelete} onPhotoDrop={onPhotoDrop} />
        ))}
        {equipment.length === 0 && (
          <p className="text-xs text-muted-foreground/40 px-3 py-2 italic">No equipment</p>
        )}
        {isAdmin && (
          <div className="border-t border-dashed border-border/40 px-3 py-1.5">
            <button
              onClick={() => onAddItem(col, true)}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Plus size={11} /> Add equipment
            </button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-3 py-1.5 bg-muted/30 border-b border-border">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Instructions</p>
        </div>
        {instructions.map(item => (
          <SortableGuideItem key={item.id} item={item} isAdmin={isAdmin} column={col}
            onUpdate={onUpdate} onDelete={onDelete} onPhotoDrop={onPhotoDrop} />
        ))}
        {instructions.length === 0 && (
          <p className="text-xs text-muted-foreground/40 px-3 py-2 italic">No instructions</p>
        )}
        {isAdmin && (
          <div className="border-t border-dashed border-border/40 px-3 py-1.5">
            <button
              onClick={() => onAddItem(col, false)}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Plus size={11} /> Add instruction
            </button>
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

  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Icon picker portal
  const [iconAnchorEl, setIconAnchorEl] = useState<HTMLButtonElement | null>(null);

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(template.title);

  // Back image
  const [backImageUrl, setBackImageUrl] = useState<string | null>(template.cover_image_url);
  const [backUploading, setBackUploading] = useState(false);
  const backImgRef = useRef<HTMLInputElement>(null);

  // Admin settings
  const [assignedRole, setAssignedRole] = useState(template.assigned_role ?? "");
  const [assignedDepartment, setAssignedDepartment] = useState(template.assigned_department ?? "");
  const [savingSettings, setSavingSettings] = useState(false);

  // Adding item state
  const [addingItem, setAddingItem] = useState<{ column: "basic" | "deep"; isEquipment: boolean } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newIcon, setNewIcon] = useState("▸");
  const [newIconAnchor, setNewIconAnchor] = useState<HTMLButtonElement | null>(null);

  const updateTemplate = (changes: Partial<CareGuideTemplate>) => {
    const updated = { ...template, ...changes };
    setTemplate(updated);
    onTemplateUpdate?.(updated);
  };

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

  const handleAddItem = async (column: "basic" | "deep", isEquipment: boolean) => {
    setAddingItem({ column, isEquipment });
    setNewTitle("");
    setNewIcon(isEquipment ? "🧽" : "▸");
  };

  const commitAdd = async () => {
    if (!newTitle.trim() || !addingItem) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
    const { data } = await supabase.from("checklist_items").insert({
      template_id: template.id,
      title: newTitle.trim(),
      icon: newIcon,
      color: addingItem.column,
      is_required: addingItem.isEquipment,
      sort_order: maxOrder,
    }).select().single();
    if (data) setItems(prev => [...prev, data as ChecklistItem]);
    setNewTitle(""); setAddingItem(null);
  };

  const saveTitle = async () => {
    if (!titleDraft.trim()) { setEditingTitle(false); return; }
    await supabase.from("checklist_templates").update({ title: titleDraft.trim() }).eq("id", template.id);
    updateTemplate({ title: titleDraft.trim() });
    setEditingTitle(false);
  };

  const saveIcon = async (icon: string) => {
    await supabase.from("checklist_templates").update({ icon }).eq("id", template.id);
    updateTemplate({ icon });
    setIconAnchorEl(null);
  };

  const togglePublish = async () => {
    const next = !template.is_published;
    await supabase.from("checklist_templates").update({ is_published: next }).eq("id", template.id);
    updateTemplate({ is_published: next });
  };

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

  const saveSettings = async () => {
    setSavingSettings(true);
    await supabase.from("checklist_templates").update({
      assigned_role: assignedRole || null,
      assigned_department: assignedDepartment || null,
    }).eq("id", template.id);
    updateTemplate({ assigned_role: assignedRole || null, assigned_department: assignedDepartment || null });
    setSavingSettings(false);
  };

  /* ─── Print ─────────────────────────────────────────────────── */
  const handlePrint = () => {
    const basicItems = items.filter(i => i.color !== "deep");
    const deepItems = items.filter(i => i.color === "deep");

    const basicEquip = basicItems.filter(i => i.is_required);
    const basicInstr = basicItems.filter(i => !i.is_required);
    const deepEquip = deepItems.filter(i => i.is_required);
    const deepInstr = deepItems.filter(i => !i.is_required);

    const renderEquipRow = (item: ChecklistItem) =>
      `<div class="equip-item"><span class="eq-icon">${item.icon}</span><span class="eq-label">${item.title}</span></div>`;

    const renderInstrRow = (item: ChecklistItem, idx: number) =>
      `<div class="instr-row">
        <span class="instr-icon">${item.icon}</span>
        <span class="instr-text">${item.title}</span>
       </div>`;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html><html><head>
        <title>${template.title} — Care Guide</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'Helvetica Neue',Arial,sans-serif; background:white; color:#1a1a1a; }
          @page { size: A5 landscape; margin: 12mm 14mm; }

          /* ── Only 2 physical pages ── */
          .page { width:100%; page-break-after:always; }
          .page:last-child { page-break-after:auto; }

          /* ── FRONT ── */
          .front { min-height:0; }
          .front-header {
            display:flex; align-items:center; gap:10px;
            border-bottom:2px solid #1a1a1a;
            padding-bottom:10px; margin-bottom:12px;
          }
          .guide-icon { font-size:24px; }
          .guide-title { font-size:16px; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; }
          .draft-badge {
            margin-left:auto; font-size:8px; font-weight:700;
            border:1px solid #999; padding:2px 5px; border-radius:3px; color:#999;
          }

          /* ── Two columns ── */
          .columns { display:flex; gap:0; }
          .col { flex:1; padding:0 10px; }
          .col:first-child { padding-left:0; border-right:1px dashed #ccc; }
          .col:last-child { padding-right:0; }

          .col-title {
            font-size:11px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase;
            border-bottom:1px solid #1a1a1a; padding-bottom:5px; margin-bottom:8px;
          }

          /* Section labels */
          .section-label {
            font-size:8px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
            color:#555; margin:8px 0 5px; border-bottom:1px dotted #ddd; padding-bottom:3px;
          }

          /* Equipment grid */
          .equip-grid { display:flex; flex-wrap:wrap; gap:6px 10px; margin-bottom:4px; }
          .equip-item { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:36px; }
          .eq-icon { font-size:20px; }
          .eq-label { font-size:7px; text-align:center; color:#444; max-width:40px; line-height:1.2; }

          /* Instructions */
          .instr-row { display:flex; align-items:flex-start; gap:7px; padding:4px 0; border-bottom:1px dotted #e8e8e8; }
          .instr-row:last-child { border-bottom:none; }
          .instr-icon { font-size:14px; flex-shrink:0; width:18px; text-align:center; margin-top:1px; }
          .instr-text { font-size:9.5px; line-height:1.45; font-weight:300; }

          /* Footer */
          .front-footer {
            margin-top:12px; padding-top:8px;
            border-top:1px solid #e0e0e0;
            font-size:8px; color:#999; letter-spacing:0.05em; text-transform:uppercase;
            display:flex; justify-content:space-between;
          }

          /* ── BACK ── */
          .back { display:flex; align-items:stretch; justify-content:center; min-height:120mm; overflow:hidden; position:relative; }
          .back-img { width:100%; height:auto; object-fit:contain; display:block; }
          .back-placeholder {
            width:100%; display:flex; flex-direction:column;
            align-items:center; justify-content:center; gap:8px;
            min-height:100mm;
          }
          .back-placeholder .ph-icon { font-size:64px; }
          .back-placeholder .ph-title { font-size:20px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#888; }
          .back-label {
            position:absolute; bottom:14px; left:0; right:0;
            text-align:center; font-size:14px; font-weight:700;
            text-transform:uppercase; letter-spacing:0.06em; color:rgba(0,0,0,0.5);
          }
        </style>
      </head><body>

      <!-- FRONT PAGE -->
      <div class="page front">
        <div class="front-header">
          <span class="guide-icon">${template.icon}</span>
          <span class="guide-title">${template.title}</span>
          ${!template.is_published ? '<span class="draft-badge">DRAFT</span>' : ""}
        </div>

        <div class="columns">
          <!-- Basic Clean column -->
          <div class="col">
            <div class="col-title">Basic Clean</div>
            ${basicEquip.length > 0 ? `
              <div class="section-label">Equipment</div>
              <div class="equip-grid">${basicEquip.map(renderEquipRow).join("")}</div>
            ` : ""}
            ${basicInstr.length > 0 ? `
              <div class="section-label">Instructions</div>
              ${basicInstr.map(renderInstrRow).join("")}
            ` : ""}
            ${basicEquip.length === 0 && basicInstr.length === 0 ? '<p style="font-size:9px;color:#ccc;font-style:italic;">No items</p>' : ""}
          </div>

          <!-- Deep Clean column -->
          <div class="col">
            <div class="col-title">Deep Clean</div>
            ${deepEquip.length > 0 ? `
              <div class="section-label">Equipment</div>
              <div class="equip-grid">${deepEquip.map(renderEquipRow).join("")}</div>
            ` : ""}
            ${deepInstr.length > 0 ? `
              <div class="section-label">Instructions</div>
              ${deepInstr.map(renderInstrRow).join("")}
            ` : ""}
            ${deepEquip.length === 0 && deepInstr.length === 0 ? '<p style="font-size:9px;color:#ccc;font-style:italic;">No items</p>' : ""}
          </div>
        </div>

        <div class="front-footer">
          <span>Estate Care Guide</span>
          <span>${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long" })}</span>
        </div>
      </div>

      <!-- BACK PAGE -->
      <div class="page back">
        ${backImageUrl
          ? `<img src="${backImageUrl}" class="back-img" /><div class="back-label">${template.title}</div>`
          : `<div class="back-placeholder"><span class="ph-icon">${template.icon}</span><span class="ph-title">${template.title}</span></div>`
        }
      </div>

      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 600);
  };

  /* ─── Derived ───────────────────────────────────────────────── */
  const colorSet = COLOR_MAP[template.color] ?? COLOR_MAP.gold;
  const isDraft = !template.is_published;
  const basicItems = items.filter(i => i.color !== "deep");
  const deepItems = items.filter(i => i.color === "deep");

  return (
    <div className="animate-fade-in flex flex-col h-full">

      {/* Icon picker portal */}
      {iconAnchorEl && (
        <IconPickerPortal
          anchor={iconAnchorEl}
          selected={template.icon}
          onSelect={saveIcon}
          onClose={() => setIconAnchorEl(null)}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-charcoal border-b border-charcoal-light px-4 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors text-cream/60 hover:text-cream">
            <ArrowLeft size={18} />
          </button>
          <p className="text-xs text-cream/40 uppercase tracking-widest">Care Guides</p>
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
              title="Print 2-sided A5 card"
            >
              <Printer size={15} />
            </button>
          </div>
        </div>

        {/* Title row */}
        <div className="flex items-center gap-3">
          {/* Icon — opens portal picker */}
          <button
            ref={el => { if (isMasterAdmin) setIconAnchorEl(null); }}
            onClick={e => {
              if (!isMasterAdmin) return;
              setIconAnchorEl(v => v ? null : e.currentTarget as HTMLButtonElement);
            }}
            className={cn(
              "w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-2xl flex-shrink-0 transition-all",
              colorSet.border, colorSet.bg,
              isMasterAdmin && "cursor-pointer hover:scale-105 active:scale-95"
            )}
          >
            {template.icon}
          </button>

          {/* Title */}
          <div className="flex-1 min-w-0">
            {editingTitle && isMasterAdmin ? (
              <input
                autoFocus value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                className="w-full font-display text-2xl text-cream bg-transparent border-b border-cream/30 outline-none pb-0.5"
              />
            ) : (
              <h1
                className={cn("font-display text-2xl leading-tight", isDraft ? "text-cream/40" : "text-cream", isMasterAdmin && "cursor-pointer")}
                onClick={() => isMasterAdmin && setEditingTitle(true)}
              >
                {template.title}
                {isMasterAdmin && <Pencil size={12} className="inline ml-2 text-cream/30" />}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("text-xs font-medium", colorSet.text)}>
                <BookOpen size={10} className="inline mr-1" />Care guide
              </span>
              {isDraft && (
                <span className="text-[9px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full border border-border">DRAFT</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Admin Panel ─────────────────────────────────────────── */}
      {showAdminPanel && isMasterAdmin && (
        <div className="bg-card border-b border-border px-4 py-4 space-y-4 flex-shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Admin Settings</p>

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Assign to role</label>
              <select value={assignedRole} onChange={e => setAssignedRole(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary">
                <option value="">All roles</option>
                {ROLES.map(r => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Assign to dept.</label>
              <select value={assignedDepartment} onChange={e => setAssignedDepartment(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary">
                <option value="">All departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <button onClick={saveSettings} disabled={savingSettings}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
            {savingSettings ? "Saving…" : <><Check size={14} /> Save Settings</>}
          </button>

          {/* Back image */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Back of card (prints as reverse side)</p>
            {backImageUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-border group">
                {/* Auto-sized image */}
                <img src={backImageUrl} alt="Back of card" className="w-full h-auto block" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => backImgRef.current?.click()}
                    className="bg-card/90 rounded-xl px-3 py-1.5 text-xs font-medium text-foreground">Replace</button>
                  <button onClick={async () => {
                    await supabase.from("checklist_templates").update({ cover_image_url: null }).eq("id", template.id);
                    setBackImageUrl(null); updateTemplate({ cover_image_url: null });
                  }} className="bg-card/90 rounded-xl px-3 py-1.5 text-xs font-medium text-[hsl(var(--status-urgent))]">Remove</button>
                </div>
              </div>
            ) : (
              <button onClick={() => backImgRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBackImageUpload(f); }}
                className="w-full py-8 rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-all">
                {backUploading ? <div className="text-xs">Uploading…</div> : (
                  <>
                    <ImageIcon size={20} />
                    <p className="text-xs">Drag & drop or click to add back image</p>
                    <p className="text-[10px] text-muted-foreground/60">Prints on reverse side of the card</p>
                  </>
                )}
              </button>
            )}
            <input ref={backImgRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBackImageUpload(f); }} />
          </div>
        </div>
      )}

      {/* ── Add item inline form ─────────────────────────────────── */}
      {addingItem && (
        <div className="bg-muted/30 border-b border-border px-4 py-3 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground font-medium">
            {addingItem.isEquipment ? "Equipment" : "Instruction"} → {addingItem.column === "basic" ? "Basic" : "Deep"} Clean
          </span>
          <div className="relative">
            <button
              ref={el => setNewIconAnchor(null)}
              onClick={e => setNewIconAnchor(v => v ? null : e.currentTarget as HTMLButtonElement)}
              className="text-lg w-8 h-8 border border-border rounded-lg flex items-center justify-center bg-card"
            >
              {newIcon}
            </button>
            {newIconAnchor && (
              <IconPickerPortal
                anchor={newIconAnchor}
                selected={newIcon}
                onSelect={ic => { setNewIcon(ic); setNewIconAnchor(null); }}
                onClose={() => setNewIconAnchor(null)}
              />
            )}
          </div>
          <input
            autoFocus value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitAdd(); if (e.key === "Escape") setAddingItem(null); }}
            placeholder="Enter text…"
            className="flex-1 text-sm bg-card border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary"
          />
          <button onClick={commitAdd} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg font-medium">Add</button>
          <button onClick={() => setAddingItem(null)} className="text-xs text-muted-foreground">✕</button>
        </div>
      )}

      {/* ── Content — 2 column layout ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-3 pb-2">
          <p className="text-[11px] text-muted-foreground/60 uppercase tracking-widest font-medium">
            {language === "es" ? "Instrucciones de Cuidado" : "Care Instructions"}
          </p>
          {isAdmin && (
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">
              Hover items to assign to Basic or Deep column, or mark as Equipment/Instruction
            </p>
          )}
        </div>

        {loading ? (
          <div className="px-4 space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="px-4 flex gap-3">
                <ColumnSection
                  title="Basic Clean"
                  items={basicItems}
                  isAdmin={isAdmin}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onPhotoDrop={handlePhotoDrop}
                  onAddItem={handleAddItem}
                  colorAccent="border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold)/0.06)] text-[hsl(var(--gold))]"
                />
                <ColumnSection
                  title="Deep Clean"
                  items={deepItems}
                  isAdmin={isAdmin}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onPhotoDrop={handlePhotoDrop}
                  onAddItem={handleAddItem}
                  colorAccent="border-[hsl(var(--status-progress)/0.3)] bg-[hsl(var(--status-progress)/0.06)] text-[hsl(var(--status-progress))]"
                />
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Back image preview */}
        {backImageUrl && !showAdminPanel && (
          <div className="mx-4 mt-4">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-2">Material reference (back of card)</p>
            <div className="rounded-2xl overflow-hidden border border-border">
              <img src={backImageUrl} alt="Material" className="w-full h-auto block" />
            </div>
          </div>
        )}

        {/* Print hint */}
        <div className="mx-4 mt-4 flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-2xl">
          <Printer size={14} className="text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Prints as 2-sided A5 landscape card — Basic/Deep columns on front, material photo on back
          </p>
        </div>
      </div>
    </div>
  );
}
