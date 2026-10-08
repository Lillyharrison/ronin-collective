import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistItem } from "@/hooks/useChecklists";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEntryTranslation } from "@/hooks/useEntryTranslation";
import { Button } from "@/components/ui/button";
import { Check, Camera, Pencil, Trash2, GripVertical, X } from "lucide-react";

interface Props {
  item: ChecklistItem;
  isCompleted: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  onUpdate: (id: string, changes: Partial<ChecklistItem>) => Promise<boolean>;
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

/** Compact on phones; reference photos remain tappable at either size. */
const TILE = "w-11 h-11 sm:w-14 sm:h-14";

export function ChecklistItemRow({ item, isCompleted, isAdmin, onToggle, onUpdate, onDelete, onPhotoUpload, dragHandleProps }: Props) {
  const { language, t } = useLanguage();
  const { translated } = useEntryTranslation(language, [item.title, item.notes ?? ""]);
  const displayTitle = translated[0] || item.title;
  const displayNotes = translated[1] || item.notes;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editIcon, setEditIcon] = useState(item.icon);
  const [editNotes, setEditNotes] = useState(item.notes ?? "");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [saving, setSaving] = useState(false);
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
    if (Object.keys(changes).length > 0) {
      setSaving(true);
      const saved = await onUpdate(item.id, changes);
      setSaving(false);
      if (!saved) return;
    }
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
          "group grid grid-cols-[44px_44px_minmax(0,1fr)] items-start gap-x-2 gap-y-2 px-3 py-3 sm:flex sm:gap-3 sm:px-4 border-b border-border last:border-0 transition-all",
          isCompleted && "opacity-60"
        )}
        onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
        onDrop={isAdmin ? handleDrop : undefined}
      >
        {/* Drag handle (admin only) */}
        {isAdmin && (
          <div
            {...(dragHandleProps ?? {})}
            className="col-start-1 row-start-2 min-h-11 w-11 flex items-center justify-center sm:min-h-0 sm:w-auto sm:mt-5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
            aria-label={language === "es" ? "Reordenar elemento" : "Reorder item"}
          >
            <GripVertical size={14} />
          </div>
        )}

        {/* Checkbox */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={displayTitle}
          aria-pressed={isCompleted}
          className="col-start-1 row-start-1 h-11 w-11 p-0 sm:-mx-3 sm:mt-2"
        >
          <span className={cn(
            "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all",
            isCompleted
              ? "bg-[hsl(var(--status-done))] border-[hsl(var(--status-done))]"
              : "border-border hover:border-[hsl(var(--status-done))]"
          )}>
            {isCompleted && <Check size={11} className="text-primary-foreground" strokeWidth={3} />}
          </span>
        </Button>

        {/* Uniform tile */}
        {tile}

        {/* Content */}
        <div className="col-start-3 row-start-1 flex-1 min-w-0">
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
                className="w-full text-base sm:text-sm bg-muted/50 border border-border rounded px-2 py-1.5 outline-none focus:border-gold resize-none"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="min-h-11 px-3 sm:min-h-0"
                >
                  {saving ? "…" : t("save")}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => { setEditing(false); setEditTitle(item.title); setEditNotes(item.notes ?? ""); setEditIcon(item.icon); }}
                  className="min-h-11 px-3 sm:min-h-0"
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className={cn("text-base sm:text-sm leading-relaxed sm:leading-snug pt-0.5 sm:pt-1 break-words", isCompleted && "line-through text-muted-foreground")}>
                {displayTitle}
                {item.is_required && <span className="ml-1 text-[hsl(var(--status-urgent))] text-xs">*</span>}
              </p>
              {displayNotes && (
                <p className="text-base sm:text-xs text-muted-foreground mt-1.5 sm:mt-1 leading-relaxed sm:leading-snug whitespace-pre-line break-words">{displayNotes}</p>
              )}
            </>
          )}
        </div>

        {/* Color dot */}
        <div className={cn("hidden sm:block w-1.5 h-1.5 rounded-full mt-6 flex-shrink-0", DOT_MAP[item.color] ?? DOT_MAP.default)} />

        {/* Admin actions */}
        {isAdmin && !editing && (
          <div className="col-start-2 col-span-2 row-start-2 flex justify-end items-center gap-1 sm:gap-0.5 sm:opacity-60 hover:opacity-100 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileRef.current?.click()}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              title={item.photo_url ? t("replacePhotoTitle") : t("addPhotoTitle")}
              aria-label={item.photo_url ? t("replacePhotoTitle") : t("addPhotoTitle")}
            >
              {uploading ? <span className="text-xs">…</span> : <Camera size={13} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditing(true)}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              title={t("editTitle")}
              aria-label={t("editTitle")}
            >
              <Pencil size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(item.id)}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-destructive/10 text-destructive"
              title={t("deleteTitle")}
              aria-label={t("deleteTitle")}
            >
              <Trash2 size={16} />
            </Button>
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
