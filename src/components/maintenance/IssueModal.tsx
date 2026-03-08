import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Camera, AlertTriangle, Search, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import type { MaintenanceIssue, MaintenanceCategory, IssuePriority, IssueStatus } from "@/hooks/useMaintenanceIssues";
import { IssueStatusBadge } from "./IssueStatusBadge";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (issue: Partial<MaintenanceIssue>) => Promise<void>;
  initial?: Partial<MaintenanceIssue>;
  categories: MaintenanceCategory[];
  onCategoryAdded?: () => void;
  properties: { id: string; name: string }[];
  profiles: { id: string; name: string; avatar: string | null }[];
  existingIssues?: { id: string; title: string; created_at: string }[];
  mode?: "create" | "edit";
}

function ModalContent({
  onClose, onSave, initial = {}, categories, onCategoryAdded,
  properties, profiles, existingIssues = [], mode = "create",
}: Omit<Props, "open">) {
  const { userId, isAdmin, isMasterAdmin, isManager } = usePermissions();
  const { t, language } = useLanguage();
  const isL = language === "es";
  const canManageCategories = isMasterAdmin || isAdmin || isManager;

  const PRIORITIES: { value: IssuePriority; label: string; labelEs: string; color: string }[] = [
    { value: "urgent", label: "🔴 Urgent",  labelEs: "🔴 Urgente", color: "border-[hsl(var(--status-urgent))] bg-[hsl(var(--status-urgent)/0.08)] text-[hsl(var(--status-urgent))]" },
    { value: "high",   label: "🟠 High",    labelEs: "🟠 Alto",    color: "border-orange-400/50 bg-orange-400/10 text-orange-400" },
    { value: "medium", label: "🟡 Medium",  labelEs: "🟡 Medio",   color: "border-[hsl(var(--gold)/0.5)] bg-[hsl(var(--gold)/0.08)] text-[hsl(var(--gold))]" },
    { value: "low",    label: "⚪ Low",     labelEs: "⚪ Bajo",    color: "border-border bg-muted text-muted-foreground" },
  ];

  const STATUSES: { value: IssueStatus; label: string; labelEs: string }[] = [
    { value: "reported",    label: "Reported",     labelEs: "Reportado" },
    { value: "approved",    label: "Approved",     labelEs: "Aprobado" },
    { value: "assigned",    label: "Assigned",     labelEs: "Asignado" },
    { value: "scheduled",   label: "Scheduled",    labelEs: "Programado" },
    { value: "in_progress", label: "In Progress",  labelEs: "En Progreso" },
    { value: "resolved",    label: "Resolved",     labelEs: "Resuelto" },
  ];

  const [title, setTitle]             = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [category, setCategory]       = useState(initial.category ?? "");
  const [priority, setPriority]       = useState<IssuePriority>(initial.priority ?? "medium");
  const [status, setStatus]           = useState<IssueStatus>(initial.status ?? "reported");
  const [propertyId, setPropertyId]   = useState(initial.property_id ?? "");
  const [room, setRoom]               = useState(initial.location_detail ?? "");
  const [assignedTo, setAssignedTo]   = useState(initial.assigned_to ?? "");
  const [scheduledDate, setScheduled] = useState(
    initial.scheduled_date ? initial.scheduled_date.slice(0, 10) : ""
  );
  const [relatedIssueId, setRelated]  = useState(initial.related_issue_id ?? "");
  const [relatedSearch, setRelatedSch]= useState("");
  const [photoUrl, setPhotoUrl]       = useState(initial.photo_url ?? "");
  const [closeOutUrl, setCloseOut]    = useState(initial.close_out_photo_url ?? "");
  const [uploading, setUploading]     = useState(false);
  const [closeUploading, setCloseUp]  = useState(false);
  const [saving, setSaving]           = useState(false);
  const [rooms, setRooms]             = useState<{ id: string; name: string }[]>([]);
  const [showNewCat, setShowNewCat]   = useState(false);
  const [newCatName, setNewCatName]   = useState("");
  const [newCatIcon, setNewCatIcon]   = useState("🔧");
  const [savingCat, setSavingCat]     = useState(false);

  const photoRef       = useRef<HTMLInputElement>(null);
  const closeOutRef    = useRef<HTMLInputElement>(null);
  const pickerOpenRef  = useRef(false); // iOS: prevent backdrop-close when photo picker returns

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!propertyId) { setRooms([]); return; }
    supabase
      .from("property_rooms" as any)
      .select("id, name")
      .eq("property_id", propertyId)
      .order("sort_order")
      .then(({ data }) =>
        setRooms(((data ?? []) as unknown) as { id: string; name: string }[])
      );
  }, [propertyId]);

  const uploadPhoto = async (file: File, type: "main" | "closeout") => {
    const path = `${Date.now()}-${file.name}`;
    type === "main" ? setUploading(true) : setCloseUp(true);
    const { data, error } = await supabase.storage
      .from("maintenance")
      .upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: urlData } = supabase.storage
        .from("maintenance")
        .getPublicUrl(data.path);
      if (type === "main") setPhotoUrl(urlData.publicUrl);
      else setCloseOut(urlData.publicUrl);
    }
    type === "main" ? setUploading(false) : setCloseUp(false);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    await supabase.from("maintenance_categories").insert({
      name: newCatName.trim(), icon: newCatIcon, color: "gray",
      is_custom: true, sort_order: 99,
    });
    setCategory(newCatName.trim());
    setNewCatName(""); setNewCatIcon("🔧");
    setShowNewCat(false); setSavingCat(false);
    onCategoryAdded?.();
  };

  const handleSave = async () => {
    if (!title.trim() || !userId) return;
    setSaving(true);
    await onSave({
      title:               title.trim(),
      description:         description || null,
      category:            category || "General",
      priority,
      status,
      property_id:         propertyId || null,
      location_detail:     room || null,
      reported_by:         initial.reported_by ?? userId,
      assigned_to:         assignedTo || null,
      photo_url:           photoUrl || null,
      close_out_photo_url: closeOutUrl || null,
      scheduled_date:      scheduledDate ? new Date(scheduledDate).toISOString() : null,
      related_issue_id:    relatedIssueId || null,
      source:              initial.source ?? "manual",
      is_draft:            false,
    });
    setSaving(false);
    onClose();
  };

  const filteredRelated = existingIssues.filter(i =>
    i.id !== initial.id &&
    i.title.toLowerCase().includes(relatedSearch.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
        style={{ height: "90dvh", maxHeight: "90dvh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex-shrink-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base text-foreground">
              {mode === "create" ? t("reportIssueTitle") : t("editIssue")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === "create"
                ? (isL ? "Agrega una foto y descripción breve" : "Add a photo and brief description")
                : (isL ? "Actualiza los detalles del problema" : "Update issue details")}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-5">

          {/* Photo upload */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              {t("addPhotoRecommended")}
            </label>
            {photoUrl ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={photoUrl} alt="Issue" className="w-full h-48 object-cover" />
                <button onClick={() => setPhotoUrl("")}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => photoRef.current?.click()}
                className="w-full h-40 rounded-xl border-2 border-dashed border-border hover:border-gold/40 bg-muted/30 hover:bg-gold/5 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground">
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-gold/40 border-t-gold rounded-full animate-spin" />
                ) : (
                  <>
                    <Camera size={28} className="text-muted-foreground/50" />
                    <span className="text-sm font-medium">{t("tapToAddPhoto")}</span>
                    <span className="text-xs text-muted-foreground/60">JPEG, PNG up to 20MB</span>
                  </>
                )}
              </button>
            )}
            <input ref={photoRef} type="file" accept="image/*" className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0], "main"); }} />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              {t("whatsTheIssue")} <span className="text-[hsl(var(--status-urgent))]">*</span>
            </label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder={isL ? "ej. Grifo de cocina gotea, Aire sin enfriar…" : "e.g. Kitchen tap dripping, A/C not cooling…"}
              style={{ fontSize: "16px" }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]" />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              {t("details")}
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder={isL ? "Contexto adicional — cuándo empezó, qué tan grave es…" : "Any additional context — when did it start, how severe, etc."}
              rows={3} style={{ fontSize: "16px" }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)] resize-none" />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              {t("priority")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITIES.map(p => (
                <button key={p.value} onClick={() => setPriority(p.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-all ${
                    priority === p.value ? p.color : "border-border text-muted-foreground hover:border-gold/30"
                  }`}>
                  {isL ? p.labelEs : p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status (edit mode only) */}
          {mode === "edit" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                {t("byStatus")}
              </label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => (
                  <button key={s.value} onClick={() => setStatus(s.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      status === s.value
                        ? "border-[hsl(var(--gold)/0.6)] bg-[hsl(var(--gold)/0.1)] text-[hsl(var(--gold))]"
                        : "border-border text-muted-foreground hover:border-[hsl(var(--gold)/0.3)]"
                    }`}>
                    {isL ? s.labelEs : s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("category")}
              </label>
              {canManageCategories && !showNewCat && (
                <button onClick={() => setShowNewCat(true)}
                  className="flex items-center gap-1 text-xs text-[hsl(var(--gold)/0.8)] hover:text-[hsl(var(--gold))] transition-colors">
                  <Plus size={12} /> {t("addNew")}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button key={c.id} onClick={() => setCategory(c.name)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    category === c.name
                      ? "border-[hsl(var(--gold)/0.6)] bg-[hsl(var(--gold)/0.1)] text-[hsl(var(--gold))]"
                      : "border-border text-muted-foreground hover:border-[hsl(var(--gold)/0.3)]"
                  }`}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>

            {showNewCat && (
              <div className="mt-3 p-3 rounded-xl bg-muted/40 border border-border space-y-2">
                <p className="text-xs font-semibold text-foreground">{t("newCategory")}</p>
                <div className="flex gap-2">
                  <input value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} placeholder="🔧"
                    style={{ fontSize: "16px" }}
                    className="w-12 rounded-lg border border-input bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]" />
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    placeholder={isL ? "Nombre de categoría…" : "Category name…"}
                    style={{ fontSize: "16px" }}
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowNewCat(false); setNewCatName(""); }}
                    className="flex-1 rounded-lg border border-border py-2 text-xs text-muted-foreground hover:bg-muted transition-colors">
                    {t("cancel")}
                  </button>
                  <button onClick={handleAddCategory} disabled={!newCatName.trim() || savingCat}
                    className="flex-1 rounded-lg bg-[hsl(var(--gold)/0.9)] hover:bg-[hsl(var(--gold))] text-[hsl(var(--charcoal))] py-2 text-xs font-semibold transition-colors disabled:opacity-50">
                    {savingCat ? (isL ? "Guardando…" : "Saving…") : (isL ? "Agregar categoría" : "Add category")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Property + Room */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {t("propertyLabel")}
              </label>
              <select value={propertyId} onChange={e => { setPropertyId(e.target.value); setRoom(""); }}
                style={{ fontSize: "16px" }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]">
                <option value="">{isL ? "Todas / Desconocida" : "All / Unknown"}</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {t("roomArea")}
              </label>
              {rooms.length > 0 ? (
                <select value={room} onChange={e => setRoom(e.target.value)}
                  style={{ fontSize: "16px" }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]">
                  <option value="">{isL ? "Seleccionar habitación…" : "Select room…"}</option>
                  {rooms.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              ) : (
                <input value={room} onChange={e => setRoom(e.target.value)}
                  placeholder={isL ? "ej. Cocina, Baño principal" : "e.g. Kitchen, Master bath"}
                  style={{ fontSize: "16px" }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]" />
              )}
            </div>
          </div>

          {/* Assign to — always shown so reporters can suggest an assignee from step one */}
          {profiles.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {t("assignTo")}
              </label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                style={{ fontSize: "16px" }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]">
                <option value="">{isL ? "Sin asignar" : "Unassigned"}</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Scheduled date (admin only) */}
          {(isAdmin || isManager || isMasterAdmin) && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {t("scheduledDate")}
              </label>
              <input type="date" value={scheduledDate} onChange={e => setScheduled(e.target.value)}
                style={{ fontSize: "16px" }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]" />
            </div>
          )}

          {/* Related issue */}
          {existingIssues.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {t("relatedIssue")}
              </label>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input value={relatedSearch} onChange={e => setRelatedSch(e.target.value)}
                  placeholder={isL ? "Buscar problema…" : "Search issue…"}
                  style={{ fontSize: "16px" }}
                  className="w-full pl-8 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]" />
              </div>
              {relatedSearch && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y divide-border bg-background shadow-lg">
                  {filteredRelated.slice(0, 6).map(i => (
                    <button key={i.id} onClick={() => { setRelated(i.id); setRelatedSch(""); }}
                      className={`w-full px-3 py-2.5 text-left text-xs hover:bg-muted transition-colors ${relatedIssueId === i.id ? "text-gold font-medium" : "text-foreground"}`}>
                      {i.title}
                    </button>
                  ))}
                  {filteredRelated.length === 0 && (
                    <p className="px-3 py-2.5 text-xs text-muted-foreground">{isL ? "Sin resultados" : "No results"}</p>
                  )}
                </div>
              )}
              {relatedIssueId && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-400/10 border border-amber-400/30 rounded-lg">
                  <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
                  <span className="text-xs text-foreground flex-1 truncate">
                    {existingIssues.find(i => i.id === relatedIssueId)?.title}
                  </span>
                  <button onClick={() => setRelated("")} className="text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Close-out photo (edit mode) */}
          {mode === "edit" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                {t("closeOutPhoto")}
              </label>
              {closeOutUrl ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={closeOutUrl} alt="Close-out" className="w-full h-32 object-cover" />
                  <button onClick={() => setCloseOut("")}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button onClick={() => closeOutRef.current?.click()}
                  className="w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-gold/40 bg-muted/30 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  {closeUploading ? (
                    <div className="w-5 h-5 border-2 border-gold/40 border-t-gold rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload size={20} className="text-muted-foreground/50" />
                      <span className="text-xs">{isL ? "Foto de cierre" : "Upload close-out photo"}</span>
                    </>
                  )}
                </button>
              )}
              <input ref={closeOutRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0], "closeout"); }} />
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 bg-background border-t border-border px-5 py-4">
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              {t("cancel")}
            </button>
            <button onClick={handleSave} disabled={!title.trim() || saving}
              className="flex-1 rounded-xl bg-[hsl(var(--gold)/0.9)] hover:bg-[hsl(var(--gold))] text-[hsl(var(--charcoal))] py-3 text-sm font-semibold transition-colors disabled:opacity-50">
              {saving ? (isL ? "Guardando…" : "Saving…") : t("save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IssueModal({ open, ...rest }: Props) {
  if (!open) return null;
  return createPortal(<ModalContent {...rest} />, document.body);
}
