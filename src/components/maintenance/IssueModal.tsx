import { useState, useRef } from "react";
import { X, Upload, Camera, AlertTriangle, Search } from "lucide-react";
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

export function IssueModal({ open, onClose, onSave, initial = {}, categories, properties, profiles, existingIssues = [], mode = "create" }: Props) {
  const { userId } = usePermissions();
  const [title, setTitle]               = useState(initial.title ?? "");
  const [description, setDescription]   = useState(initial.description ?? "");
  const [category, setCategory]         = useState(initial.category ?? "General");
  const [priority, setPriority]         = useState<IssuePriority>(initial.priority ?? "medium");
  const [status, setStatus]             = useState<IssueStatus>(initial.status ?? "reported");
  const [propertyId, setPropertyId]     = useState(initial.property_id ?? "");
  const [locationDetail, setLocation]   = useState(initial.location_detail ?? "");
  const [assignedTo, setAssignedTo]     = useState(initial.assigned_to ?? "");
  const [scheduledDate, setScheduled]   = useState(initial.scheduled_date ? initial.scheduled_date.slice(0, 10) : "");
  const [relatedIssueId, setRelated]    = useState(initial.related_issue_id ?? "");
  const [relatedSearch, setRelatedSch]  = useState("");
  const [photoUrl, setPhotoUrl]         = useState(initial.photo_url ?? "");
  const [closeOutUrl, setCloseOut]      = useState(initial.close_out_photo_url ?? "");
  const [uploading, setUploading]       = useState(false);
  const [closeUploading, setCloseUp]    = useState(false);
  const [saving, setSaving]             = useState(false);
  const photoRef    = useRef<HTMLInputElement>(null);
  const closeOutRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const uploadPhoto = async (file: File, type: "main" | "closeout") => {
    const path = `${Date.now()}-${file.name}`;
    type === "main" ? setUploading(true) : setCloseUp(true);
    const { data, error } = await supabase.storage.from("maintenance").upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: urlData } = supabase.storage.from("maintenance").getPublicUrl(data.path);
      if (type === "main") setPhotoUrl(urlData.publicUrl);
      else setCloseOut(urlData.publicUrl);
    }
    type === "main" ? setUploading(false) : setCloseUp(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !userId) return;
    setSaving(true);
    await onSave({
      title:               title.trim(),
      description:         description || null,
      category,
      priority,
      status,
      property_id:         propertyId || null,
      location_detail:     locationDetail || null,
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
    (i.title.toLowerCase().includes(relatedSearch.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base text-foreground">
              {mode === "create" ? "Report Issue" : "Edit Issue"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === "create" ? "Add a photo and brief description" : "Update issue details"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Photo upload — primary, large */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Photo <span className="text-muted-foreground/60 font-normal normal-case">(recommended)</span>
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
                {uploading
                  ? <div className="w-6 h-6 border-2 border-gold/40 border-t-gold rounded-full animate-spin" />
                  : <>
                      <Camera size={28} className="text-muted-foreground/50" />
                      <span className="text-sm font-medium">Tap to add photo</span>
                      <span className="text-xs text-muted-foreground/60">JPEG, PNG up to 20MB</span>
                    </>
                }
              </button>
            )}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0], "main"); }} />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              What's the issue? <span className="text-[hsl(var(--status-urgent))]">*</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Kitchen tap dripping, A/C not cooling..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Details</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any additional context — when did it start, how severe, etc."
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/40 resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Priority</label>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-all ${priority === p.value ? p.color : "border-border text-muted-foreground hover:border-gold/30"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Category</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.name)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    category === c.name
                      ? "border-gold/60 bg-gold/10 text-gold"
                      : "border-border text-muted-foreground hover:border-gold/30"
                  }`}
                >
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Property + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Property</label>
              <select
                value={propertyId}
                onChange={e => setPropertyId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
              >
                <option value="">All / Unknown</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Location</label>
              <input
                value={locationDetail}
                onChange={e => setLocation(e.target.value)}
                placeholder="Room / area"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>

          {/* Status (edit mode only) */}
          {mode === "edit" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setStatus(s.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      status === s.value ? "border-gold/60 bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/30"
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
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Assign to</label>
                <select
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
                >
                  <option value="">Unassigned</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Schedule date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduled(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
            </div>
          )}

          {/* Close-out photo (edit mode when in_progress or resolved) */}
          {mode === "edit" && (status === "in_progress" || status === "resolved") && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Close-out photo <span className="text-muted-foreground/60 font-normal normal-case">(optional)</span>
              </label>
              {closeOutUrl ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={closeOutUrl} alt="Close-out" className="w-full h-32 object-cover" />
                  <button onClick={() => setCloseOut("")} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => closeOutRef.current?.click()}
                  className="w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-gold/40 bg-muted/30 flex items-center justify-center gap-2 text-muted-foreground text-sm"
                >
                  {closeUploading
                    ? <div className="w-5 h-5 border-2 border-gold/40 border-t-gold rounded-full animate-spin" />
                    : <><Upload size={18} /> Add close-out photo</>
                  }
                </button>
              )}
              <input ref={closeOutRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0], "closeout"); }} />
            </div>
          )}

          {/* Recurring — link to previous issue */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Recurring issue? <span className="text-muted-foreground/60 font-normal normal-case">Link to previous incident</span>
            </label>
            {relatedIssueId ? (
              <div className="flex items-center gap-2 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
                <span className="text-amber-400 text-xs flex-1 truncate">
                  🔗 {existingIssues.find(i => i.id === relatedIssueId)?.title ?? "Linked issue"}
                </span>
                <button onClick={() => setRelated("")} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={relatedSearch}
                    onChange={e => setRelatedSch(e.target.value)}
                    placeholder="Search prior issues…"
                    className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                </div>
                {relatedSearch && filteredRelated.length > 0 && (
                  <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-32 overflow-y-auto">
                    {filteredRelated.slice(0, 5).map(i => (
                      <button key={i.id} onClick={() => { setRelated(i.id); setRelatedSch(""); }}
                        className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors truncate">
                        {i.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-5 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex-1 rounded-xl bg-gold/90 hover:bg-gold py-3 text-sm font-semibold text-charcoal transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-charcoal/30 border-t-charcoal rounded-full animate-spin" />
              : priority === "urgent" ? <><AlertTriangle size={14} /> Report Urgent Issue</> : "Save Issue"
            }
          </button>
        </div>
      </div>
    </div>
  );
}
