import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { imageUrl } from "@/lib/imageUrl";
import { sortProperties } from "@/hooks/useScopedProperties";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, ChevronLeft, ChevronRight, Car, Plus, X,
  Droplets, Sparkles, MapPin, User, Clock, CheckCircle2,
  Loader2, Upload, Pencil, Trash2, ChevronDown, Calendar,
} from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from "date-fns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Property { id: string; name: string; }
interface Profile  { id: string; full_name: string | null; avatar_url: string | null; job_title: string | null; }

interface Vehicle {
  id: string;
  make: string;
  model: string;
  colour: string | null;
  year: number | null;
  owner_profile_id: string | null;
  property_id: string | null;
  photo_url: string | null;
  notes: string | null;
  sort_order: number;
  ownerProfile?: Profile | null;
  locationProperty?: Property | null;
}

interface Booking {
  id: string;
  vehicle_id: string;
  requested_date: string;
  requested_time: string | null;
  wash_type: string;
  location_property_id: string | null;
  assigned_staff_id: string | null;
  status: string;
  notes: string | null;
  vehicle?: Vehicle;
  locationProperty?: Property | null;
  assignedStaff?: Profile | null;
}

const WASH_TYPES = [
  { key: "quick_wash",  label: "Quick Wash",  icon: <Droplets size={16} />,  desc: "Rinse, wash & dry" },
  { key: "full_detail", label: "Full Detail",  icon: <Sparkles size={16} />,  desc: "Full inside & out" },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  requested:  { label: "Requested",  bg: "bg-amber-500/15",  text: "text-amber-400",  dot: "bg-amber-400" },
  confirmed:  { label: "Confirmed",  bg: "bg-blue-500/15",   text: "text-blue-400",   dot: "bg-blue-400" },
  completed:  { label: "Completed",  bg: "bg-green-500/15",  text: "text-green-400",  dot: "bg-green-400" },
  cancelled:  { label: "Cancelled",  bg: "bg-muted/40",      text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m}${hour < 12 ? "am" : "pm"}`;
}

// ── Vehicle Card ──────────────────────────────────────────────────────────────

function VehicleCard({
  vehicle, onWash, onEdit, canEdit,
}: {
  vehicle: Vehicle;
  onWash: (v: Vehicle) => void;
  onEdit: (v: Vehicle) => void;
  canEdit: boolean;
}) {
  const img = vehicle.photo_url ? imageUrl(vehicle.photo_url, 600) : null;
  const owner = vehicle.ownerProfile?.full_name ?? null;
  const location = vehicle.locationProperty?.name ?? null;

  return (
    <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[4/3] group cursor-pointer border border-border">
      {/* Full-bleed photo or placeholder */}
      {img ? (
        <img
          src={img}
          alt={`${vehicle.make} ${vehicle.model}`}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/60">
          <Car size={48} className="text-muted-foreground/40" />
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Admin actions top-right */}
      {canEdit && (
        <div className="absolute top-2.5 right-2.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onEdit(vehicle); }}
            className="p-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors"
          >
            <Pencil size={13} />
          </button>
        </div>
      )}

      {/* Bottom info overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-6">
        <p className="text-white font-bold text-sm leading-tight truncate">
          {vehicle.make} {vehicle.model}
          {vehicle.year ? <span className="font-normal opacity-70 ml-1 text-xs">{vehicle.year}</span> : null}
        </p>
        {vehicle.colour && (
          <p className="text-white/70 text-xs mt-0.5">{vehicle.colour}</p>
        )}
        <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
          {owner && (
            <span className="flex items-center gap-1 text-[11px] text-white/70">
              <User size={10} /> {owner}
            </span>
          )}
          {location && (
            <span className="flex items-center gap-1 text-[11px] text-white/70">
              <MapPin size={10} /> {location}
            </span>
          )}
        </div>

        {/* Wash button */}
        <button
          onClick={e => { e.stopPropagation(); onWash(vehicle); }}
          className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold/90 hover:bg-gold text-charcoal text-xs font-bold transition-colors"
        >
          <Droplets size={12} /> Wash
        </button>
      </div>
    </div>
  );
}

// ── Book Wash Drawer ──────────────────────────────────────────────────────────

function BookWashDrawer({
  vehicle, properties, onClose, onSaved, userId,
}: {
  vehicle: Vehicle;
  properties: Property[];
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const [washType, setWashType] = useState<"quick_wash" | "full_detail">("quick_wash");
  const [date, setDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const img = vehicle.photo_url ? imageUrl(vehicle.photo_url, 128) : null;

  async function handleSave() {
    setSaving(true);
    const { error } = await db.from("car_wash_bookings").insert({
      vehicle_id: vehicle.id,
      requested_date: date,
      requested_time: time || null,
      wash_type: washType,
      location_property_id: vehicle.property_id || null,
      status: "requested",
      notes: notes || null,
      requested_by: userId,
    });
    setSaving(false);
    if (error) { toast.error("Failed to book wash"); return; }
    toast.success("Wash request submitted!");
    onSaved();
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl animate-slide-in-bottom"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex flex-col h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted border border-border flex items-center justify-center">
                {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Car size={20} className="text-muted-foreground" />}
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Book a Wash</p>
                <p className="text-muted-foreground text-xs">{vehicle.year ? `${vehicle.year} ` : ""}{vehicle.make} {vehicle.model}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Wash type */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Service Type</p>
              <div className="grid grid-cols-2 gap-2">
                {WASH_TYPES.map(wt => (
                  <button
                    key={wt.key}
                    onClick={() => setWashType(wt.key as "quick_wash" | "full_detail")}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl border transition-all text-left ${
                      washType === wt.key
                        ? "border-gold/60 bg-gold/10 text-gold"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-gold/30"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-semibold text-sm">
                      {wt.icon} {wt.label}
                    </span>
                    <span className="text-[11px] opacity-70">{wt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Preferred Date
                </label>
                <input
                  type="date"
                  value={date}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={e => setDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Preferred Time
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special instructions…"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gold/40 placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={saving || !date}
              className="w-full bg-gold hover:bg-gold/90 text-charcoal font-bold h-11"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <><Droplets size={16} /> Request Wash</>}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Vehicle Form Modal ─────────────────────────────────────────────────────────

function VehicleFormModal({
  vehicle, properties, profiles, onClose, onSaved,
}: {
  vehicle: Vehicle | null;
  properties: Property[];
  profiles: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [make, setMake] = useState(vehicle?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [colour, setColour] = useState(vehicle?.colour ?? "");
  const [year, setYear] = useState(vehicle?.year?.toString() ?? "");
  const [ownerId, setOwnerId] = useState(vehicle?.owner_profile_id ?? "");
  const [propId, setPropId] = useState(vehicle?.property_id ?? "");
  const [notes, setNotes] = useState(vehicle?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(vehicle?.photo_url ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadPhoto(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("vehicles").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("vehicles").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    }
    setUploading(false);
  }

  async function handleSave() {
    if (!make.trim() || !model.trim()) return;
    setSaving(true);
    const payload = {
      make: make.trim(),
      model: model.trim(),
      colour: colour.trim() || null,
      year: year ? parseInt(year, 10) : null,
      owner_profile_id: ownerId || null,
      property_id: propId || null,
      photo_url: photoUrl || null,
      notes: notes.trim() || null,
    };
    let error;
    if (vehicle) {
      ({ error } = await db.from("vehicles").update(payload).eq("id", vehicle.id));
    } else {
      ({ error } = await db.from("vehicles").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error("Failed to save vehicle"); return; }
    toast.success(vehicle ? "Vehicle updated" : "Vehicle added");
    onSaved();
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex flex-col h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <p className="font-semibold text-foreground">{vehicle ? "Edit Vehicle" : "Add Vehicle"}</p>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Photo */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Photo</p>
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full h-36 rounded-xl border-2 border-dashed border-border bg-muted/20 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gold/40 transition-colors overflow-hidden"
              >
                {photoUrl ? (
                  <img src={imageUrl(photoUrl, 800)} alt="" className="w-full h-full object-cover" />
                ) : uploading ? (
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Upload size={24} className="text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Tap to upload photo</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
            </div>

            {/* Make & Model */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Make *</label>
                <input value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. Range Rover"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gold/40" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Model *</label>
                <input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Autobiography"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gold/40" />
              </div>
            </div>

            {/* Colour & Year */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Colour</label>
                <input value={colour} onChange={e => setColour(e.target.value)} placeholder="e.g. Midnight Black"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gold/40" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Year</label>
                <input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2024"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-gold/40" />
              </div>
            </div>

            {/* Owner */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Owner</label>
              <div className="relative">
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
                  className="w-full h-10 pl-3 pr-8 rounded-lg border border-border bg-background text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-gold/40">
                  <option value="">Select owner…</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? "Unknown"}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Location (property) */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Kept at Property</label>
              <div className="relative">
                <select value={propId} onChange={e => setPropId(e.target.value)}
                  className="w-full h-10 pl-3 pr-8 rounded-lg border border-border bg-background text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-gold/40">
                  <option value="">Select property…</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any notes about this vehicle…"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gold/40 placeholder:text-muted-foreground" />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-border">
            <Button onClick={handleSave} disabled={saving || !make || !model}
              className="w-full bg-gold hover:bg-gold/90 text-charcoal font-bold h-11">
              {saving ? <Loader2 size={16} className="animate-spin" /> : vehicle ? "Save Changes" : "Add Vehicle"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Schedule View ─────────────────────────────────────────────────────────────

function ScheduleView({
  bookings, profiles, properties, canEdit, onRefresh, onClose,
}: {
  bookings: Booking[];
  profiles: Profile[];
  properties: Property[];
  canEdit: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Filter bookings for the current week
  const weekBookings = bookings.filter(b => {
    const d = parseISO(b.requested_date);
    return d >= weekStart && d <= days[6];
  });

  const bookingsForDay = (day: Date) =>
    weekBookings.filter(b => isSameDay(parseISO(b.requested_date), day));

  const statusCfg = (status: string) => STATUS_CONFIG[status] ?? STATUS_CONFIG.requested;

  async function handleStatusChange(booking: Booking, status: string) {
    const update: Record<string, unknown> = { status };
    if (status === "completed") update.completed_at = new Date().toISOString();
    const { error } = await db.from("car_wash_bookings").update(update).eq("id", booking.id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success(status === "completed" ? "Marked complete! 🚗✨" : "Status updated");
    onRefresh();
  }

  async function handleAssignStaff(bookingId: string, staffId: string) {
    const { error } = await db.from("car_wash_bookings")
      .update({ assigned_staff_id: staffId || null, status: "confirmed" })
      .eq("id", bookingId);
    if (error) { toast.error("Failed to assign"); return; }
    toast.success("Staff assigned & confirmed");
    onRefresh();
  }

  async function handleDelete(bookingId: string) {
    await db.from("car_wash_bookings").delete().eq("id", bookingId);
    onRefresh();
  }

  return (
    <div className="animate-fade-in">
      {/* Schedule header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-10">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={16} /> Fleet
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} />
          </button>
          <p className="text-sm font-semibold text-foreground min-w-[160px] text-center">
            {format(weekStart, "MMM d")} – {format(days[6], "MMM d, yyyy")}
          </p>
          <button onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="w-16" /> {/* spacer */}
      </div>

      <div className="px-4 py-4 space-y-3">
        {weekBookings.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-3">
              <CalendarDays size={28} className="text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">No washes this week</p>
            <p className="text-muted-foreground text-sm mt-1">Bookings will appear here once submitted.</p>
          </div>
        )}

        {days.map(day => {
          const dayBookings = bookingsForDay(day);
          if (dayBookings.length === 0) return null;
          return (
            <div key={day.toISOString()}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {isSameDay(day, new Date()) ? "Today" : format(day, "EEEE, MMM d")}
              </p>
              <div className="space-y-2">
                {dayBookings.map(booking => {
                  const scfg = statusCfg(booking.status);
                  const vehicleName = booking.vehicle
                    ? `${booking.vehicle.year ? booking.vehicle.year + " " : ""}${booking.vehicle.make} ${booking.vehicle.model}`
                    : "Unknown Vehicle";
                  const vehicleImg = booking.vehicle?.photo_url ? imageUrl(booking.vehicle.photo_url, 96) : null;
                  return (
                    <div key={booking.id} className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Vehicle thumbnail */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
                          {vehicleImg
                            ? <img src={vehicleImg} alt="" className="w-full h-full object-cover" />
                            : <Car size={20} className="text-muted-foreground" />
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-foreground font-semibold text-sm truncate">{vehicleName}</p>
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${scfg.bg} ${scfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${scfg.dot}`} />
                              {scfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              {WASH_TYPES.find(w => w.key === booking.wash_type)?.icon}
                              {WASH_TYPES.find(w => w.key === booking.wash_type)?.label}
                            </span>
                            {booking.requested_time && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock size={10} /> {fmtTime(booking.requested_time)}
                              </span>
                            )}
                            {booking.locationProperty && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <MapPin size={10} /> {booking.locationProperty.name}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Delete */}
                        {canEdit && (
                          <button onClick={() => handleDelete(booking.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      {/* Admin controls */}
                      {canEdit && booking.status !== "completed" && booking.status !== "cancelled" && (
                        <div className="border-t border-border px-4 py-2.5 flex items-center gap-3 bg-muted/20">
                          {/* Assign staff */}
                          <div className="flex-1">
                            <div className="relative">
                              <select
                                value={booking.assigned_staff_id ?? ""}
                                onChange={e => handleAssignStaff(booking.id, e.target.value)}
                                className="w-full h-8 pl-3 pr-7 rounded-lg border border-border bg-background text-foreground text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-gold/40"
                              >
                                <option value="">Assign staff…</option>
                                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? "Unknown"}</option>)}
                              </select>
                              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>
                          {/* Complete button */}
                          <button
                            onClick={() => handleStatusChange(booking, "completed")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-semibold border border-green-500/30 transition-colors shrink-0"
                          >
                            <CheckCircle2 size={12} /> Complete
                          </button>
                        </div>
                      )}

                      {/* Completion info */}
                      {booking.status === "completed" && booking.assignedStaff && (
                        <div className="border-t border-border px-4 py-2 flex items-center gap-2 bg-green-500/5">
                          <CheckCircle2 size={12} className="text-green-400" />
                          <p className="text-[11px] text-muted-foreground">
                            Completed by <span className="text-foreground font-medium">{booking.assignedStaff.full_name}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export function CarWashSection() {
  const { userId, isMasterAdmin, isAdmin, isManager, canEdit: permCanEdit } = usePermissions();
  const canEdit = isMasterAdmin || isAdmin || isManager;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"fleet" | "schedule">("fleet");
  const [bookingVehicle, setBookingVehicle] = useState<Vehicle | null>(null);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null | undefined>(undefined); // undefined = closed, null = new

  // ── Load data ───────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    const [{ data: vData }, { data: bData }, { data: pData }, { data: prData }] = await Promise.all([
      db.from("vehicles").select("*").order("sort_order").order("created_at"),
      db.from("car_wash_bookings").select("*").gte("requested_date", format(subWeeks(new Date(), 4), "yyyy-MM-dd")).order("requested_date"),
      supabase.from("properties").select("id, name, is_primary").order("sort_order"),
      supabase.from("profiles").select("id, full_name, avatar_url, job_title").order("full_name"),
    ]);

    const props: Property[] = sortProperties((pData ?? []) as (Property & { is_primary?: boolean })[]);
    const profs: Profile[] = (prData ?? []) as Profile[];
    const profMap = Object.fromEntries(profs.map(p => [p.id, p]));
    const propMap = Object.fromEntries(props.map(p => [p.id, p]));

    const enrichedVehicles: Vehicle[] = ((vData ?? []) as Vehicle[]).map(v => ({
      ...v,
      ownerProfile: v.owner_profile_id ? (profMap[v.owner_profile_id] ?? null) : null,
      locationProperty: v.property_id ? (propMap[v.property_id] ?? null) : null,
    }));

    const enrichedBookings: Booking[] = ((bData ?? []) as Booking[]).map(b => ({
      ...b,
      vehicle: enrichedVehicles.find(v => v.id === b.vehicle_id),
      locationProperty: b.location_property_id ? (propMap[b.location_property_id] ?? null) : null,
      assignedStaff: b.assigned_staff_id ? (profMap[b.assigned_staff_id] ?? null) : null,
    }));

    setVehicles(enrichedVehicles);
    setBookings(enrichedBookings);
    setProperties(props);
    setProfiles(profs);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  // Upcoming count for badge
  const upcomingCount = bookings.filter(b =>
    b.status === "requested" || b.status === "confirmed"
  ).length;

  if (loading) return (
    <div className="px-4 py-4 space-y-3 animate-pulse">
      <div className="h-7 w-40 bg-muted rounded-lg" />
      {[1,2,3].map(i => <div key={i} className="h-20 bg-muted/40 rounded-xl" />)}
    </div>
  );

  // ── Schedule view ───────────────────────────────────────────────────────────
  if (view === "schedule") {
    return (
      <ScheduleView
        bookings={bookings}
        profiles={profiles}
        properties={properties}
        canEdit={canEdit}
        onRefresh={loadAll}
        onClose={() => setView("fleet")}
      />
    );
  }

  // ── Fleet view ──────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in pb-6">
      {/* Page header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-display text-xl font-bold">Fleet</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Schedule button */}
          <button
            onClick={() => setView("schedule")}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-medium border border-border transition-colors"
          >
            <Calendar size={14} />
            Schedule
            {upcomingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gold text-charcoal text-[9px] font-bold flex items-center justify-center">
                {upcomingCount}
              </span>
            )}
          </button>

          {/* Add vehicle */}
          {canEdit && (
            <button
              onClick={() => setEditVehicle(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold/20 hover:bg-gold/30 text-gold text-xs font-semibold border border-gold/30 transition-colors"
            >
              <Plus size={14} /> Add Vehicle
            </button>
          )}
        </div>
      </div>

      {/* Vehicle grid */}
      <div className="px-4">
        {vehicles.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-4">
              <Car size={36} className="text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold text-lg">No vehicles yet</p>
            <p className="text-muted-foreground text-sm mt-1 mb-4">Add the fleet to start booking washes.</p>
            {canEdit && (
              <Button onClick={() => setEditVehicle(null)} className="bg-gold hover:bg-gold/90 text-charcoal font-semibold">
                <Plus size={16} /> Add Vehicle
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {vehicles.map(v => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                onWash={setBookingVehicle}
                onEdit={setEditVehicle}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>

      {/* Book Wash Drawer */}
      {bookingVehicle && userId && (
        <BookWashDrawer
          vehicle={bookingVehicle}
          properties={properties}
          onClose={() => setBookingVehicle(null)}
          onSaved={loadAll}
          userId={userId}
        />
      )}

      {/* Vehicle Form Modal */}
      {editVehicle !== undefined && (
        <VehicleFormModal
          vehicle={editVehicle}
          properties={properties}
          profiles={profiles}
          onClose={() => setEditVehicle(undefined)}
          onSaved={loadAll}
        />
      )}
    </div>
  );
}
