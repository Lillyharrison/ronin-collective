import { useState, useRef, useEffect, useCallback } from "react";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, isToday, getDay, parseISO, isSameDay,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffSchedules, StaffSchedule, StaffShift, StaffLeaveRequest } from "@/hooks/useStaffSchedules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Settings2,
  CalendarOff, UserCheck, X, Check, Clock, Building2,
  Pencil, ChevronDown, ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
}

interface Property {
  id: string;
  name: string;
}

interface DisplayShift {
  key: string;
  staff_id: string;
  property_id: string | null;
  schedule_id: string | null;
  concrete_id: string | null;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
  is_virtual: boolean;
  is_leave: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPERTY_COLORS = [
  { bg: "bg-blue-500/15 border-blue-500/30",    text: "text-blue-400",    dot: "bg-blue-400" },
  { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-400" },
  { bg: "bg-purple-500/15 border-purple-500/30", text: "text-purple-400", dot: "bg-purple-400" },
  { bg: "bg-orange-500/15 border-orange-500/30", text: "text-orange-400", dot: "bg-orange-400" },
  { bg: "bg-pink-500/15 border-pink-500/30",    text: "text-pink-400",    dot: "bg-pink-400" },
  { bg: "bg-cyan-500/15 border-cyan-500/30",    text: "text-cyan-400",    dot: "bg-cyan-400" },
];

const LEAVE_TYPES = ["vacation", "sick", "personal", "public_holiday", "other"];
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m}${hour < 12 ? "am" : "pm"}`;
}

function propColor(propId: string | null, properties: Property[]) {
  if (!propId) return PROPERTY_COLORS[PROPERTY_COLORS.length - 1];
  const idx = properties.findIndex((p) => p.id === propId);
  return PROPERTY_COLORS[Math.abs(idx) % PROPERTY_COLORS.length];
}

// ── Build display shifts from schedules + concrete shifts + leave ──────────────

function buildDisplayShifts(
  weekDays: Date[],
  schedules: StaffSchedule[],
  concreteShifts: StaffShift[],
  leaveRequests: StaffLeaveRequest[]
): DisplayShift[] {
  const result: DisplayShift[] = [];

  for (const day of weekDays) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dow = getDay(day); // 0=Sun … 6=Sat

    // ─ Pattern-based shifts for this day ──────────────────────────────────────
    for (const sched of schedules) {
      if (sched.day_of_week !== dow) continue;
      if (!sched.is_active) continue;
      if (sched.effective_from > dateStr) continue;
      if (sched.effective_to && sched.effective_to < dateStr) continue;

      const staffId = sched.staff_id;

      // Approved leave → show leave block (deduplicate: only once per staff/day)
      const onLeave = leaveRequests.some(
        (lr) =>
          lr.staff_id === staffId &&
          lr.status === "approved" &&
          lr.start_date <= dateStr &&
          lr.end_date >= dateStr
      );
      if (onLeave) {
        if (!result.find((r) => r.staff_id === staffId && r.shift_date === dateStr && r.is_leave)) {
          result.push({
            key: `leave-${staffId}-${dateStr}`,
            staff_id: staffId,
            property_id: null,
            schedule_id: null,
            concrete_id: null,
            shift_date: dateStr,
            start_time: null,
            end_time: null,
            status: "leave",
            notes: null,
            is_virtual: false,
            is_leave: true,
          });
        }
        continue;
      }

      // Concrete override for this schedule + date?
      const override = concreteShifts.find(
        (s) => s.staff_id === staffId && s.shift_date === dateStr && s.schedule_id === sched.id
      );

      if (override?.status === "cancelled") continue; // cancelled for this specific day

      if (override?.status === "scheduled") {
        result.push({
          key: override.id,
          staff_id: staffId,
          property_id: override.property_id,
          schedule_id: sched.id,
          concrete_id: override.id,
          shift_date: dateStr,
          start_time: override.start_time ?? sched.start_time,
          end_time: override.end_time ?? sched.end_time,
          status: "scheduled",
          notes: override.notes,
          is_virtual: false,
          is_leave: false,
        });
        continue;
      }

      // Virtual shift from recurring pattern
      result.push({
        key: `virtual-${sched.id}-${dateStr}`,
        staff_id: staffId,
        property_id: sched.property_id,
        schedule_id: sched.id,
        concrete_id: null,
        shift_date: dateStr,
        start_time: sched.start_time,
        end_time: sched.end_time,
        status: "scheduled",
        notes: sched.notes,
        is_virtual: true,
        is_leave: false,
      });
    }

    // ─ Concrete one-off shifts (no schedule_id) ───────────────────────────────
    for (const shift of concreteShifts) {
      if (shift.shift_date !== dateStr || shift.schedule_id || shift.status !== "scheduled") continue;
      result.push({
        key: shift.id,
        staff_id: shift.staff_id,
        property_id: shift.property_id,
        schedule_id: null,
        concrete_id: shift.id,
        shift_date: dateStr,
        start_time: shift.start_time,
        end_time: shift.end_time,
        status: "scheduled",
        notes: shift.notes,
        is_virtual: false,
        is_leave: false,
      });
    }
  }

  return result;
}

// ── Shift Chip ────────────────────────────────────────────────────────────────

function ShiftChip({
  shift,
  properties,
  onDragStart,
  onClick,
}: {
  shift: DisplayShift;
  properties: Property[];
  onDragStart: (e: React.DragEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  if (shift.is_leave) {
    return (
      <div className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted border border-border text-muted-foreground flex items-center gap-0.5">
        <CalendarOff size={9} /> Leave
      </div>
    );
  }
  const col = propColor(shift.property_id, properties);
  const prop = properties.find((p) => p.id === shift.property_id);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium border cursor-grab active:cursor-grabbing select-none flex items-center gap-0.5 hover:opacity-80 transition-opacity",
        col.bg, col.text
      )}
    >
      <span className="truncate max-w-[64px]">{prop?.name ?? "—"}</span>
      {shift.start_time && (
        <span className="opacity-70 flex-shrink-0">{formatTime(shift.start_time)}</span>
      )}
      {shift.is_virtual && (
        <span className="opacity-50 flex-shrink-0 text-[8px]">↻</span>
      )}
    </div>
  );
}

// ── Add / Edit Shift Modal ────────────────────────────────────────────────────

function ShiftModal({
  open,
  onClose,
  onSave,
  profiles,
  properties,
  prefillDate,
  prefillStaff,
  userId,
  editShift,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<StaffShift, "id" | "created_at" | "updated_at">) => Promise<boolean>;
  profiles: Profile[];
  properties: Property[];
  prefillDate?: string;
  prefillStaff?: string;
  userId: string | null;
  editShift?: DisplayShift | null;
}) {
  const [form, setForm] = useState({
    staff_id: editShift?.staff_id ?? prefillStaff ?? "",
    property_id: editShift?.property_id ?? "",
    shift_date: editShift?.shift_date ?? prefillDate ?? format(new Date(), "yyyy-MM-dd"),
    start_time: editShift?.start_time?.slice(0, 5) ?? "09:00",
    end_time: editShift?.end_time?.slice(0, 5) ?? "17:00",
    notes: editShift?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        staff_id: editShift?.staff_id ?? prefillStaff ?? "",
        property_id: editShift?.property_id ?? "",
        shift_date: editShift?.shift_date ?? prefillDate ?? format(new Date(), "yyyy-MM-dd"),
        start_time: editShift?.start_time?.slice(0, 5) ?? "09:00",
        end_time: editShift?.end_time?.slice(0, 5) ?? "17:00",
        notes: editShift?.notes ?? "",
      });
    }
  }, [open, prefillDate, prefillStaff, editShift]);

  if (!open) return null;

  const handleSave = async () => {
    if (!form.staff_id || !form.shift_date) return;
    setSaving(true);
    const ok = await onSave({
      staff_id: form.staff_id,
      property_id: form.property_id || null,
      schedule_id: null,
      shift_date: form.shift_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      status: "scheduled",
      notes: form.notes.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold">{editShift ? "Edit Shift" : "Add Shift"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={form.staff_id} onValueChange={(v) => setForm((f) => ({ ...f, staff_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Property</Label>
            <Select value={form.property_id} onValueChange={(v) => setForm((f) => ({ ...f, property_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select property…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">No property</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={form.shift_date} onChange={(e) => setForm((f) => ({ ...f, shift_date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} className="resize-none" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={saving || !form.staff_id} onClick={handleSave}>
            {saving ? "Saving…" : editShift ? "Save Changes" : "Add Shift"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Leave Request Modal ───────────────────────────────────────────────────────

function LeaveModal({
  open,
  onClose,
  onSave,
  profiles,
  userId,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<StaffLeaveRequest, "id" | "created_at" | "updated_at">) => Promise<boolean>;
  profiles: Profile[];
  userId: string | null;
  canEdit: boolean;
}) {
  const [form, setForm] = useState({
    staff_id: userId ?? "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
    leave_type: "vacation",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, staff_id: userId ?? "" }));
  }, [open, userId]);

  if (!open) return null;

  const handleSave = async () => {
    if (!form.staff_id) return;
    setSaving(true);
    const ok = await onSave({
      staff_id: form.staff_id,
      start_date: form.start_date,
      end_date: form.end_date,
      leave_type: form.leave_type,
      reason: form.reason.trim() || null,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      created_by: userId,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold">Request Leave</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {canEdit && (
            <div className="space-y-1.5">
              <Label>Staff Member</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm((f) => ({ ...f, staff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <Select value={form.leave_type} onValueChange={(v) => setForm((f) => ({ ...f, leave_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea rows={3} className="resize-none" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
        </div>
        <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={saving || !form.staff_id} onClick={handleSave}>
            {saving ? "Submitting…" : "Submit Request"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule Manager Drawer ───────────────────────────────────────────────────

function ScheduleManagerDrawer({
  open,
  onClose,
  staffId,
  profiles,
  properties,
  schedules,
  onDeactivate,
  onCreate,
  onEdit,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  staffId: string | null;
  profiles: Profile[];
  properties: Property[];
  schedules: StaffSchedule[];
  onDeactivate: (id: string) => Promise<boolean>;
  onCreate: (data: Omit<StaffSchedule, "id" | "created_at" | "updated_at">) => Promise<boolean>;
  onEdit: (oldId: string, newData: Omit<StaffSchedule, "id" | "created_at" | "updated_at">) => Promise<boolean>;
  userId: string | null;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    staff_id: staffId ?? "",
    property_id: "",
    day_of_week: 1,
    start_time: "09:00",
    end_time: "17:00",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, staff_id: staffId ?? "" }));
      setShowAdd(false);
      setEditingId(null);
    }
  }, [open, staffId]);

  if (!open) return null;

  const staffSchedules = schedules.filter(
    (s) => s.staff_id === (staffId ?? form.staff_id) && s.is_active
  );

  const startEdit = (s: StaffSchedule) => {
    setEditingId(s.id);
    setForm({
      staff_id: s.staff_id,
      property_id: s.property_id ?? "",
      day_of_week: s.day_of_week,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      notes: s.notes ?? "",
    });
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!form.staff_id) return;
    setSaving(true);
    const data: Omit<StaffSchedule, "id" | "created_at" | "updated_at"> = {
      staff_id: form.staff_id,
      property_id: form.property_id || null,
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      effective_from: format(new Date(), "yyyy-MM-dd"),
      effective_to: null,
      is_active: true,
      notes: form.notes.trim() || null,
      created_by: userId,
    };
    let ok: boolean;
    if (editingId) {
      ok = await onEdit(editingId, data);
    } else {
      ok = await onCreate(data);
    }
    setSaving(false);
    if (ok) { setShowAdd(false); setEditingId(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold">Recurring Schedules</h2>
            {staffId && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {profiles.find((p) => p.id === staffId)?.full_name ?? "Staff member"}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!staffId && (
            <div className="space-y-1.5">
              <Label>Staff Member</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm((f) => ({ ...f, staff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Existing schedules */}
          {staffSchedules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No recurring schedules set.</p>
          ) : (
            <div className="space-y-2">
              {staffSchedules.map((s) => {
                const prop = properties.find((p) => p.id === s.property_id);
                const col = propColor(s.property_id, properties);
                return (
                  <div key={s.id} className={cn("rounded-xl border p-3 flex items-center gap-3", col.bg)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-sm font-medium", col.text)}>{DOW_FULL[s.day_of_week]}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(s.start_time)} – {formatTime(s.end_time)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {prop?.name ?? "No property"} · From {s.effective_from}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(s)} className="p-1.5 rounded-lg hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={async () => { await onDeactivate(s.id); }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add / Edit form */}
          {showAdd ? (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">{editingId ? "Edit Schedule" : "Add Recurring Schedule"}</p>
              {editingId && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
                  Editing will close the current schedule and create a new one from today — past shifts remain unchanged.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Day of Week</Label>
                  <Select value={String(form.day_of_week)} onValueChange={(v) => setForm((f) => ({ ...f, day_of_week: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOW_LABELS.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>{DOW_FULL[i]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Property</Label>
                  <Select value={form.property_id} onValueChange={(v) => setForm((f) => ({ ...f, property_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Time</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Time</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowAdd(false); setEditingId(null); }}>Cancel</Button>
                <Button size="sm" className="flex-1" disabled={saving} onClick={handleSave}>
                  {saving ? "Saving…" : editingId ? "Update" : "Add"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => {
              setEditingId(null);
              setForm((f) => ({ ...f, property_id: "", day_of_week: 1, start_time: "09:00", end_time: "17:00", notes: "" }));
              setShowAdd(true);
            }}>
              <Plus size={14} /> Add Recurring Schedule
            </Button>
          )}
        </div>
        <div className="flex-shrink-0 px-5 py-4 border-t border-border">
          <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

// ── Leave Review Panel ────────────────────────────────────────────────────────

function LeaveReviewPanel({
  leaveRequests,
  profiles,
  onReview,
  onDelete,
  userId,
  canEdit,
}: {
  leaveRequests: StaffLeaveRequest[];
  profiles: Profile[];
  onReview: (id: string, status: "approved" | "rejected", reviewerId: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  userId: string | null;
  canEdit: boolean;
}) {
  const pending = leaveRequests.filter((r) => r.status === "pending");
  const mine = leaveRequests.filter((r) => r.staff_id === userId);
  const shown = canEdit ? leaveRequests : mine;

  if (shown.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Leave Requests {pending.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px]">{pending.length} pending</span>}
      </p>
      {shown.map((req) => {
        const person = profiles.find((p) => p.id === req.staff_id);
        const statusColors = {
          pending: "text-amber-400 bg-amber-500/10 border-amber-500/20",
          approved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
          rejected: "text-red-400 bg-red-500/10 border-red-500/20",
        };
        return (
          <div key={req.id} className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-start gap-2 justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{person?.full_name ?? req.staff_id}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {req.leave_type.replace("_", " ")} · {req.start_date === req.end_date ? req.start_date : `${req.start_date} – ${req.end_date}`}
                </p>
                {req.reason && <p className="text-xs text-muted-foreground mt-0.5 italic">"{req.reason}"</p>}
              </div>
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize flex-shrink-0", statusColors[req.status as keyof typeof statusColors] ?? "")}>
                {req.status}
              </span>
            </div>
            {canEdit && req.status === "pending" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  onClick={() => userId && onReview(req.id, "approved", userId)}
                >
                  <Check size={12} /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => userId && onReview(req.id, "rejected", userId)}
                >
                  <X size={12} /> Reject
                </Button>
              </div>
            )}
            {(req.staff_id === userId || canEdit) && req.status !== "approved" && (
              <button
                onClick={() => onDelete(req.id)}
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main StaffCalendarTab ─────────────────────────────────────────────────────

export function StaffCalendarTab({
  canEdit,
  userId,
}: {
  canEdit: boolean;
  userId: string | null;
}) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showScheduleManager, setShowScheduleManager] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();
  const [prefillStaff, setPrefillStaff] = useState<string | undefined>();
  const [scheduleManagerStaff, setScheduleManagerStaff] = useState<string | null>(null);
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

  const dragRef = useRef<DisplayShift | null>(null);

  const {
    schedules, shifts, leaveRequests, loading, refetch,
    createSchedule, editSchedule, deactivateSchedule,
    createShift, updateShift, deleteShift,
    submitLeaveRequest, reviewLeaveRequest, deleteLeaveRequest,
  } = useStaffSchedules(weekStart);

  // Load profiles and properties once
  useEffect(() => {
    setProfilesLoading(true);
    Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url, job_title, department").order("full_name"),
      supabase.from("properties").select("id, name").order("sort_order"),
    ]).then(([pRes, propRes]) => {
      setProfiles((pRes.data as Profile[]) ?? []);
      setProperties((propRes.data as Property[]) ?? []);
      setProfilesLoading(false);
    });
  }, []);

  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart, { weekStartsOn: 1 }),
  });

  const displayShifts = buildDisplayShifts(weekDays, schedules, shifts, leaveRequests);

  // Staff who have any shifts this week + unique staff from schedules
  const activeStaffIds = Array.from(
    new Set([
      ...displayShifts.map((s) => s.staff_id),
      ...schedules.map((s) => s.staff_id),
    ])
  );
  const allStaff = profiles.filter((p) =>
    filterStaff === "all" ? activeStaffIds.includes(p.id) : p.id === filterStaff
  );
  // Also include all profiles for "all" if no schedules yet
  const staffToShow = allStaff.length > 0 ? allStaff : (filterStaff === "all" ? profiles.slice(0, 10) : profiles.filter((p) => p.id === filterStaff));

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (shift: DisplayShift) => {
    dragRef.current = shift;
  };

  const handleDrop = useCallback(async (targetDate: string) => {
    const dragged = dragRef.current;
    dragRef.current = null;
    if (!dragged || dragged.is_leave) return;
    if (dragged.shift_date === targetDate) return;

    if (dragged.is_virtual) {
      // Cancel for original date, create concrete for new date (pattern unchanged)
      await supabase.from("staff_shifts").insert([
        {
          staff_id: dragged.staff_id,
          property_id: dragged.property_id,
          schedule_id: dragged.schedule_id,
          shift_date: dragged.shift_date,
          start_time: dragged.start_time,
          end_time: dragged.end_time,
          status: "cancelled",
          notes: "Cancelled — moved to " + targetDate,
          created_by: userId,
        },
        {
          staff_id: dragged.staff_id,
          property_id: dragged.property_id,
          schedule_id: null,
          shift_date: targetDate,
          start_time: dragged.start_time,
          end_time: dragged.end_time,
          status: "scheduled",
          notes: "Moved from " + dragged.shift_date,
          created_by: userId,
        },
      ] as never);
      toast.success("Shift moved · Recurring pattern unchanged for future weeks");
    } else if (dragged.concrete_id) {
      await supabase.from("staff_shifts").update({ shift_date: targetDate } as never).eq("id", dragged.concrete_id);
      toast.success("Shift rescheduled");
    }
    refetch();
  }, [userId, refetch]);

  // ── Cell click: open add shift modal pre-filled ────────────────────────────
  const handleCellClick = (dateStr: string, staffId: string) => {
    if (!canEdit) return;
    setPrefillDate(dateStr);
    setPrefillStaff(staffId);
    setShowShiftModal(true);
  };

  const weekLabel = `${format(weekStart, "MMM d")} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[160px]">
            <p className="text-sm font-semibold">{weekLabel}</p>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                This week
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8"
            onClick={() => { setShowLeaveModal(true); }}
          >
            <CalendarOff size={13} /> Leave
          </Button>
          {canEdit && (
            <>
              <Button
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => { setPrefillDate(undefined); setPrefillStaff(undefined); setShowShiftModal(true); }}
              >
                <Plus size={13} /> Shift
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setScheduleManagerStaff(null); setShowScheduleManager(true); }}
                title="Manage recurring schedules"
              >
                <Settings2 size={15} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Property Legend ───────────────────────────────────────────────── */}
      {properties.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {properties.map((p, i) => {
            const col = PROPERTY_COLORS[i % PROPERTY_COLORS.length];
            return (
              <div key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                {p.name}
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarOff size={10} />
            Leave
          </div>
        </div>
      )}

      {/* ── Schedule Grid ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Day headers */}
        <div className="grid border-b border-border" style={{ gridTemplateColumns: "140px repeat(7, 1fr)" }}>
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">Staff</div>
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "px-1 py-2 text-center border-r border-border last:border-r-0",
                isToday(day) && "bg-primary/5"
              )}
            >
              <p className={cn("text-[10px] font-medium text-muted-foreground uppercase tracking-wide", isToday(day) && "text-primary")}>
                {format(day, "EEE")}
              </p>
              <p className={cn(
                "text-sm font-semibold mt-0.5 w-6 h-6 rounded-full flex items-center justify-center mx-auto",
                isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
              )}>
                {format(day, "d")}
              </p>
            </div>
          ))}
        </div>

        {/* Staff rows */}
        {loading || profilesLoading ? (
          <div className="space-y-0">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 border-b border-border bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : staffToShow.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <UserCheck size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No staff scheduled this week</p>
            {canEdit && (
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => { setShowScheduleManager(true); }}>
                <Settings2 size={13} /> Set Up Schedules
              </Button>
            )}
          </div>
        ) : (
          staffToShow.map((person) => {
            const isExpanded = expandedStaff.has(person.id);
            const personShifts = displayShifts.filter((s) => s.staff_id === person.id);

            return (
              <div key={person.id} className="border-b border-border last:border-b-0">
                <div
                  className="grid"
                  style={{ gridTemplateColumns: "140px repeat(7, 1fr)" }}
                >
                  {/* Staff name cell */}
                  <div className="px-3 py-2 border-r border-border flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-primary">
                      {(person.full_name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{person.full_name ?? "—"}</p>
                      {person.job_title && (
                        <p className="text-[9px] text-muted-foreground truncate">{person.job_title}</p>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => { setScheduleManagerStaff(person.id); setShowScheduleManager(true); }}
                        className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                        title="Manage schedules"
                      >
                        <Settings2 size={10} />
                      </button>
                    )}
                  </div>

                  {/* Day cells */}
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const dayShifts = personShifts.filter((s) => s.shift_date === dateStr);
                    const [dragOver, setDragOver] = useState(false);

                    return (
                      <div
                        key={dateStr}
                        onClick={() => dayShifts.length === 0 && handleCellClick(dateStr, person.id)}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleDrop(dateStr); }}
                        className={cn(
                          "px-1 py-1.5 border-r border-border last:border-r-0 min-h-[52px] transition-colors",
                          isToday(day) && "bg-primary/5",
                          dragOver && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                          dayShifts.length === 0 && canEdit && "cursor-pointer hover:bg-muted/30 group"
                        )}
                      >
                        <div className="space-y-0.5">
                          {dayShifts.map((shift) => (
                            <ShiftChip
                              key={shift.key}
                              shift={shift}
                              properties={properties}
                              onDragStart={(e) => { e.stopPropagation(); handleDragStart(shift); }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!shift.is_leave && canEdit) {
                                  if (shift.concrete_id) {
                                    deleteShift(shift.concrete_id);
                                  }
                                }
                              }}
                            />
                          ))}
                          {dayShifts.length === 0 && canEdit && (
                            <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus size={12} className="text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Leave Requests Panel ──────────────────────────────────────────── */}
      <LeaveReviewPanel
        leaveRequests={leaveRequests}
        profiles={profiles}
        onReview={reviewLeaveRequest}
        onDelete={deleteLeaveRequest}
        userId={userId}
        canEdit={canEdit}
      />

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <ShiftModal
        open={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        onSave={createShift}
        profiles={profiles}
        properties={properties}
        prefillDate={prefillDate}
        prefillStaff={prefillStaff}
        userId={userId}
      />

      <LeaveModal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onSave={submitLeaveRequest}
        profiles={profiles}
        userId={userId}
        canEdit={canEdit}
      />

      <ScheduleManagerDrawer
        open={showScheduleManager}
        onClose={() => setShowScheduleManager(false)}
        staffId={scheduleManagerStaff}
        profiles={profiles}
        properties={properties}
        schedules={schedules}
        onDeactivate={deactivateSchedule}
        onCreate={createSchedule}
        onEdit={editSchedule}
        userId={userId}
      />
    </div>
  );
}
