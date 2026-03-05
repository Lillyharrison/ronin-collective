import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useChecklistItems } from "@/hooks/useChecklists";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Trash2, Camera, ChevronDown, ChevronUp, BookOpen } from "lucide-react";

interface CareGuideTemplate {
  id: string;
  title: string;
  icon: string;
  color: string;
}

interface Props {
  template: CareGuideTemplate;
}

const COLOR_MAP: Record<string, string> = {
  gold:   "border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.08)] text-[hsl(var(--gold))]",
  amber:  "border-[hsl(var(--status-progress)/0.4)] bg-[hsl(var(--status-progress)/0.08)] text-[hsl(var(--status-progress))]",
  blue:   "border-blue-500/40 bg-blue-500/8 text-blue-500",
  purple: "border-purple-500/40 bg-purple-500/8 text-purple-400",
  green:  "border-[hsl(var(--status-done)/0.4)] bg-[hsl(var(--status-done)/0.08)] text-[hsl(var(--status-done))]",
};

const ICON_BANK = ["🪨","🪵","✨","⬜","🧴","🧽","💧","⛔","🔄","📅","💎","🌿","☀️","🔒","⚡","☕","🛡️","🎨","✅","⚠️","🔧","📸","🌡️","🧊","🫧"];

export function CareGuideCard({ template }: Props) {
  const { isAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  const { items, loading, setItems } = useChecklistItems(open ? template.id : null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [showIconPicker, setShowIconPicker] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIcon, setNewIcon] = useState("▸");
  const [coverUploading, setCoverUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const colorCls = COLOR_MAP[template.color] ?? COLOR_MAP.gold;

  const saveEdit = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const changes: Partial<typeof item> = {};
    if (editTitle.trim() && editTitle !== item.title) changes.title = editTitle.trim();
    if (editIcon !== item.icon) changes.icon = editIcon;
    if (Object.keys(changes).length > 0) {
      await supabase.from("checklist_items").update(changes).eq("id", id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
    }
    setEditingId(null);
  };

  const deleteItem = async (id: string) => {
    await supabase.from("checklist_items").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
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
    if (data) setItems(prev => [...prev, data as any]);
    setNewTitle("");
    setNewIcon("▸");
    setAddingItem(false);
  };

  const handlePhotoDrop = async (e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file?.type.startsWith("image/")) return;
    const path = `care-guides/${itemId}-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("manuals").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("manuals").getPublicUrl(path);
      await supabase.from("checklist_items").update({ photo_url: data.publicUrl }).eq("id", itemId);
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, photo_url: data.publicUrl } : i));
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className={cn("w-10 h-10 rounded-xl border flex items-center justify-center text-xl flex-shrink-0", colorCls)}>
          {template.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-base font-medium text-foreground">{template.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <BookOpen size={10} /> {open ? "Tap to collapse" : "View care guide"}
          </p>
        </div>
        {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {loading ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                className="flex items-start gap-3 px-4 py-3"
                onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
                onDrop={isAdmin ? (e) => handlePhotoDrop(e, item.id) : undefined}
              >
                {isAdmin && editingId === item.id ? (
                  <div className="relative">
                    <button
                      onClick={() => setShowIconPicker(showIconPicker === item.id ? null : item.id)}
                      className="text-lg w-7 h-7 flex items-center justify-center rounded border border-border"
                    >
                      {editIcon}
                    </button>
                    {showIconPicker === item.id && (
                      <div className="absolute top-8 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-5 gap-1 shadow-lg w-40">
                        {ICON_BANK.map(ic => (
                          <button key={ic} onClick={() => { setEditIcon(ic); setShowIconPicker(null); }}
                            className={cn("text-base p-1 rounded hover:bg-muted", editIcon === ic && "bg-muted")}
                          >{ic}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-base flex-shrink-0 mt-0.5 leading-none">{item.icon}</span>
                )}

                <div className="flex-1 min-w-0">
                  {isAdmin && editingId === item.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={() => saveEdit(item.id)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(item.id); if (e.key === "Escape") setEditingId(null); }}
                      className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-gold"
                    />
                  ) : (
                    <p className="text-sm text-foreground leading-snug">{item.title}</p>
                  )}
                  {item.photo_url && (
                    <img src={item.photo_url} alt="" className="mt-2 h-24 w-full object-cover rounded-lg border border-border cursor-pointer" onClick={() => window.open(item.photo_url!, "_blank")} />
                  )}
                  {isAdmin && !item.photo_url && (
                    <p className="text-[10px] text-muted-foreground/50 mt-1 italic">Drag & drop image here</p>
                  )}
                </div>

                {isAdmin && editingId !== item.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditingId(item.id); setEditTitle(item.title); setEditIcon(item.icon); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"><Pencil size={13} /></button>
                    <button onClick={() => deleteItem(item.id)}
                      className="p-1 rounded hover:bg-muted text-[hsl(var(--status-urgent))]"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            ))
          )}

          {isAdmin && (
            <div className="px-4 py-2">
              {addingItem ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowIconPicker(showIconPicker === "new" ? null : "new")}
                    className="text-lg w-8 h-8 border border-border rounded flex items-center justify-center relative">
                    {newIcon}
                    {showIconPicker === "new" && (
                      <div className="absolute top-9 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-5 gap-1 shadow-lg w-40">
                        {ICON_BANK.map(ic => (
                          <button key={ic} onClick={(e) => { e.stopPropagation(); setNewIcon(ic); setShowIconPicker(null); }}
                            className={cn("text-base p-1 rounded hover:bg-muted", newIcon === ic && "bg-muted")}
                          >{ic}</button>
                        ))}
                      </div>
                    )}
                  </button>
                  <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAddingItem(false); }}
                    placeholder="New guideline…"
                    className="flex-1 text-sm bg-muted/50 border border-border rounded px-2 py-1.5 outline-none focus:border-gold" />
                  <button onClick={addItem} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg">Add</button>
                  <button onClick={() => setAddingItem(false)} className="text-xs text-muted-foreground">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingItem(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1">
                  <Plus size={12} /> Add guideline
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
