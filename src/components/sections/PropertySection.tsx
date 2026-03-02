import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MapPin, ArrowLeft, Building2, Users, Wrench, Calendar, BookOpen, Trash2, Pencil, CheckCircle, Clock, AlertTriangle, Upload, X } from "lucide-react";
import { useNavigation } from "@/contexts/NavigationContext";

type PropertyStatus = "occupied" | "vacant" | "maintenance";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string | null;
  country: string | null;
  status: PropertyStatus;
  image_url: string | null;
  timezone: string;
  is_primary: boolean;
}

const STATUS_CONFIG: Record<PropertyStatus, { label: string; color: string; icon: React.ReactNode }> = {
  occupied:    { label: "Occupied",    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: <CheckCircle size={12} /> },
  vacant:      { label: "Vacant",      color: "bg-muted text-muted-foreground border-border",             icon: <Clock size={12} /> },
  maintenance: { label: "Maintenance", color: "bg-amber-500/20 text-amber-400 border-amber-500/30",       icon: <AlertTriangle size={12} /> },
};

// Sub-sections available inside a property detail
const PROPERTY_SUB_SECTIONS = [
  { key: "tasks",       label: "Tasks",       icon: <CheckCircle size={20} />,  description: "Open & assigned tasks" },
  { key: "maintenance", label: "Maintenance", icon: <Wrench size={20} />,       description: "Issues & requests" },
  { key: "staff",       label: "Staff",       icon: <Users size={20} />,        description: "Assigned team members" },
  { key: "manuals",     label: "Manuals",     icon: <BookOpen size={20} />,     description: "SOPs & guides" },
  { key: "calendar",    label: "Schedule",    icon: <Calendar size={20} />,     description: "Events & bookings" },
];

const emptyForm = { name: "", address: "", city: "", country: "", timezone: "America/Los_Angeles", status: "vacant" as PropertyStatus, image_url: "", is_primary: false };

export function PropertySection() {
  const { isMasterAdmin, assignedPropertyIds, loading: permLoading } = usePermissions();
  const { setActiveSection } = useNavigation();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // CRUD state
  const [showForm, setShowForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);

  useEffect(() => {
    if (!permLoading) fetchProperties();
  }, [permLoading, isMasterAdmin, assignedPropertyIds]);

  async function fetchProperties() {
    setLoading(true);
    let query = supabase.from("properties").select("*").order("name");
    if (!isMasterAdmin && assignedPropertyIds.length > 0) {
      query = query.in("id", assignedPropertyIds);
    } else if (!isMasterAdmin) {
      setProperties([]);
      setLoading(false);
      return;
    }
    const { data } = await query;
    const sorted = ((data as Property[]) || []).sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return a.name.localeCompare(b.name);
    });
    setProperties(sorted);
    setLoading(false);
  }

  function openAdd() {
    setForm(emptyForm);
    setEditingProperty(null);
    setShowForm(true);
  }

  function openEdit(p: Property, e: React.MouseEvent) {
    e.stopPropagation();
    setForm({ name: p.name, address: p.address, city: p.city || "", country: p.country || "", timezone: p.timezone, status: p.status, image_url: p.image_url || "", is_primary: p.is_primary });
    setEditingProperty(p);
    setShowForm(true);
  }

  async function saveProperty() {
    setSaving(true);
    const payload = { name: form.name, address: form.address, city: form.city || null, country: form.country || null, timezone: form.timezone, status: form.status, image_url: form.image_url || null, is_primary: form.is_primary };
    // If setting as primary, unset all others first
    if (form.is_primary) {
      await supabase.from("properties").update({ is_primary: false }).neq("id", editingProperty?.id ?? "");
    }
    if (editingProperty) {
      await supabase.from("properties").update(payload).eq("id", editingProperty.id);
    } else {
      await supabase.from("properties").insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    fetchProperties();
  }

  async function deleteProperty() {
    if (!deleteTarget) return;
    await supabase.from("properties").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    fetchProperties();
  }

  // — Detail view —
  if (selectedProperty) {
    return (
      <PropertyDetail
        property={selectedProperty}
        isMasterAdmin={isMasterAdmin}
        onBack={() => setSelectedProperty(null)}
        onEdit={(e) => openEdit(selectedProperty, e)}
        onDelete={() => setDeleteTarget(selectedProperty)}
        onNavigate={(key) => {
          setSelectedProperty(null);
          setActiveSection(key as any);
        }}
      />
    );
  }

  // — List view —
  return (
    <div className="p-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{properties.length} propert{properties.length === 1 ? "y" : "ies"}</p>
        </div>
        {isMasterAdmin && (
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus size={15} /> Add Property
          </Button>
        )}
      </div>

      {/* Property tiles */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2].map(i => <div key={i} className="h-52 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Building2 size={40} className="text-muted-foreground" />
          <p className="text-muted-foreground text-sm">No properties assigned yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {properties.map(p => (
            <PropertyTile
              key={p.id}
              property={p}
              isMasterAdmin={isMasterAdmin}
              onClick={() => setSelectedProperty(p)}
              onEdit={(e) => openEdit(p, e)}
              onDelete={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
            />
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <PropertyFormDialog
        open={showForm}
        editing={!!editingProperty}
        form={form}
        setForm={setForm}
        saving={saving}
        onSave={saveProperty}
        onClose={() => setShowForm(false)}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. All linked data may be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteProperty} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Property Tile ────────────────────────────────────────────────────────────
function PropertyTile({ property: p, isMasterAdmin, onClick, onEdit, onDelete }: {
  property: Property; isMasterAdmin: boolean;
  onClick: () => void; onEdit: (e: React.MouseEvent) => void; onDelete: (e: React.MouseEvent) => void;
}) {
  const cfg = STATUS_CONFIG[p.status];
  return (
    <button
      onClick={onClick}
      className="relative w-full rounded-2xl overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary group"
      style={{ height: 220 }}
    >
      {/* Hero image */}
      {p.image_url ? (
        <img src={p.image_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
          <Building2 size={48} className="text-muted-foreground/40" />
        </div>
      )}

      {/* Scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Status + Primary badges top-left */}
      <div className="absolute top-3 left-3 flex flex-col gap-1">
        {p.is_primary && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border backdrop-blur-sm bg-primary/80 text-primary-foreground border-primary/60">
            ★ Primary
          </span>
        )}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
      </div>

      {/* Admin actions top-right */}
      {isMasterAdmin && (
        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white hover:bg-destructive transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Name + location bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <h3 className="text-white font-semibold text-lg leading-tight">{p.name}</h3>
        {(p.city || p.country) && (
          <p className="text-white/70 text-sm flex items-center gap-1 mt-0.5">
            <MapPin size={11} /> {[p.city, p.country].filter(Boolean).join(", ")}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Property Detail ──────────────────────────────────────────────────────────
function PropertyDetail({ property: p, isMasterAdmin, onBack, onEdit, onDelete, onNavigate }: {
  property: Property; isMasterAdmin: boolean;
  onBack: () => void; onEdit: (e: React.MouseEvent) => void; onDelete: () => void;
  onNavigate: (key: string) => void;
}) {
  const cfg = STATUS_CONFIG[p.status];
  return (
    <div className="flex flex-col min-h-[calc(100vh-7rem)]">
      {/* Hero */}
      <div className="relative h-64 shrink-0">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center">
            <Building2 size={56} className="text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Back button */}
        <button onClick={onBack} className="absolute top-3 left-3 p-2 rounded-xl bg-black/50 backdrop-blur-sm text-white">
          <ArrowLeft size={18} />
        </button>

        {/* Admin actions */}
        {isMasterAdmin && (
          <div className="absolute top-3 right-3 flex gap-2">
            <button onClick={onEdit} className="p-2 rounded-xl bg-black/50 backdrop-blur-sm text-white hover:bg-black/70">
              <Pencil size={16} />
            </button>
            <button onClick={onDelete} className="p-2 rounded-xl bg-black/50 backdrop-blur-sm text-white hover:bg-destructive">
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {/* Title */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm mb-2 ${cfg.color}`}>
            {cfg.icon} {cfg.label}
          </span>
          <h2 className="text-white text-2xl font-bold">{p.name}</h2>
          <p className="text-white/70 text-sm flex items-center gap-1 mt-0.5">
            <MapPin size={12} /> {[p.address, p.city, p.country].filter(Boolean).join(", ")}
          </p>
        </div>
      </div>

      {/* Sub-section grid */}
      <div className="p-4 flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Sections</p>
        <div className="grid grid-cols-2 gap-3">
          {PROPERTY_SUB_SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => onNavigate(s.key)}
              className="flex flex-col items-start gap-2 p-4 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-accent transition-all text-left group"
            >
              <div className="p-2 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {s.icon}
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Image Uploader ───────────────────────────────────────────────────────────
function PropertyImageUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from("property-images").upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from("property-images").getPublicUrl(data.path);
      onChange(publicUrl);
    }
    setUploading(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-1">
      <Label>Photo</Label>
      {value ? (
        <div className="relative rounded-xl overflow-hidden h-36">
          <img src={value} alt="Property" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`w-full h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${
            dragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          {uploading ? (
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          ) : (
            <>
              <Upload size={20} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Drop image or tap to upload</span>
            </>
          )}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ─── Form Dialog ──────────────────────────────────────────────────────────────
function PropertyFormDialog({ open, editing, form, setForm, saving, onSave, onClose }: {
  open: boolean; editing: boolean;
  form: typeof emptyForm; setForm: (f: typeof emptyForm) => void;
  saving: boolean; onSave: () => void; onClose: () => void;
}) {
  const set = (key: keyof typeof emptyForm, val: string) => setForm({ ...form, [key]: val });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Property" : "Add Property"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <PropertyImageUploader value={form.image_url} onChange={url => set("image_url", url)} />
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Villa Ronin" />
          </div>
          <div className="space-y-1">
            <Label>Address *</Label>
            <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="123 Ocean Drive" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>City</Label>
              <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Malibu" />
            </div>
            <div className="space-y-1">
              <Label>Country</Label>
              <Input value={form.country} onChange={e => set("country", e.target.value)} placeholder="USA" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="vacant">Vacant</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Timezone</Label>
              <Input value={form.timezone} onChange={e => set("timezone", e.target.value)} placeholder="America/LA" />
            </div>
          </div>
          {/* Primary toggle */}
          <button
            type="button"
            onClick={() => setForm({ ...form, is_primary: !form.is_primary })}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
              form.is_primary
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-muted/30 border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>★</span>
              <span>Set as Primary Residence</span>
            </div>
            <div className={`w-10 h-6 rounded-full transition-colors relative ${form.is_primary ? "bg-primary" : "bg-muted"}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.is_primary ? "left-5" : "left-1"}`} />
            </div>
          </button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !form.name || !form.address}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
