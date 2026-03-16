import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistItem } from "@/hooks/useChecklists";
import { ChecklistSession } from "@/hooks/useChecklists";
import { cn } from "@/lib/utils";
import { Check, Camera, ChevronDown, ChevronUp, Pencil, Trash2, GripVertical, Plus } from "lucide-react";

interface Props {
  item: ChecklistItem;
  isCompleted: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  onUpdate: (id: string, changes: Partial<ChecklistItem>) => void;
  onDelete: (id: string) => void;
  onPhotoUpload: (id: string, url: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const COLOR_MAP: Record<string, string> = {
  default: "text-foreground",
  red:     "text-[hsl(var(--status-urgent))]",
  amber:   "text-[hsl(var(--status-progress))]",
  green:   "text-[hsl(var(--status-done))]",
  blue:    "text-blue-500",
  gold:    "text-[hsl(var(--gold))]",
  purple:  "text-purple-400",
};

const DOT_MAP: Record<string, string> = {
  default: "bg-muted-foreground",
  red:     "bg-[hsl(var(--status-urgent))]",
  amber:   "bg-[hsl(var(--status-progress))]",
  green:   "bg-[hsl(var(--status-done))]",
  blue:    "bg-blue-500",
  gold:    "bg-[hsl(var(--gold))]",
  purple:  "bg-purple-400",
};

const ICON_BANK = ["🧹","🛏️","🚿","🍳","🗑️","💧","🧴","🧽","💡","🔒","🌿","📸","❄️","🔧","⚠️","✅","☀️","🪣","🧊","🔑","📅","🛒","🕯️","🥂","🍷","🌸","🎵","📺","🔊","📶","🚨","📹","🏊","🪑","🌬️","🔌","💎","🎨","🪵","⬜","✨","🛋️","🌀","🔋","⛔","📄","💼","💻","💃","⚽","⚾","🏀","⛷️","⛵","🔥","🥩","🥗"];

export function ChecklistItemRow({ item, isCompleted, isAdmin, onToggle, onUpdate, onDelete, onPhotoUpload, dragHandleProps }: Props) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editIcon, setEditIcon] = useState(item.icon);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveEdit = async () => {
    if (editTitle.trim() && (editTitle !== item.title || editIcon !== item.icon)) {
      onUpdate(item.id, { title: editTitle.trim(), icon: editIcon });
    }
    setEditing(false);
    setShowIconPicker(false);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `checklist-items/${item.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("manuals").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("manuals").getPublicUrl(path);
      onPhotoUpload(item.id, data.publicUrl);
    }
    setUploading(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file?.type.startsWith("image/")) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `checklist-items/${item.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("manuals").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("manuals").getPublicUrl(path);
      onPhotoUpload(item.id, data.publicUrl);
    }
    setUploading(false);
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 transition-all",
        isCompleted && "opacity-60"
      )}
      onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
      onDrop={isAdmin ? handleDrop : undefined}
    >
      {/* Drag handle (admin only) */}
      {isAdmin && (
        <div
          {...(dragHandleProps ?? {})}
          className="mt-0.5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        >
          <GripVertical size={14} />
        </div>
      )}

      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={cn(
          "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all",
          isCompleted
            ? "bg-[hsl(var(--status-done))] border-[hsl(var(--status-done))]"
            : "border-border hover:border-[hsl(var(--status-done))]"
        )}
      >
        {isCompleted && <Check size={11} className="text-white" strokeWidth={3} />}
      </button>

      {/* Icon */}
      {editing && isAdmin ? (
        <div className="relative">
          <button
            onClick={() => setShowIconPicker(v => !v)}
            className="text-lg w-7 h-7 flex items-center justify-center rounded border border-border hover:border-gold"
          >
            {editIcon}
          </button>
          {showIconPicker && (
            <div className="absolute top-8 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-8 gap-1 shadow-lg w-64">
              {ICON_BANK.map(ic => (
                <button
                  key={ic}
                  onClick={() => { setEditIcon(ic); setShowIconPicker(false); }}
                  className={cn("text-base p-1 rounded hover:bg-muted", editIcon === ic && "bg-muted")}
                >
                  {ic}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span className={cn("text-base flex-shrink-0 leading-none mt-0.5", COLOR_MAP[item.color] ?? COLOR_MAP.default)}>
          {item.icon}
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editing && isAdmin ? (
          <input
            autoFocus
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
            className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-gold"
          />
        ) : (
          <p className={cn("text-sm leading-snug", isCompleted && "line-through text-muted-foreground")}>
            {item.title}
            {item.is_required && <span className="ml-1 text-[hsl(var(--status-urgent))] text-xs">*</span>}
          </p>
        )}

        {/* Photo */}
        {item.photo_url && (
          <img
            src={item.photo_url}
            alt="reference"
            className="mt-2 h-20 rounded-lg object-cover border border-border cursor-pointer"
            onClick={() => window.open(item.photo_url!, "_blank")}
          />
        )}

        {/* Notes */}
        {item.notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">{item.notes}</p>
        )}
      </div>

      {/* Color dot */}
      <div className={cn("w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0", DOT_MAP[item.color] ?? DOT_MAP.default)} />

      {/* Admin actions */}
      {isAdmin && !editing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Add photo"
          >
            {uploading ? <span className="text-xs">…</span> : <Camera size={13} />}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1 rounded hover:bg-muted text-[hsl(var(--status-urgent))] hover:text-[hsl(var(--status-urgent))]"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
    </div>
  );
}
