import { useState, useRef } from "react";
import { Upload, FileText, X, Loader2, Sparkles, Trash2, Plus, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DraftItem {
  title: string;
  notes?: string;
}

interface DraftChecklist {
  title: string;
  category: "cleaning" | "activity";
  subcategory?: string;
  items: DraftItem[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Property the new checklist(s) will be assigned to. null = universal. */
  propertyId: string | null;
  onImported: () => void;
}

const ACCEPTED = ".docx,.xlsx,.xls,.csv,.pdf";
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>"
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ChecklistImportModal({ open, onClose, propertyId, onImported }: Props) {
  const { language } = useLanguage();
  const { userId } = usePermissions();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [drafts, setDrafts] = useState<DraftChecklist[] | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setFileName(null);
    setDrafts(null);
    setExtracting(false);
    setSaving(false);
  };

  const handleClose = () => {
    if (extracting || saving) return;
    reset();
    onClose();
  };

  async function handleFile(file: File) {
    const lower = file.name.toLowerCase();
    if (!/\.(docx|xlsx|xls|csv|pdf)$/.test(lower)) {
      toast.error(language === "es"
        ? "Tipo no soportado. Usa .docx, .xlsx, .csv o .pdf"
        : "Unsupported file. Use .docx, .xlsx, .csv, or .pdf");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(language === "es" ? "Archivo demasiado grande (máx 15 MB)" : "File too large (15 MB max)");
      return;
    }

    setFileName(file.name);
    setExtracting(true);
    setDrafts(null);

    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("extract-checklists", {
        body: { fileName: file.name, fileBase64: base64, mimeType: file.type },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.checklists?.length) throw new Error(language === "es" ? "No se encontraron listas." : "No checklists found.");

      setDrafts(data.checklists);
      toast.success(
        language === "es"
          ? `${data.checklists.length} lista(s) extraída(s)`
          : `${data.checklists.length} checklist(s) extracted`
      );
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Extraction failed");
      setFileName(null);
    } finally {
      setExtracting(false);
    }
  }

  function updateDraft(idx: number, patch: Partial<DraftChecklist>) {
    setDrafts(prev => prev?.map((d, i) => (i === idx ? { ...d, ...patch } : d)) ?? null);
  }
  function removeDraft(idx: number) {
    setDrafts(prev => prev?.filter((_, i) => i !== idx) ?? null);
  }
  function updateItem(draftIdx: number, itemIdx: number, title: string) {
    setDrafts(prev => prev?.map((d, i) => i === draftIdx
      ? { ...d, items: d.items.map((it, j) => j === itemIdx ? { ...it, title } : it) }
      : d
    ) ?? null);
  }
  function removeItem(draftIdx: number, itemIdx: number) {
    setDrafts(prev => prev?.map((d, i) => i === draftIdx
      ? { ...d, items: d.items.filter((_, j) => j !== itemIdx) }
      : d
    ) ?? null);
  }
  function addItem(draftIdx: number) {
    setDrafts(prev => prev?.map((d, i) => i === draftIdx
      ? { ...d, items: [...d.items, { title: "" }] }
      : d
    ) ?? null);
  }

  async function handleSave() {
    if (!drafts || drafts.length === 0) return;
    setSaving(true);
    try {
      let totalChecklists = 0;
      let totalItems = 0;

      for (const draft of drafts) {
        const cleanItems = draft.items.map(i => i.title.trim()).filter(Boolean);
        if (!draft.title.trim() || cleanItems.length === 0) continue;

        const isActivity = draft.category === "activity";

        const { data: tpl, error: tplErr } = await supabase
          .from("checklist_templates")
          .insert({
            title: draft.title.trim(),
            category: draft.category,
            subcategory: isActivity
              ? (draft.subcategory?.trim() || draft.title.trim().toLowerCase().replace(/\s+/g, "_"))
              : null,
            icon: isActivity ? "🎯" : "✅",
            color: isActivity ? "blue" : "green",
            property_id: isActivity ? null : propertyId,
            is_universal: isActivity,
            is_published: false, // imported as DRAFTS — admin reviews & publishes
            created_by: userId,
          })
          .select("id")
          .single();

        if (tplErr || !tpl) {
          console.error("Failed to create template:", tplErr);
          continue;
        }

        const itemRows = draft.items
          .map((it, idx) => ({
            template_id: tpl.id,
            title: it.title.trim(),
            notes: it.notes?.trim() || null,
            sort_order: idx,
            icon: "•",
            color: "gold",
          }))
          .filter(r => r.title.length > 0);

        if (itemRows.length > 0) {
          const { error: itemsErr } = await supabase.from("checklist_items").insert(itemRows);
          if (itemsErr) console.error("Failed to insert items:", itemsErr);
          else totalItems += itemRows.length;
        }
        totalChecklists++;
      }

      toast.success(
        language === "es"
          ? `✓ ${totalChecklists} lista(s) y ${totalItems} ítems creados como borradores`
          : `✓ Created ${totalChecklists} checklist(s) with ${totalItems} items as drafts`
      );
      onImported();
      reset();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const totalItems = drafts?.reduce((sum, d) => sum + d.items.length, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-gold" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground text-sm truncate">
                {language === "es" ? "Importar Lista" : "Import Checklist"}
              </h2>
              <p className="text-[11px] text-muted-foreground truncate">
                {language === "es"
                  ? "Word, Excel, CSV o PDF · Ronin AI extrae los ítems"
                  : "Word, Excel, CSV, or PDF · Ronin AI extracts the items"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={extracting || saving}
            className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Drop zone — show until drafts arrive */}
          {!drafts && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              onClick={() => !extracting && fileRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 transition-all",
                extracting ? "border-gold/40 cursor-wait" : "cursor-pointer",
                dragging ? "border-gold bg-gold/5" : "border-border hover:border-gold/40"
              )}
            >
              {extracting ? (
                <>
                  <Loader2 size={28} className="text-gold animate-spin" />
                  <p className="text-sm font-medium text-foreground text-center">
                    {language === "es" ? "Ronin AI está leyendo tu archivo…" : "Ronin AI is reading your file…"}
                  </p>
                  <p className="text-xs text-muted-foreground">{fileName}</p>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest">
                    {language === "es" ? "Esto puede tomar 10–30 segundos" : "This may take 10–30 seconds"}
                  </p>
                </>
              ) : (
                <>
                  <Upload size={28} className="text-muted-foreground" />
                  <p className="text-sm text-foreground text-center font-medium">
                    {language === "es" ? "Arrastra tu archivo aquí, o toca para elegir" : "Drag your file here, or tap to choose"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest">
                    .docx · .xlsx · .csv · .pdf · 15 MB max
                  </p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          )}

          {/* Preview */}
          {drafts && (
            <div className="space-y-4">
              <div className="bg-status-done/10 border border-status-done/30 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle size={16} className="text-status-done flex-shrink-0" />
                <p className="text-xs text-foreground">
                  {language === "es"
                    ? `Revisa antes de guardar. Las listas se guardarán como borradores (no publicadas).`
                    : `Review before saving. Checklists will be saved as drafts (unpublished).`}
                </p>
              </div>

              {drafts.map((draft, dIdx) => (
                <div key={dIdx} className="bg-background border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <FileText size={16} className="text-gold mt-2 flex-shrink-0" />
                    <input
                      value={draft.title}
                      onChange={e => updateDraft(dIdx, { title: e.target.value })}
                      className="flex-1 bg-transparent text-foreground font-semibold text-sm border-b border-border focus:border-gold outline-none py-1.5"
                      placeholder={language === "es" ? "Título de la lista" : "Checklist title"}
                    />
                    <select
                      value={draft.category}
                      onChange={e => updateDraft(dIdx, { category: e.target.value as "cleaning" | "activity" })}
                      className="bg-card border border-border text-foreground text-xs rounded-lg px-2 py-1.5 outline-none"
                    >
                      <option value="cleaning">{language === "es" ? "Limpieza" : "Cleaning"}</option>
                      <option value="activity">{language === "es" ? "Actividad" : "Activity"}</option>
                    </select>
                    <button
                      onClick={() => removeDraft(dIdx)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title={language === "es" ? "Eliminar lista" : "Remove checklist"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="space-y-1.5 pl-6">
                    {draft.items.map((item, iIdx) => (
                      <div key={iIdx} className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs w-5 text-right">{iIdx + 1}.</span>
                        <input
                          value={item.title}
                          onChange={e => updateItem(dIdx, iIdx, e.target.value)}
                          className="flex-1 bg-transparent text-foreground text-xs border-b border-border/40 focus:border-gold outline-none py-1"
                        />
                        <button
                          onClick={() => removeItem(dIdx, iIdx)}
                          className="text-muted-foreground hover:text-destructive p-1"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addItem(dIdx)}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-gold pl-7 pt-1"
                    >
                      <Plus size={11} /> {language === "es" ? "Agregar ítem" : "Add item"}
                    </button>
                  </div>

                  <p className="text-[10px] text-muted-foreground/70 pl-6">
                    {draft.items.length} {language === "es" ? "ítems" : "items"}
                    {draft.category === "activity" && draft.subcategory && ` · ${draft.subcategory}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {drafts && (
          <div className="border-t border-border p-4 flex items-center justify-between gap-3 flex-shrink-0 bg-card">
            <div className="text-xs text-muted-foreground">
              {drafts.length} {language === "es" ? "lista(s)" : "checklist(s)"} · {totalItems} {language === "es" ? "ítems" : "items"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { reset(); }}
                disabled={saving}
                className="px-3 py-2 text-xs text-muted-foreground border border-border rounded-lg hover:border-foreground/30 disabled:opacity-50"
              >
                {language === "es" ? "Subir otro" : "Upload another"}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || drafts.length === 0}
                className="flex items-center gap-2 bg-gold text-charcoal font-semibold text-xs px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                {language === "es" ? "Crear borradores" : "Create drafts"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
