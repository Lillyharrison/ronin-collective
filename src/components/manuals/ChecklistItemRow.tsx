import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistItem } from "@/hooks/useChecklists";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEntryTranslation } from "@/hooks/useEntryTranslation";
import { Check, Camera, Pencil, Trash2, GripVertical, X } from "lucide-react";

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

/** Uniform 56px square — used for both image thumbs and icon tiles so rows
 *  line up whether or not a photo has been added. */
const TILE = "w-14 h-14";

export function ChecklistItemRow({ item, isCompleted, isAdmin, onToggle, onUpdate, onDelete, onPhotoUpload, dragHandleProps }: Props) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editIcon, setEditIcon] = useState(item.icon);
  const [editNotes, setEditNotes] = useState(item.notes ?? "");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep local drafts in sync if item changes externally
  useEffect(() => {
    if (!editing) {
      setEditTitle(item.title);
      setEditIcon(item.icon);
      setEditNotes(item.notes ?? "");
    }
  }, [item.title, item.icon, item.notes, editing]);

  const saveEdit = async () => {
    const changes: Partial<ChecklistItem> = {};
    if (editTitle.trim() && editTitle.trim() !== item.title) changes.title = editTitle.trim();
    if (editIcon !== item.icon) changes.icon = editIcon;
    const nextNotes = editNotes.trim() || null;
    if (nextNotes !== (item.notes ?? null)) changes.notes = nextNotes;
    if (Object.keys(changes).length > 0) onUpdate(item.id, changes);
    setEditing(false);
    setShowIconPicker(false);
  };

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
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

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(file);
  };

  const clearPhoto = async () => {
    onUpdate(item.id, { photo_url: null } as Partial<ChecklistItem>);
  };

  // ── Tile (image OR icon) — always same size ───────────────────────
  const tile = item.photo_url ? (
    <div className={cn(TILE, "relative flex-shrink-0 rounded-lg overflow-hidden border border-border group/tile")}>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="w-full h-full block"
        aria-label="View reference photo"
      >
        <img src={item.photo_url} alt="reference" className="w-full h-full object-cover" />
      </button>
      {isAdmin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); clearPhoto(); }}
          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white opacity-0 group-hover/tile:opacity-100 transition-opacity flex items-center justify-center"
          aria-label="Remove photo"
        >
          <X size={12} />
        </button>
      )}
    </div>
  ) : editing && isAdmin ? (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setShowIconPicker(v => !v)}
        className={cn(TILE, "rounded-lg border border-border hover:border-gold flex items-center justify-center text-2xl bg-muted/30", COLOR_MAP[item.color] ?? COLOR_MAP.default)}
      >
        {editIcon}
      </button>
      {showIconPicker && (
        <div className="absolute top-16 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-8 gap-1 shadow-lg w-64 max-h-56 overflow-y-auto">
          {ICON_BANK.map(ic => (
            <button
              key={ic}
              type="button"
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
    <div className={cn(TILE, "flex-shrink-0 rounded-lg border border-border bg-muted/20 flex items-center justify-center text-2xl", COLOR_MAP[item.color] ?? COLOR_MAP.default)}>
      {item.icon}
    </div>
  );

  return (
    <>
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
            className="mt-5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
          >
            <GripVertical size={14} />
          </div>
        )}

        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={cn(
            "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-5 transition-all",
            isCompleted
              ? "bg-[hsl(var(--status-done))] border-[hsl(var(--status-done))]"
              : "border-border hover:border-[hsl(var(--status-done))]"
          )}
        >
          {isCompleted && <Check size={11} className="text-white" strokeWidth={3} />}
        </button>

        {/* Uniform tile */}
        {tile}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing && isAdmin ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === "Escape") setEditing(false); }}
                placeholder={t("itemTitle")}
                className="w-full text-base bg-muted/50 border border-border rounded px-2 py-1.5 outline-none focus:border-gold"
              />
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder={t("subNotePlaceholder")}
                rows={2}
                className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 outline-none focus:border-gold resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-gold text-charcoal hover:opacity-90"
                >
                  {t("save")}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setEditTitle(item.title); setEditNotes(item.notes ?? ""); setEditIcon(item.icon); }}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-muted"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className={cn("text-sm leading-snug pt-1", isCompleted && "line-through text-muted-foreground")}>
                {item.title}
                {item.is_required && <span className="ml-1 text-[hsl(var(--status-urgent))] text-xs">*</span>}
              </p>
              {item.notes && (
                <p className="text-xs text-muted-foreground mt-1 italic leading-snug">{item.notes}</p>
              )}
            </>
          )}
        </div>

        {/* Color dot */}
        <div className={cn("w-1.5 h-1.5 rounded-full mt-6 flex-shrink-0", DOT_MAP[item.color] ?? DOT_MAP.default)} />

        {/* Admin actions */}
        {isAdmin && !editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button
              onClick={() => fileRef.current?.click()}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              title={item.photo_url ? t("replacePhotoTitle") : t("addPhotoTitle")}
            >
              {uploading ? <span className="text-xs">…</span> : <Camera size={13} />}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              title={t("editTitle")}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-destructive/10 text-destructive"
              title={t("deleteTitle")}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </div>

      {/* Lightbox */}
      {lightboxOpen && item.photo_url && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <img
            src={item.photo_url}
            alt={item.title}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
