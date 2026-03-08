import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MapPin, ArrowLeft, Building2, Users, Wrench, Calendar, BookOpen, Trash2, Pencil, CheckCircle, Clock, AlertTriangle, Upload, X, GripVertical, DoorOpen, Home } from "lucide-react";
import { useNavigation } from "@/contexts/NavigationContext";
import { imageUrl } from "@/lib/imageUrl";
import { toast } from "sonner";

type PropertyStatus = "occupied" | "vacant" | "maintenance" | "under_construction";

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
  sort_order: number;
  occupied_by: string | null;
  occupied_by_profile_id: string | null;
  occupied_by_profile_ids?: string[];
}

interface OccupantProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  level: string | null;
}

const STATUS_CONFIG: Record<PropertyStatus, { label: string; color: string; icon: React.ReactNode }> = {
  occupied:          { label: "Occupied",          color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: <CheckCircle size={12} /> },
  vacant:            { label: "Vacant",            color: "bg-muted text-muted-foreground border-border",             icon: <Clock size={12} /> },
  maintenance:       { label: "Maintenance",       color: "bg-amber-500/20 text-amber-400 border-amber-500/30",       icon: <AlertTriangle size={12} /> },
  under_construction:{ label: "Under Construction",color: "bg-orange-500/20 text-orange-400 border-orange-500/30",   icon: <Wrench size={12} /> },
};

const PROPERTY_SUB_SECTIONS = [
  { key: "tasks",       label: "Tasks",       icon: <CheckCircle size={20} />,  description: "Open & assigned tasks" },
  { key: "maintenance", label: "Maintenance", icon: <Wrench size={20} />,       description: "Issues & requests" },
  { key: "staff",       label: "Users",       icon: <Users size={20} />,        description: "Assigned people" },
  { key: "occupants",   label: "Occupants",   icon: <Home size={20} />,         description: "Who's staying here" },
  { key: "rooms",       label: "Rooms",       icon: <DoorOpen size={20} />,     description: "Manage property rooms" },
  { key: "checklists",  label: "Checklists",  icon: <BookOpen size={20} />,     description: "SOPs & procedures" },
  { key: "manuals",     label: "Manuals",     icon: <BookOpen size={20} />,     description: "Care guides & rules" },
  { key: "calendar",    label: "Schedule",    icon: <Calendar size={20} />,     description: "Events & bookings" },
];

const emptyForm = {
  name: "", address: "", city: "", country: "",
  timezone: "America/Los_Angeles", status: "vacant" as PropertyStatus,
  image_url: "", is_primary: false,
};

export function PropertySection() {
  const { isMasterAdmin, assignedPropertyIds, loading: permLoading } = usePermissions();
  const {
    setActiveSection,
    targetPropertyId, setTargetPropertyId,
    setChecklistsForPropertyId,
    activePropertyId, setActivePropertyId,
  } = useNavigation();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [allProfiles, setAllProfiles] = useState<OccupantProfile[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);

  // Drag reorder state
  const dragIndexRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, avatar_url, level").order("full_name")
      .then(({ data }) => setAllProfiles((data as OccupantProfile[]) ?? []));
  }, []);

  useEffect(() => {
    if (!permLoading) fetchProperties();
  }, [permLoading, isMasterAdmin, assignedPropertyIds]);

  // Auto-select property when navigated from Dashboard OR when back-nav restores activePropertyId
  useEffect(() => {
    if (properties.length === 0) return;
    const idToRestore = targetPropertyId ?? activePropertyId;
    if (idToRestore) {
      const found = properties.find(p => p.id === idToRestore);
      if (found) {
        setSelectedProperty(found);
        setTargetPropertyId(null);
      }
    }
  }, [targetPropertyId, activePropertyId, properties]);

  async function fetchProperties() {
    setLoading(true);
    let query = supabase.from("properties").select("*").order("sort_order").order("name");
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
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    setProperties(sorted);
    // Refresh selected property if open
    setSelectedProperty(prev => prev ? (sorted.find(p => p.id === prev.id) ?? prev) : null);
    setLoading(false);
  }

  function openAdd() {
    setForm(emptyForm);
    setEditingProperty(null);
    setShowForm(true);
  }

  function openEdit(p: Property) {
    setForm({
      name: p.name, address: p.address, city: p.city || "",
      country: p.country || "", timezone: p.timezone, status: p.status,
      image_url: p.image_url || "", is_primary: p.is_primary,
    });
    setEditingProperty(p);
    setShowForm(true);
  }

  async function saveProperty() {
    setSaving(true);
    const payload = {
      name: form.name, address: form.address, city: form.city || null,
      country: form.country || null, timezone: form.timezone, status: form.status,
      image_url: form.image_url || null, is_primary: form.is_primary,
    };
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
    if (selectedProperty?.id === deleteTarget.id) { setSelectedProperty(null); setActivePropertyId(null); }
    fetchProperties();
  }

  // ── Drag to reorder ──────────────────────────────────────────────────────
  function handleDragStart(index: number) {
    dragIndexRef.current = index;
    setDragging(index);
  }

  function handleDragEnter(index: number) {
    setDragOver(index);
  }

  async function handleDragEnd() {
    const from = dragIndexRef.current;
    const to = dragOver;
    setDragging(null);
    setDragOver(null);
    dragIndexRef.current = null;
    if (from === null || to === null || from === to) return;

    const reordered = [...properties];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setProperties(reordered);

    const updates = reordered.map((p, i) =>
      supabase.from("properties").update({ sort_order: i }).eq("id", p.id)
    );
    await Promise.all(updates);
  }

  // — Detail view —
  if (selectedProperty) {
    return (
      <>
        <PropertyDetail
          property={selectedProperty}
          isMasterAdmin={isMasterAdmin}
          allProfiles={allProfiles}
          onBack={() => { setSelectedProperty(null); setActivePropertyId(null); }}
          onEdit={() => openEdit(selectedProperty)}
          onDelete={() => setDeleteTarget(selectedProperty)}
          onOccupantsChange={fetchProperties}
          onNavigate={(key) => {
            if (key === "checklists") {
              setChecklistsForPropertyId(selectedProperty.id);
              setActivePropertyId(selectedProperty.id);
              setSelectedProperty(null);
              setActiveSection("checklists");
            } else if (key === "manuals") {
              setActivePropertyId(selectedProperty.id);
              setSelectedProperty(null);
              setActiveSection("manuals");
            } else if (key === "tasks") {
              setActivePropertyId(selectedProperty.id);
              setSelectedProperty(null);
              setActiveSection("tasks");
            } else if (key === "maintenance") {
              setActivePropertyId(selectedProperty.id);
              setSelectedProperty(null);
              setActiveSection("maintenance");
            } else if (key === "calendar") {
              setActivePropertyId(selectedProperty.id);
              setSelectedProperty(null);
              setActiveSection("calendar");
            } else if (key === "staff") {
              // handled inside PropertyDetail
            } else {
              setSelectedProperty(null);
              setActiveSection(key as any);
            }
          }}
        />

        <PropertyFormDialog
          open={showForm}
          editing={!!editingProperty}
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={saveProperty}
          onClose={() => setShowForm(false)}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteProperty} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // — List view —
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{properties.length} propert{properties.length === 1 ? "y" : "ies"}</p>
          {isMasterAdmin && properties.length > 1 && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">Hold and drag to reorder</p>
          )}
        </div>
        {isMasterAdmin && (
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus size={15} /> Add Property
          </Button>
        )}
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {properties.map((p, i) => (
            <div
              key={p.id}
              draggable={isMasterAdmin}
              onDragStart={() => handleDragStart(i)}
              onDragEnter={() => handleDragEnter(i)}
              onDragOver={e => e.preventDefault()}
              onDragEnd={handleDragEnd}
              className={`transition-all ${dragging === i ? "opacity-40 scale-95" : ""} ${dragOver === i && dragging !== i ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl" : ""}`}
            >
              <PropertyTile
                property={p}
                isMasterAdmin={isMasterAdmin}
                allProfiles={allProfiles}
                onClick={() => { setSelectedProperty(p); setActivePropertyId(p.id); }}
                onEdit={(e) => { e.stopPropagation(); openEdit(p); }}
                onDelete={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
              />
            </div>
          ))}
        </div>
      )}

      <PropertyFormDialog
        open={showForm}
        editing={!!editingProperty}
        form={form}
        setForm={setForm}
        saving={saving}
        onSave={saveProperty}
        onClose={() => setShowForm(false)}
      />

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
function PropertyTile({ property: p, isMasterAdmin, allProfiles, onClick, onEdit, onDelete }: {
  property: Property; isMasterAdmin: boolean; allProfiles: OccupantProfile[];
  onClick: () => void; onEdit: (e: React.MouseEvent) => void; onDelete: (e: React.MouseEvent) => void;
}) {
  const cfg = STATUS_CONFIG[p.status];
  const occupantNames = (p.occupied_by_profile_ids ?? [])
    .map(id => allProfiles.find(pr => pr.id === id)?.full_name)
    .filter(Boolean)
    .join(", ");
  return (
    <button
      onClick={onClick}
      className="relative w-full rounded-2xl overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary group"
      style={{ height: 220 }}
    >
      {p.image_url ? (
        <img src={imageUrl(p.image_url, 800, 440)} alt={p.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
          <Building2 size={48} className="text-muted-foreground/40" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      <div className="absolute top-3 left-3 flex flex-col gap-1">
        {p.is_primary && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border backdrop-blur-sm bg-primary/80 text-primary-foreground border-primary/60">
            ★ Primary
          </span>
        )}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
        {p.status === "occupied" && occupantNames && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm bg-black/50 text-white border-white/20">
            {occupantNames}
          </span>
        )}
      </div>

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

      {isMasterAdmin && (
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-60 transition-opacity">
          <GripVertical size={16} className="text-white" />
        </div>
      )}

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

// ─── Property Staff List ──────────────────────────────────────────────────────
interface StaffProfile {
  id: string;
  full_name: string | null;
  job_title: string | null;
  department: string | null;
  avatar_url: string | null;
}

function PropertyStaffList({ propertyId, onBack }: { propertyId: string; onBack: () => void }) {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, job_title, department, avatar_url")
      .contains("assigned_property_ids", [propertyId])
      .order("full_name")
      .then(({ data }) => { setStaff((data as StaffProfile[]) ?? []); setLoading(false); });
  }, [propertyId]);

  return (
    <div className="p-4 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft size={15} /> Back to property
      </button>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Assigned Users</p>
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : staff.length === 0 ? (
        <div className="rounded-xl bg-card border border-dashed border-border p-8 text-center">
          <Users size={28} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground">No staff assigned</p>
          <p className="text-xs text-muted-foreground mt-1">Assign staff to this property via the team management section.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map(s => (
            <div key={s.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {s.avatar_url
                  ? <img src={imageUrl(s.avatar_url, 80, 80)} alt={s.full_name ?? ""} loading="lazy" className="w-full h-full object-cover" />
                  : <span className="text-sm font-semibold text-primary">{(s.full_name ?? "?")[0]}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{s.full_name ?? "Unknown"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[s.job_title, s.department].filter(Boolean).join(" · ") || "No role assigned"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Occupants Manager (multi-select, full-panel) ────────────────────────────
function PropertyOccupantsManager({ property, isMasterAdmin, onBack, onChanged }: {
  property: Property;
  isMasterAdmin: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [profiles, setProfiles] = useState<OccupantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const currentIds: string[] = Array.isArray(property.occupied_by_profile_ids)
    ? property.occupied_by_profile_ids
    : property.occupied_by_profile_id ? [property.occupied_by_profile_id] : [];

  const [selected, setSelected] = useState<Set<string>>(new Set(currentIds));

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, level")
      .order("full_name")
      .then(({ data }) => { setProfiles((data as OccupantProfile[]) ?? []); setLoading(false); });
  }, []);

  function toggle(id: string) {
    if (!isMasterAdmin) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const newIds = Array.from(selected);
    const names = newIds
      .map(id => profiles.find(p => p.id === id)?.full_name)
      .filter(Boolean)
      .join(", ");
    await supabase.from("properties").update({
      occupied_by_profile_ids: newIds,
      occupied_by_profile_id: newIds[0] ?? null,
      occupied_by: names || null,
      status: newIds.length > 0 ? "occupied" : property.status === "occupied" ? "vacant" : property.status,
    } as any).eq("id", property.id);
    setSaving(false);
    onChanged();
    onBack();
    toast.success("Occupants updated");
  }

  const hasChanges = (() => {
    const cur = new Set(currentIds);
    if (cur.size !== selected.size) return true;
    for (const id of selected) if (!cur.has(id)) return true;
    return false;
  })();

  return (
    <div className="flex flex-col min-h-[calc(100vh-7rem)]">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-lg text-foreground">Occupants</h2>
          <p className="text-xs text-muted-foreground">{property.name}</p>
        </div>
        {isMasterAdmin && (
          <Button size="sm" onClick={save} disabled={!hasChanges || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      <div className="p-4 space-y-2 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No profiles found.</div>
        ) : (
          profiles.map(profile => {
            const isSelected = selected.has(profile.id);
            return (
              <button
                key={profile.id}
                onClick={() => toggle(profile.id)}
                disabled={!isMasterAdmin}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                  isSelected
                    ? "bg-primary/10 border-primary/40"
                    : "bg-card border-border hover:border-primary/20 hover:bg-accent"
                } ${!isMasterAdmin ? "cursor-default" : "cursor-pointer"}`}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {profile.avatar_url
                    ? <img src={imageUrl(profile.avatar_url, 80, 80)} alt={profile.full_name ?? ""} className="w-full h-full object-cover" />
                    : <span className="text-sm font-semibold text-primary">{(profile.full_name ?? "?")[0]}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profile.full_name ?? "Unknown"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{profile.level ?? "staff"}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                }`}>
                  {isSelected && <CheckCircle size={12} className="text-primary-foreground" />}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Property Detail ──────────────────────────────────────────────────────────
function PropertyDetail({ property: p, isMasterAdmin, onBack, onEdit, onDelete, onOccupantsChange, onNavigate }: {
function PropertyDetail({ property: p, isMasterAdmin, allProfiles, onBack, onEdit, onDelete, onOccupantsChange, onNavigate }: {
  property: Property; isMasterAdmin: boolean; allProfiles: OccupantProfile[];
  onBack: () => void; onEdit: () => void; onDelete: () => void;
  onOccupantsChange: () => void;
  onNavigate: (key: string) => void;
}) {
  const [showStaff, setShowStaff] = useState(false);
  const [showRooms, setShowRooms] = useState(false);
  const [showOccupants, setShowOccupants] = useState(false);
  const cfg = STATUS_CONFIG[p.status];
  const occupantNames = (p.occupied_by_profile_ids ?? [])
    .map(id => allProfiles.find(pr => pr.id === id)?.full_name)
    .filter(Boolean)
    .join(", ");

  if (showStaff) {
    return <PropertyStaffList propertyId={p.id} onBack={() => setShowStaff(false)} />;
  }

  if (showRooms) {
    return <PropertyRoomsManager property={p} onBack={() => setShowRooms(false)} />;
  }

  if (showOccupants) {
    return (
      <PropertyOccupantsManager
        property={p}
        isMasterAdmin={isMasterAdmin}
        onBack={() => setShowOccupants(false)}
        onChanged={onOccupantsChange}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-7rem)]">
      <div className="relative h-64 shrink-0">
        {p.image_url ? (
          <img src={imageUrl(p.image_url, 800, 512)} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center">
            <Building2 size={56} className="text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        <button onClick={onBack} className="absolute top-3 left-3 p-2 rounded-xl bg-black/50 backdrop-blur-sm text-white">
          <ArrowLeft size={18} />
        </button>

        {isMasterAdmin && (
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-2 rounded-xl bg-black/50 backdrop-blur-sm text-white hover:bg-black/70"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-2 rounded-xl bg-black/50 backdrop-blur-sm text-white hover:bg-destructive"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
            {p.status === "occupied" && p.occupied_by && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm bg-black/50 text-white border-white/20">
                {p.occupied_by}
              </span>
            )}
          </div>
          <h2 className="text-white text-2xl font-bold">{p.name}</h2>
          <p className="text-white/70 text-sm flex items-center gap-1 mt-0.5">
            <MapPin size={12} /> {[p.address, p.city, p.country].filter(Boolean).join(", ")}
          </p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-4 flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Sections</p>
        <div className="grid grid-cols-2 gap-3">
          {PROPERTY_SUB_SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => {
                if (s.key === "staff") setShowStaff(true);
                else if (s.key === "rooms") setShowRooms(true);
                else if (s.key === "occupants") setShowOccupants(true);
                else onNavigate(s.key);
              }}
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
          <button type="button" onClick={() => onChange("")} className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors">
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
          className={`w-full h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${dragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"}`}
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

// ─── Timezone Select ─────────────────────────────────────────────────────────
const CITY_ALIASES: Record<string, string> = {
  miami: "America/New_York", "fort lauderdale": "America/New_York", orlando: "America/New_York",
  jacksonville: "America/New_York", tampa: "America/New_York", atlanta: "America/New_York",
  boston: "America/New_York", "new york": "America/New_York", nyc: "America/New_York",
  philadelphia: "America/New_York", washington: "America/New_York", dc: "America/New_York",
  charlotte: "America/New_York", detroit: "America/Detroit",
  chicago: "America/Chicago", houston: "America/Chicago", dallas: "America/Chicago",
  "new orleans": "America/Chicago", minneapolis: "America/Chicago", milwaukee: "America/Chicago",
  denver: "America/Denver", "salt lake city": "America/Denver", boise: "America/Boise",
  phoenix: "America/Phoenix", tucson: "America/Phoenix",
  "los angeles": "America/Los_Angeles", la: "America/Los_Angeles", "san francisco": "America/Los_Angeles",
  seattle: "America/Los_Angeles", portland: "America/Los_Angeles", "las vegas": "America/Los_Angeles",
  "san diego": "America/Los_Angeles",
  anchorage: "America/Anchorage", honolulu: "Pacific/Honolulu", hawaii: "Pacific/Honolulu",
  toronto: "America/Toronto", montreal: "America/Toronto", ottawa: "America/Toronto",
  vancouver: "America/Vancouver", calgary: "America/Edmonton", edmonton: "America/Edmonton",
  "mexico city": "America/Mexico_City", guadalajara: "America/Mexico_City",
  bogota: "America/Bogota", lima: "America/Lima", santiago: "America/Santiago",
  "sao paulo": "America/Sao_Paulo", "rio de janeiro": "America/Sao_Paulo",
  "buenos aires": "America/Argentina/Buenos_Aires", caracas: "America/Caracas",
  london: "Europe/London", dublin: "Europe/Dublin", edinburgh: "Europe/London",
  lisbon: "Europe/Lisbon", paris: "Europe/Paris", berlin: "Europe/Berlin",
  madrid: "Europe/Madrid", barcelona: "Europe/Madrid", rome: "Europe/Rome",
  milan: "Europe/Rome", amsterdam: "Europe/Amsterdam", brussels: "Europe/Brussels",
  vienna: "Europe/Vienna", zurich: "Europe/Zurich", geneva: "Europe/Zurich",
  stockholm: "Europe/Stockholm", oslo: "Europe/Oslo", copenhagen: "Europe/Copenhagen",
  helsinki: "Europe/Helsinki", warsaw: "Europe/Warsaw", prague: "Europe/Prague",
  budapest: "Europe/Budapest", bucharest: "Europe/Bucharest", athens: "Europe/Athens",
  istanbul: "Europe/Istanbul", moscow: "Europe/Moscow", kyiv: "Europe/Kyiv",
  dubai: "Asia/Dubai", "abu dhabi": "Asia/Dubai", riyadh: "Asia/Riyadh",
  karachi: "Asia/Karachi", lahore: "Asia/Karachi",
  mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata", bangalore: "Asia/Kolkata", india: "Asia/Kolkata",
  dhaka: "Asia/Dhaka", colombo: "Asia/Colombo", kathmandu: "Asia/Kathmandu",
  bangkok: "Asia/Bangkok", jakarta: "Asia/Jakarta", bali: "Asia/Makassar",
  singapore: "Asia/Singapore", "kuala lumpur": "Asia/Kuala_Lumpur", kl: "Asia/Kuala_Lumpur",
  manila: "Asia/Manila", "hong kong": "Asia/Hong_Kong", hk: "Asia/Hong_Kong",
  shanghai: "Asia/Shanghai", beijing: "Asia/Shanghai", taipei: "Asia/Taipei",
  seoul: "Asia/Seoul", tokyo: "Asia/Tokyo", osaka: "Asia/Tokyo",
  sydney: "Australia/Sydney", melbourne: "Australia/Melbourne", brisbane: "Australia/Brisbane",
  perth: "Australia/Perth", adelaide: "Australia/Adelaide",
  auckland: "Pacific/Auckland", fiji: "Pacific/Fiji",
  cairo: "Africa/Cairo", johannesburg: "Africa/Johannesburg",
  "cape town": "Africa/Johannesburg", lagos: "Africa/Lagos", nairobi: "Africa/Nairobi",
};

const ALL_TIMEZONES: string[] = (() => {
  try { return (Intl as any).supportedValuesOf("timeZone") as string[]; } catch {
    return [
      "Africa/Abidjan","Africa/Accra","Africa/Algiers","Africa/Cairo","Africa/Casablanca",
      "Africa/Johannesburg","Africa/Lagos","Africa/Nairobi","Africa/Tripoli","Africa/Tunis",
      "America/Anchorage","America/Argentina/Buenos_Aires","America/Bogota","America/Chicago",
      "America/Denver","America/Detroit","America/Edmonton","America/Halifax",
      "America/Indiana/Indianapolis","America/Lima","America/Los_Angeles","America/Mexico_City",
      "America/New_York","America/Phoenix","America/Regina","America/Santiago",
      "America/Sao_Paulo","America/St_Johns","America/Toronto","America/Vancouver",
      "America/Winnipeg","Asia/Almaty","Asia/Amman","Asia/Baghdad","Asia/Baku",
      "Asia/Bangkok","Asia/Beirut","Asia/Colombo","Asia/Dhaka","Asia/Dubai",
      "Asia/Ho_Chi_Minh","Asia/Hong_Kong","Asia/Jakarta","Asia/Jerusalem",
      "Asia/Kabul","Asia/Karachi","Asia/Kathmandu","Asia/Kolkata","Asia/Krasnoyarsk",
      "Asia/Kuala_Lumpur","Asia/Makassar","Asia/Manila","Asia/Muscat","Asia/Nicosia",
      "Asia/Novosibirsk","Asia/Omsk","Asia/Riyadh","Asia/Seoul","Asia/Shanghai",
      "Asia/Singapore","Asia/Taipei","Asia/Tashkent","Asia/Tehran","Asia/Tokyo",
      "Asia/Ulaanbaatar","Asia/Vladivostok","Asia/Yakutsk","Asia/Yangon","Asia/Yekaterinburg",
      "Atlantic/Azores","Atlantic/Cape_Verde","Atlantic/Reykjavik","Atlantic/South_Georgia",
      "Australia/Adelaide","Australia/Brisbane","Australia/Darwin","Australia/Melbourne",
      "Australia/Perth","Australia/Sydney","Europe/Amsterdam","Europe/Athens","Europe/Belgrade",
      "Europe/Berlin","Europe/Brussels","Europe/Bucharest","Europe/Budapest","Europe/Copenhagen",
      "Europe/Dublin","Europe/Helsinki","Europe/Istanbul","Europe/Kyiv","Europe/Lisbon",
      "Europe/London","Europe/Luxembourg","Europe/Madrid","Europe/Malta","Europe/Moscow",
      "Europe/Oslo","Europe/Paris","Europe/Prague","Europe/Riga","Europe/Rome",
      "Europe/Sofia","Europe/Stockholm","Europe/Tallinn","Europe/Vienna","Europe/Vilnius",
      "Europe/Warsaw","Europe/Zurich","Pacific/Auckland","Pacific/Fiji","Pacific/Guam",
      "Pacific/Honolulu","Pacific/Noumea","Pacific/Pago_Pago","Pacific/Port_Moresby",
      "Pacific/Tahiti","UTC",
    ];
  }
})();

function formatTzLabel(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  try {
    const offset = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? "";
    return `${city}  ·  ${offset}`;
  } catch { return city; }
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = (() => {
    if (!search.trim()) return ALL_TIMEZONES;
    const q = search.trim().toLowerCase();
    const aliasMatch = CITY_ALIASES[q];
    const matches = ALL_TIMEZONES.filter(tz =>
      tz.toLowerCase().includes(q) ||
      tz.split("/").pop()?.toLowerCase().replace(/_/g, " ").includes(q)
    );
    if (aliasMatch && !matches.includes(aliasMatch)) return [aliasMatch, ...matches];
    if (aliasMatch && matches[0] !== aliasMatch) return [aliasMatch, ...matches.filter(m => m !== aliasMatch)];
    return matches;
  })();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{value ? formatTzLabel(value) : "Select timezone…"}</span>
        <svg className="h-4 w-4 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <Input ref={inputRef} placeholder="Search city or timezone…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No timezones found</p>
            ) : (
              filtered.slice(0, 150).map(tz => (
                <button
                  key={tz}
                  type="button"
                  onClick={() => { onChange(tz); setSearch(""); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center justify-between ${tz === value ? "bg-accent text-accent-foreground font-medium" : "text-foreground"}`}
                >
                  <span>{tz.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground text-[10px]">{
                    (() => { try { return new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? ""; } catch { return ""; } })()
                  }</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Form Dialog ──────────────────────────────────────────────────────────────
function PropertyFormDialog({ open, editing, form, setForm, saving, onSave, onClose }: {
  open: boolean; editing: boolean;
  form: typeof emptyForm; setForm: (f: typeof emptyForm) => void;
  saving: boolean; onSave: () => void; onClose: () => void;
}) {
  const set = (key: keyof typeof emptyForm, val: string | boolean) => setForm({ ...form, [key]: val });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Property" : "Add Property"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 overflow-y-auto flex-1">
          <PropertyImageUploader value={form.image_url} onChange={url => set("image_url", url)} />
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Villa Ronin" />
          </div>
          <div className="space-y-1">
            <Label>Address *</Label>
            <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="123 Ocean Drive" autoComplete="street-address" />
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
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="occupied">Occupied</SelectItem>
                <SelectItem value="vacant">Vacant</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="under_construction">Under Construction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Timezone</Label>
            <TimezoneSelect value={form.timezone} onChange={v => set("timezone", v)} />
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, is_primary: !form.is_primary })}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
              form.is_primary ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted/30 border-border text-muted-foreground hover:border-primary/30"
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

// ─── Property Rooms Manager ───────────────────────────────────────────────────
function PropertyRoomsManager({ property, onBack }: { property: Property; onBack: () => void }) {
  const [rooms, setRooms] = useState<{ id: string; name: string; sort_order: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoom, setNewRoom] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("property_rooms" as any)
      .select("id, name, sort_order")
      .eq("property_id", property.id)
      .order("sort_order");
    setRooms(((data ?? []) as unknown) as { id: string; name: string; sort_order: number }[]);
    setLoading(false);
  }, [property.id]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const handleAdd = async () => {
    if (!newRoom.trim()) return;
    setSaving(true);
    await supabase.from("property_rooms" as any).insert({
      property_id: property.id,
      name: newRoom.trim(),
      sort_order: rooms.length,
    });
    setNewRoom("");
    await fetchRooms();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("property_rooms" as any).delete().eq("id", id);
    setDeleteId(null);
    await fetchRooms();
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-7rem)]">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="font-display text-lg text-foreground">Rooms</h2>
          <p className="text-xs text-muted-foreground">{property.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="flex gap-2">
          <input
            value={newRoom}
            onChange={e => setNewRoom(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
            placeholder="e.g. Master Bedroom, Kitchen, Pool…"
            style={{ fontSize: "16px" }}
            className="flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
          <button
            onClick={handleAdd}
            disabled={!newRoom.trim() || saving}
            className="flex items-center gap-1.5 bg-gold/90 hover:bg-gold disabled:opacity-50 text-charcoal text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-2xl bg-card border border-dashed border-border p-8 text-center">
            <DoorOpen size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm font-medium text-foreground">No rooms yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add rooms above so staff can select them when logging issues.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map(room => (
              <div key={room.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                <DoorOpen size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm text-foreground font-medium">{room.name}</span>
                <button
                  onClick={() => setDeleteId(room.id)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove room?</AlertDialogTitle>
            <AlertDialogDescription>
              This room will no longer appear in the issue report form.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
