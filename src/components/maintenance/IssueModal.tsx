import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Camera, AlertTriangle, Search, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
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

const PRIORITIES: { value: IssuePriority; label: string; color: string }[] = [
  { value: "urgent", label: "🔴 Urgent",  color: "border-[hsl(var(--status-urgent))] bg-[hsl(var(--status-urgent)/0.08)] text-[hsl(var(--status-urgent))]" },
  { value: "high",   label: "🟠 High",    color: "border-orange-400/50 bg-orange-400/10 text-orange-400" },
  { value: "medium", label: "🟡 Medium",  color: "border-[hsl(var(--gold)/0.5)] bg-[hsl(var(--gold)/0.08)] text-[hsl(var(--gold))]" },
  { value: "low",    label: "⚪ Low",     color: "border-border bg-muted text-muted-foreground" },
];

const STATUSES: { value: IssueStatus; label: string }[] = [
  { value: "reported",    label: "Reported" },
  { value: "approved",    label: "Approved" },
  { value: "assigned",    label: "Assigned" },
  { value: "scheduled",   label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved",    label: "Resolved" },
];

function ModalContent({
  onClose, onSave, initial = {}, categories, onCategoryAdded,
  properties, profiles, existingIssues = [], mode = "create",
}: Omit<Props, "open">) {
  const { userId, isAdmin, isMasterAdmin, isManager } = usePermissions();
  const canManageCategories = isMasterAdmin || isAdmin || isManager;

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

  const photoRef    = useRef<HTMLInputElement>(null);
  const closeOutRef = useRef<HTMLInputElement>(null);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Load rooms when property changes
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
    /* Full-screen backdrop — rendered via portal so it always covers everything */
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/*
        Modal card
        - On mobile: slides up from bottom, rounded top corners, full width
        - On desktop: centred, max-w-lg, rounded all corners
        - Height = 90dvh (dvh = dynamic viewport height, accounts for mobile browser chrome)
        - flex flex-col ensures header + footer stay fixed, body scrolls
      */}
      <div
        className="
          w-full sm:max-w-lg
          bg-background
          rounded-t-2xl sm:rounded-2xl
          flex flex-col
          overflow-hidden
        "
        style={{ height: "90dvh", maxHeight: "90dvh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Sticky header (flex-shrink-0 = never shrinks) ── */}
        <div
          className="flex-shrink-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between"
          style={{ minHeight: 0 }}
        >
          <div>
            <h2 className="font-semibold text-base text-foreground">
              {mode === "create" ? "Report Issue" : "Edit Issue"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === "create"
                ? "Add a photo and brief description"
                : "Update issue details"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ── flex-1 + min-h-0 is the magic combo ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-5">

          {/* Photo upload */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Photo{" "}
              <span className="text-muted-foreground/60 font-normal normal-case">
                (recommended)
              </span>
            </label>
            {photoUrl ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={photoUrl} alt="Issue" className="w-full h-48 object-cover" />
                <button
                  onClick={() => setPhotoUrl("")}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => photoRef.current?.click()}
                className="w-full h-40 rounded-xl border-2 border-dashed border-border hover:border-gold/40 bg-muted/30 hover:bg-gold/5 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground"
              >
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-gold/40 border-t-gold rounded-full animate-spin" />
                ) : (
                  <>
                    <Camera size={28} className="text-muted-foreground/50" />
                    <span className="text-sm font-medium">Tap to add photo</span>
                    <span className="text-xs text-muted-foreground/60">
                      JPEG, PNG up to 20MB
                    </span>
                  </>
                )}
              </button>
            )}
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                if (e.target.files?.[0]) uploadPhoto(e.target.files[0], "main");
              }}
            />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              What's the issue?{" "}
              <span className="text-[hsl(var(--status-urgent))]">*</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Kitchen tap dripping, A/C not cooling…"
              style={{ fontSize: "16px" }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Details
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any additional context — when did it start, how severe, etc."
              rows={3}
              style={{ fontSize: "16px" }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)] resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Priority
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-all ${
                    priority === p.value
                      ? p.color
                      : "border-border text-muted-foreground hover:border-gold/30"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Category
              </label>
              {canManageCategories && !showNewCat && (
                <button
                  onClick={() => setShowNewCat(true)}
                  className="flex items-center gap-1 text-xs text-[hsl(var(--gold)/0.8)] hover:text-[hsl(var(--gold))] transition-colors"
                >
                  <Plus size={12} /> Add new
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.name)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    category === c.name
                      ? "border-[hsl(var(--gold)/0.6)] bg-[hsl(var(--gold)/0.1)] text-[hsl(var(--gold))]"
                      : "border-border text-muted-foreground hover:border-[hsl(var(--gold)/0.3)]"
                  }`}
                >
                  {c.icon} {c.name}
                </button>
              ))}
            </div>

            {showNewCat && (
              <div className="mt-3 p-3 rounded-xl bg-muted/40 border border-border space-y-2">
                <p className="text-xs font-semibold text-foreground">New category</p>
                <div className="flex gap-2">
                  <input
                    value={newCatIcon}
                    onChange={e => setNewCatIcon(e.target.value)}
                    placeholder="🔧"
                    style={{ fontSize: "16px" }}
                    className="w-12 rounded-lg border border-input bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
                  />
                  <input
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    placeholder="Category name…"
                    style={{ fontSize: "16px" }}
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowNewCat(false); setNewCatName(""); }}
                    className="flex-1 rounded-lg border border-border py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCatName.trim() || savingCat}
                    className="flex-1 rounded-lg bg-[hsl(var(--gold)/0.9)] hover:bg-[hsl(var(--gold))] text-[hsl(var(--charcoal))] py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {savingCat ? "Saving…" : "Add category"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Property + Room */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Property
              </label>
              <select
                value={propertyId}
                onChange={e => { setPropertyId(e.target.value); setRoom(""); }}
                style={{ fontSize: "16px" }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
              >
                <option value="">All / Unknown</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Room / Area
              </label>
              {rooms.length > 0 ? (
                <select
                  value={room}
                  onChange={e => setRoom(e.target.value)}
                  style={{ fontSize: "16px" }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
                >
                  <option value="">Select room…</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={room}
                  onChange={e => setRoom(e.target.value)}
                  placeholder={propertyId ? "Enter room/area" : "Select property first"}
                  style={{ fontSize: "16px" }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
                />
              )}
            </div>
          </div>

          {/* Status (edit mode only) */}
          {mode === "edit" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Status
              </label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setStatus(s.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      status === s.value
                        ? "border-[hsl(var(--gold)/0.6)] bg-[hsl(var(--gold)/0.1)] text-[hsl(var(--gold))]"
                        : "border-border text-muted-foreground hover:border-[hsl(var(--gold)/0.3)]"
                    }`}
                  >
                    <IssueStatusBadge status={s.value} size="xs" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Assign + Schedule (edit mode) */}
          {mode === "edit" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Assign to
                </label>
                <select
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  style={{ fontSize: "16px" }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
                >
                  <option value="">Unassigned</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Schedule date
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduled(e.target.value)}
                  style={{ fontSize: "16px" }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
                />
              </div>
            </div>
          )}

          {/* Close-out photo (edit when in_progress or resolved) */}
          {mode === "edit" && (status === "in_progress" || status === "resolved") && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Close-out photo{" "}
                <span className="text-muted-foreground/60 font-normal normal-case">
                  (optional)
                </span>
              </label>
              {closeOutUrl ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img
                    src={closeOutUrl}
                    alt="Close-out"
                    className="w-full h-32 object-cover"
                  />
                  <button
                    onClick={() => setCloseOut("")}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => closeOutRef.current?.click()}
                  className="w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-[hsl(var(--gold)/0.4)] bg-muted/30 flex items-center justify-center gap-2 text-muted-foreground text-sm"
                >
                  {closeUploading ? (
                    <div className="w-5 h-5 border-2 border-[hsl(var(--gold)/0.4)] border-t-[hsl(var(--gold))] rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload size={18} /> Add close-out photo
                    </>
                  )}
                </button>
              )}
              <input
                ref={closeOutRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) uploadPhoto(e.target.files[0], "closeout");
                }}
              />
            </div>
          )}

          {/* Recurring — link to previous issue */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Recurring issue?{" "}
              <span className="text-muted-foreground/60 font-normal normal-case">
                Link to previous incident
              </span>
            </label>
            {relatedIssueId ? (
              <div className="flex items-center gap-2 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
                <span className="text-amber-400 text-xs flex-1 truncate">
                  🔗{" "}
                  {existingIssues.find(i => i.id === relatedIssueId)?.title ??
                    "Linked issue"}
                </span>
                <button
                  onClick={() => setRelated("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    value={relatedSearch}
                    onChange={e => setRelatedSch(e.target.value)}
                    placeholder="Search prior issues…"
                    style={{ fontSize: "16px" }}
                    className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
                  />
                </div>
                {relatedSearch && filteredRelated.length > 0 && (
                  <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-32 overflow-y-auto">
                    {filteredRelated.slice(0, 5).map(i => (
                      <button
                        key={i.id}
                        onClick={() => { setRelated(i.id); setRelatedSch(""); }}
                        className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors truncate"
                      >
                        {i.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom padding so last field isn't hidden under footer on short screens */}
          <div className="h-2" />
        </div>

        {/* ── Sticky footer — flex-shrink-0 = always visible ── */}
        <div className="flex-shrink-0 bg-background border-t border-border px-5 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex-1 rounded-xl bg-[hsl(var(--gold)/0.9)] hover:bg-[hsl(var(--gold))] py-3 text-sm font-semibold text-[hsl(var(--charcoal))] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-[hsl(var(--charcoal)/0.3)] border-t-[hsl(var(--charcoal))] rounded-full animate-spin" />
            ) : priority === "urgent" ? (
              <>
                <AlertTriangle size={14} /> Report Urgent
              </>
            ) : (
              "Save Issue"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IssueModal(props: Props) {
  if (!props.open) return null;
  // key forces a clean remount every time the modal opens
  const key = `${props.mode}-${props.initial?.id ?? "new"}`;
  return createPortal(
    <ModalContent key={key} {...props} />,
    document.body
  );
}
