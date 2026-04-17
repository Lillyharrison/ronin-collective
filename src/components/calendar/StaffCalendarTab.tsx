import { useState, useRef, useEffect, useCallback } from "react";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, isToday, getDay, isSameDay,
  differenceInCalendarDays, parseISO, isWeekend,
  startOfMonth, endOfMonth, addMonths, subMonths,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffSchedules, StaffSchedule, StaffShift, StaffLeaveRequest } from "@/hooks/useStaffSchedules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Settings2,
  CalendarOff, UserCheck, X, Check, Clock, Pencil,
  PlaneTakeoff, AlertCircle, GripVertical, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  assigned_property_ids?: string[] | null;
  is_draft?: boolean;
}

/** Returns a human-readable label for a profile, using job title for drafts. */
function getDisplayName(p: Profile | undefined | null, fallback = "Staff"): string {
  if (!p) return fallback;
  if (p.full_name) return p.full_name;
  if (p.is_draft) return p.job_title ? `[${p.job_title}]` : "[Draft]";
  return fallback;
}

interface Property {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
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
  { bg: "bg-amber-500/15 border-amber-500/30",  text: "text-amber-400",   dot: "bg-amber-400" },
  { bg: "bg-rose-500/15 border-rose-500/30",    text: "text-rose-400",    dot: "bg-rose-400" },
  { bg: "bg-teal-500/15 border-teal-500/30",    text: "text-teal-400",    dot: "bg-teal-400" },
  { bg: "bg-indigo-500/15 border-indigo-500/30", text: "text-indigo-400", dot: "bg-indigo-400" },
];

/** Explicit color assignments for key properties to avoid similar-looking colors */
const PROPERTY_COLOR_OVERRIDES: Record<string, number> = {
  rockingham: 0, // blue
  moreno: 3,     // orange
  bristol: 5,    // cyan
  franklyn: 1,   // emerald
  toyopa: 2,     // purple
  wisconsin: 4,  // pink
  broadbeach: 6, // amber
  montana: 7,    // rose
  grosvenor: 8,  // teal
  aman: 9,       // indigo
};

function propColor(propId: string | null, properties: Property[]) {
  if (!propId) return PROPERTY_COLORS[PROPERTY_COLORS.length - 1];
  const prop = properties.find((p) => p.id === propId);
  if (prop) {
    const nameLower = prop.name.toLowerCase();
    for (const [key, colorIdx] of Object.entries(PROPERTY_COLOR_OVERRIDES)) {
      if (nameLower.includes(key)) return PROPERTY_COLORS[colorIdx % PROPERTY_COLORS.length];
    }
  }
  const idx = properties.findIndex((p) => p.id === propId);
  return PROPERTY_COLORS[Math.abs(idx) % PROPERTY_COLORS.length];
}

const LEAVE_TYPES = ["vacation", "sick", "personal", "public_holiday", "other"];
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m}${hour < 12 ? "am" : "pm"}`;
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
  onDoubleClick,
}: {
  shift: DisplayShift;
  properties: Property[];
  onDragStart: (e: React.DragEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
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

  // Extract virtual location from notes (e.g. "📍 Office – some note")
  const virtualLocMatch = shift.notes?.match(/^📍 (Office|Remote)/);
  const virtualLoc = virtualLocMatch?.[1];
  const displayLabel = prop?.name ?? virtualLoc ?? "—";

  const timeLabel = shift.start_time && shift.end_time
    ? `${formatTime(shift.start_time)}–${formatTime(shift.end_time)}`
    : shift.start_time ? formatTime(shift.start_time) : "";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Double-click to edit"
      className={cn(
        "rounded px-1.5 py-1 text-[10px] font-medium border cursor-grab active:cursor-grabbing select-none hover:opacity-80 transition-opacity leading-tight w-full",
        virtualLoc && !prop
          ? "bg-muted/60 border-border text-muted-foreground"
          : `${col.bg} ${col.text}`
      )}
    >
      <div className="flex items-center gap-0.5">
        <span className="truncate">{displayLabel}</span>
        {shift.is_virtual && (
          <span className="opacity-50 flex-shrink-0 text-[8px]">↻</span>
        )}
      </div>
      {timeLabel && (
        <div className="opacity-70 text-[9px]">{timeLabel}</div>
      )}
    </div>
  );
}

// ── Add / Edit Shift Modal ────────────────────────────────────────────────────

type ShiftMode = "single" | "range" | "recurring";

function ShiftModal({
  open,
  onClose,
  onSave,
  onUpdate,
  onUpdateSchedule,
  onSaveSchedule,
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
  onUpdate: (id: string, data: Partial<StaffShift>) => Promise<boolean>;
  onUpdateSchedule: (id: string, data: Partial<StaffSchedule>) => Promise<boolean>;
  onSaveSchedule: (data: Omit<StaffSchedule, "id" | "created_at" | "updated_at">) => Promise<boolean>;
  profiles: Profile[];
  properties: Property[];
  prefillDate?: string;
  prefillStaff?: string;
  userId: string | null;
  editShift?: DisplayShift | null;
}) {
  const [mode, setMode] = useState<ShiftMode>("single");
  const [form, setForm] = useState({
    staff_id: "",
    property_id: "",
    location: "",
    // single / range
    shift_date: prefillDate ?? format(new Date(), "yyyy-MM-dd"),
    end_date: prefillDate ?? format(new Date(), "yyyy-MM-dd"),
    // recurring
    days_of_week: [] as number[], // 0=Sun … 6=Sat
    effective_from: format(new Date(), "yyyy-MM-dd"),
    effective_to: "",
    // common
    start_time: "09:00",
    end_time: "17:00",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const existingNotes = editShift?.notes ?? "";
      const locPrefix = existingNotes.startsWith("📍") ? existingNotes.split(" – ")[0].replace("📍 ", "") : "";
      const restNotes = locPrefix ? existingNotes.replace(`📍 ${locPrefix} – `, "").replace(`📍 ${locPrefix}`, "") : existingNotes;
      setMode(editShift ? "single" : "single");
      setForm({
        staff_id: editShift?.staff_id ?? prefillStaff ?? "",
        property_id: editShift?.property_id ?? "",
        location: locPrefix,
        shift_date: editShift?.shift_date ?? prefillDate ?? format(new Date(), "yyyy-MM-dd"),
        end_date: editShift?.shift_date ?? prefillDate ?? format(new Date(), "yyyy-MM-dd"),
        days_of_week: [],
        effective_from: format(new Date(), "yyyy-MM-dd"),
        effective_to: "",
        start_time: editShift?.start_time?.slice(0, 5) ?? "09:00",
        end_time: editShift?.end_time?.slice(0, 5) ?? "17:00",
        notes: restNotes,
      });
    }
  }, [open, prefillDate, prefillStaff, editShift]);

  if (!open) return null;

  const toggleDay = (d: number) =>
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(d)
        ? f.days_of_week.filter((x) => x !== d)
        : [...f.days_of_week, d].sort(),
    }));

  const locationNote = (notes: string, loc: string) =>
    loc ? `📍 ${loc}${notes.trim() ? ` – ${notes.trim()}` : ""}` : notes.trim() || null;

  const handleSave = async () => {
    if (!form.staff_id) return;
    setSaving(true);
    const noteVal = locationNote(form.notes, form.location);

    // ── Edit mode: update the concrete shift directly ──────────────────────
    if (editShift && editShift.concrete_id) {
      const ok = await onUpdate(editShift.concrete_id, {
        staff_id: form.staff_id,
        property_id: form.property_id || null,
        shift_date: form.shift_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        notes: noteVal,
      });
      setSaving(false);
      if (ok) onClose();
      return;
    }

    // ── Edit mode: virtual shift from recurring schedule → update the schedule ─
    if (editShift && editShift.is_virtual && editShift.schedule_id) {
      const ok = await onUpdateSchedule(editShift.schedule_id, {
        staff_id: form.staff_id,
        property_id: form.property_id || null,
        start_time: form.start_time || "09:00",
        end_time: form.end_time || "17:00",
        notes: noteVal,
      });
      setSaving(false);
      if (ok) onClose();
      return;
    }

    if (mode === "recurring") {
      // Create one staff_schedule per selected day-of-week
      if (form.days_of_week.length === 0) { setSaving(false); return; }
      let allOk = true;
      for (const dow of form.days_of_week) {
        const ok = await onSaveSchedule({
          staff_id: form.staff_id,
          property_id: form.property_id || null,
          day_of_week: dow,
          start_time: form.start_time,
          end_time: form.end_time,
          effective_from: form.effective_from,
          effective_to: form.effective_to || null,
          is_active: true,
          notes: noteVal,
          created_by: userId,
        });
        if (!ok) allOk = false;
      }
      setSaving(false);
      if (allOk) onClose();
    } else {
      // Single or range: create one shift per day in the range
      const start = form.shift_date;
      const end = mode === "range" ? form.end_date : form.shift_date;
      if (!start) { setSaving(false); return; }
      const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end >= start ? end : start) });
      let allOk = true;
      for (const day of days) {
        const ok = await onSave({
          staff_id: form.staff_id,
          property_id: form.property_id || null,
          schedule_id: null,
          shift_date: format(day, "yyyy-MM-dd"),
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          status: "scheduled",
          notes: noteVal,
          created_by: userId,
        });
        if (!ok) allOk = false;
      }
      setSaving(false);
      if (allOk) onClose();
    }
  };

  const isValid = !!form.staff_id && (
    mode === "recurring" ? form.days_of_week.length > 0 : !!form.shift_date
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold">{editShift ? "Edit Shift" : "Add Shift"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Mode toggle */}
          {!editShift && (
            <div className="flex gap-1 p-1 rounded-xl bg-muted">
              {(["single", "range", "recurring"] as ShiftMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium transition-all capitalize",
                    mode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === "single" ? "Single" : m === "range" ? "Date Range" : "Recurring"}
                </button>
              ))}
            </div>
          )}

          {/* Staff */}
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={form.staff_id} onValueChange={(v) => setForm((f) => ({ ...f, staff_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                   <SelectItem key={p.id} value={p.id}>{getDisplayName(p)}</SelectItem>
                 ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={form.location || form.property_id || "__none__"} onValueChange={(v) => {
              const virtualLocs = ["Office", "Remote"];
              if (virtualLocs.includes(v)) {
                setForm((f) => ({ ...f, location: v, property_id: "" }));
              } else {
                setForm((f) => ({ ...f, property_id: v === "__none__" ? "" : v, location: "" }));
              }
            }}>
              <SelectTrigger><SelectValue placeholder="Select location…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No location</SelectItem>
                <SelectItem value="Office">🏢 Office</SelectItem>
                <SelectItem value="Remote">🏠 Remote</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date fields — Single */}
          {mode === "single" && (
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.shift_date} onChange={(e) => setForm((f) => ({ ...f, shift_date: e.target.value }))} />
            </div>
          )}

          {/* Date fields — Range */}
          {mode === "range" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input type="date" value={form.shift_date} onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, shift_date: v, end_date: f.end_date < v ? v : f.end_date }));
                }} />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input type="date" value={form.end_date} min={form.shift_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
          )}

          {/* Recurring — day-of-week picker */}
          {mode === "recurring" && (
            <>
              <div className="space-y-2">
                <Label>Days of Week</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {DOW_LABELS.map((label, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(i)}
                      className={cn(
                        "w-10 h-10 rounded-xl text-xs font-semibold border transition-all",
                        form.days_of_week.includes(i)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted border-border text-muted-foreground hover:text-foreground hover:border-border/60"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.days_of_week.length === 0 && (
                  <p className="text-xs text-muted-foreground">Select at least one day</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Effective From</Label>
                  <Input type="date" value={form.effective_from} onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Until (optional)</Label>
                  <Input type="date" value={form.effective_to} min={form.effective_from} onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))} placeholder="No end date" />
                </div>
              </div>

              {form.days_of_week.length > 0 && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5 text-xs text-foreground/80 leading-relaxed">
                  <span className="font-medium">Summary:</span>{" "}
                  Every{" "}
                  {form.days_of_week.map((d) => DOW_FULL[d]).join(", ")}{" "}
                  from {form.effective_from || "today"}
                  {form.effective_to ? ` until ${form.effective_to}` : " (ongoing)"}
                </div>
              )}
            </>
          )}

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
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
          <Button className="flex-1" disabled={saving || !isValid} onClick={handleSave}>
            {saving ? "Saving…" : editShift ? "Save Changes" : mode === "recurring" ? "Set Recurring" : "Add Shift"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Leave Request Modal ───────────────────────────────────────────────────────

const LEAVE_TYPE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  vacation:       { label: "Vacation",        emoji: "🌴", color: "text-blue-400" },
  sick:           { label: "Sick Leave",       emoji: "🤒", color: "text-red-400" },
  personal:       { label: "Personal Day",     emoji: "🧘", color: "text-purple-400" },
  public_holiday: { label: "Public Holiday",   emoji: "🎉", color: "text-amber-400" },
  other:          { label: "Other",            emoji: "📋", color: "text-muted-foreground" },
};

function calcWorkdays(start: string, end: string): number {
  if (!start || !end) return 0;
  const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) });
  return days.filter((d) => !isWeekend(d)).length;
}

function LeaveModal({
  open,
  onClose,
  onSave,
  profiles,
  userId,
  canEdit,
  prefillStart,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<StaffLeaveRequest, "id" | "created_at" | "updated_at">) => Promise<boolean>;
  profiles: Profile[];
  userId: string | null;
  canEdit: boolean;
  prefillStart?: string;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({
    staff_id: userId ?? "",
    start_date: prefillStart ?? today,
    end_date: prefillStart ?? today,
    leave_type: "vacation",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        staff_id: userId ?? "",
        start_date: prefillStart ?? today,
        end_date: prefillStart ?? today,
        leave_type: "vacation",
        reason: "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, prefillStart]);

  if (!open) return null;

  const workdays = calcWorkdays(form.start_date, form.end_date);
  const totalDays = form.start_date && form.end_date
    ? differenceInCalendarDays(parseISO(form.end_date), parseISO(form.start_date)) + 1
    : 0;
  const typeConfig = LEAVE_TYPE_CONFIG[form.leave_type] ?? LEAVE_TYPE_CONFIG.other;
  const endMin = form.start_date;
  const isValid = !!form.staff_id && !!form.start_date && !!form.end_date && form.end_date >= form.start_date;

  const handleSave = async () => {
    if (!isValid) return;
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-base">
              <PlaneTakeoff size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-none">Request Time Off</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Submit a leave request for review</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Admin: staff picker */}
          {canEdit && (
            <div className="space-y-1.5">
              <Label>Staff Member</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm((f) => ({ ...f, staff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{getDisplayName(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Leave type grid */}
          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {LEAVE_TYPES.map((t) => {
                const cfg = LEAVE_TYPE_CONFIG[t];
                return (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, leave_type: t }))}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all text-left",
                      form.leave_type === t
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50"
                    )}
                  >
                    <span className="text-base">{cfg.emoji}</span>
                    <span className="truncate">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div className="space-y-1.5">
            <Label>Date Range</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">From</p>
                <Input
                  type="date"
                  value={form.start_date}
                  min={today}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      start_date: v,
                      end_date: f.end_date < v ? v : f.end_date,
                    }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">To</p>
                <Input
                  type="date"
                  value={form.end_date}
                  min={endMin}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Duration summary */}
          {totalDays > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted-foreground" />
                <span className="text-sm text-foreground font-medium">
                  {totalDays === 1 ? "1 day" : `${totalDays} days`}
                </span>
                {workdays !== totalDays && (
                  <span className="text-xs text-muted-foreground">({workdays} working)</span>
                )}
              </div>
              <span className={cn("text-sm", typeConfig.color)}>
                {typeConfig.emoji} {typeConfig.label}
              </span>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>
              Reason <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              rows={3}
              className="resize-none"
              placeholder="Any details you'd like to share with your manager…"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>

          {/* Info notice */}
          <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <AlertCircle size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Your request will be sent to management for review. You'll see the status update in the leave panel below the schedule.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 gap-2" disabled={saving || !isValid} onClick={handleSave}>
            {saving ? "Submitting…" : (
              <>
                <PlaneTakeoff size={14} />
                Submit Request
              </>
            )}
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
                {getDisplayName(profiles.find((p) => p.id === staffId), "Staff member")}
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
                    <SelectItem key={p.id} value={p.id}>{getDisplayName(p)}</SelectItem>
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
                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
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

// ── Leave Card ────────────────────────────────────────────────────────────────

function LeaveCard({
  req,
  profiles,
  userId,
  canEdit,
  onReview,
  onDelete,
}: {
  req: StaffLeaveRequest;
  profiles: Profile[];
  userId: string | null;
  canEdit: boolean;
  onReview: (id: string, status: "approved" | "rejected", reviewerId: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const person = profiles.find((p) => p.id === req.staff_id);
  const typeConfig = LEAVE_TYPE_CONFIG[req.leave_type] ?? LEAVE_TYPE_CONFIG.other;
  const workdays = calcWorkdays(req.start_date, req.end_date);
  const totalDays = differenceInCalendarDays(parseISO(req.end_date), parseISO(req.start_date)) + 1;

  const statusStyle = {
    pending:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
    approved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    rejected: "text-red-400 bg-red-500/10 border-red-500/20",
  }[req.status] ?? "";

  const statusIcon = {
    pending:  <Clock size={10} />,
    approved: <Check size={10} />,
    rejected: <X size={10} />,
  }[req.status];

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-start gap-2.5 justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl flex-shrink-0">{typeConfig.emoji}</span>
          <div className="min-w-0">
            {canEdit && (
              <p className="text-xs font-semibold truncate text-foreground">{getDisplayName(person, "Staff")}</p>
            )}
            <p className={cn("text-sm font-medium capitalize", typeConfig.color)}>{typeConfig.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {req.start_date === req.end_date
                ? req.start_date
                : `${req.start_date} – ${req.end_date}`}
              {" · "}
              {totalDays === 1 ? "1 day" : `${workdays} working days`}
            </p>
            {req.reason && (
              <p className="text-xs text-muted-foreground italic mt-0.5">"{req.reason}"</p>
            )}
          </div>
        </div>
        <span className={cn("flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize flex-shrink-0", statusStyle)}>
          {statusIcon}
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
          className="text-xs text-destructive/70 hover:text-destructive transition-colors flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-destructive/10 min-h-[36px]"
        >
          <Trash2 size={13} /> Withdraw request
        </button>
      )}
    </div>
  );
}

// ── Leave Panels ──────────────────────────────────────────────────────────────

function LeavePanel({
  leaveRequests,
  profiles,
  onReview,
  onDelete,
  onNew,
  userId,
  canEdit,
}: {
  leaveRequests: StaffLeaveRequest[];
  profiles: Profile[];
  onReview: (id: string, status: "approved" | "rejected", reviewerId: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onNew: () => void;
  userId: string | null;
  canEdit: boolean;
}) {
  const pending = leaveRequests.filter((r) => r.status === "pending");
  const myRequests = leaveRequests.filter((r) => r.staff_id === userId);
  // Admin sees all; staff only sees their own
  const adminList = canEdit ? leaveRequests : [];

  return (
    <div className="space-y-3">
      {/* My Requests panel — visible to everyone */}
      {myRequests.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My Leave Requests</p>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={onNew}>
              <Plus size={11} /> New
            </Button>
          </div>
          {myRequests.map((req) => (
            <LeaveCard
              key={req.id}
              req={req}
              profiles={profiles}
              userId={userId}
              canEdit={false}
              onReview={onReview}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Admin review panel */}
      {canEdit && adminList.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            All Leave Requests
            {pending.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px]">
                {pending.length} pending
              </span>
            )}
          </p>
          {adminList.map((req) => (
            <LeaveCard
              key={req.id}
              req={req}
              profiles={profiles}
              userId={userId}
              canEdit={canEdit}
              onReview={onReview}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Staff Day Cell ────────────────────────────────────────────────────────────

function StaffDayCell({
  dateStr,
  day,
  shifts,
  properties,
  canEdit,
  onCellClick,
  onDragStart,
  onDrop,
  onDeleteShift,
  onShiftDoubleClick,
}: {
  dateStr: string;
  day: Date;
  shifts: DisplayShift[];
  properties: Property[];
  canEdit: boolean;
  onCellClick: () => void;
  onDragStart: (shift: DisplayShift) => void;
  onDrop: (targetDateStr: string) => void;
  onDeleteShift: (shift: DisplayShift) => void;
  onShiftDoubleClick: (shift: DisplayShift) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={cn(
        "border-r border-border p-1 min-h-[52px] transition-colors relative",
        isToday(day) && "bg-primary/5",
        dragOver && "bg-primary/10 ring-1 ring-inset ring-primary/40"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); onDrop(dateStr); }}
    >
      <div className="flex flex-col gap-0.5 w-full">
        {shifts.map((shift) => (
          <div key={shift.key} className="relative group">
            <ShiftChip
              shift={shift}
              properties={properties}
              onDragStart={(_e) => onDragStart(shift)}
              onClick={(e) => { e.stopPropagation(); }}
              onDoubleClick={canEdit ? (e) => { e.stopPropagation(); onShiftDoubleClick(shift); } : undefined}
            />
            {canEdit && !shift.is_leave && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteShift(shift); }}
                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-3.5 h-3.5 items-center justify-center text-[8px] hidden group-hover:flex z-10"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            onClick={onCellClick}
            className="rounded px-1 py-0.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
          >
            <Plus size={9} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Staff Month Grid ──────────────────────────────────────────────────────────

function StaffMonthGrid({
  monthStart,
  staffToShow,
  displayShifts,
  properties,
  loading,
  canEdit,
  onShowScheduleManager,
}: {
  monthStart: Date;
  staffToShow: Profile[];
  displayShifts: DisplayShift[];
  properties: Property[];
  loading: boolean;
  canEdit: boolean;
  onShowScheduleManager: () => void;
}) {
  const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) });
  // Group days into weeks (Mon–Sun rows)
  const weeks: Date[][] = [];
  let week: Date[] = [];
  monthDays.forEach((day) => {
    week.push(day);
    if (getDay(day) === 0 || day === monthDays[monthDays.length - 1]) {
      weeks.push(week);
      week = [];
    }
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (staffToShow.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4 rounded-2xl border border-border bg-card">
        <UserCheck size={36} className="text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No staff scheduled this month</p>
        {canEdit && (
          <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={onShowScheduleManager}>
            <Settings2 size={13} /> Set Up Schedules
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-x-auto">
      {/* Header row: Name + day numbers */}
      <div className="min-w-[600px]">
        {/* Month day-number header */}
        <div
          className="grid border-b border-border bg-muted/30"
          style={{ gridTemplateColumns: `180px repeat(${monthDays.length}, minmax(28px, 1fr))` }}
        >
          <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-r border-border">
            {format(monthStart, "MMMM yyyy")}
          </div>
          {monthDays.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "py-1.5 text-center border-r border-border last:border-r-0",
                isToday(day) && "bg-primary/10",
                isWeekend(day) && "bg-muted/20"
              )}
            >
              <p className={cn(
                "text-[9px] font-medium text-muted-foreground uppercase leading-none",
                isToday(day) && "text-primary"
              )}>
                {format(day, "EEE")}
              </p>
              <p className={cn(
                "text-[11px] font-bold mt-0.5 w-5 h-5 rounded-full flex items-center justify-center mx-auto",
                isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
              )}>
                {format(day, "d")}
              </p>
            </div>
          ))}
        </div>

        {/* Staff rows */}
        {staffToShow.map((person) => {
          const personShifts = displayShifts.filter((s) => s.staff_id === person.id);
          return (
            <div
              key={person.id}
              className="grid border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors"
              style={{ gridTemplateColumns: `180px repeat(${monthDays.length}, minmax(28px, 1fr))` }}
            >
              {/* Staff name cell */}
              <div className="px-2 py-2 border-r border-border flex items-center gap-1.5 min-w-0 sticky left-0 bg-card z-10">
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-semibold",
                  person.is_draft ? "bg-amber-500/20 text-amber-400" : "bg-primary/10 text-primary"
                )}>
                  {getDisplayName(person, "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className={cn(
                    "text-[11px] font-medium truncate leading-tight",
                    person.is_draft && "italic text-muted-foreground"
                  )}>
                    {getDisplayName(person)}
                  </p>
                  {person.job_title && (
                    <p className="text-[9px] text-muted-foreground truncate leading-tight">{person.job_title}</p>
                  )}
                </div>
              </div>

              {/* Day cells */}
              {monthDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayShifts = personShifts.filter((s) => s.shift_date === dateStr);
                const hasLeave = dayShifts.some((s) => s.is_leave);
                const workShifts = dayShifts.filter((s) => !s.is_leave);

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "border-r border-border last:border-r-0 py-1 px-0.5 flex flex-col gap-0.5 items-center justify-center min-h-[44px]",
                      isToday(day) && "bg-primary/5",
                      isWeekend(day) && workShifts.length === 0 && !hasLeave && "bg-muted/10"
                    )}
                  >
                    {hasLeave && (
                      <div className="w-full rounded px-0.5 py-0.5 bg-muted/60 border border-border flex items-center justify-center" title="Leave">
                        <CalendarOff size={9} className="text-muted-foreground" />
                      </div>
                    )}
                    {workShifts.map((s, si) => {
                      const col = propColor(s.property_id, properties);
                      const prop = properties.find((p) => p.id === s.property_id);
                      const label = prop?.name ? prop.name.split(" ")[0] : "—";
                      const time = s.start_time && s.end_time
                        ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}`
                        : s.start_time ? formatTime(s.start_time) : "";
                      return (
                        <div
                          key={si}
                          title={`${prop?.name ?? "—"} ${time}`}
                          className={cn(
                            "w-full rounded px-0.5 py-0.5 text-center",
                            col.bg, col.text,
                            "border"
                          )}
                        >
                          <div className="text-[8px] font-semibold leading-tight truncate">{label}</div>
                          {time && (
                            <div className="text-[7px] opacity-80 leading-tight truncate">{time}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Family overlay band (above staff rows in monthly view) ─────────────────────

interface FamilyEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  event_type: string;
  property_id: string | null;
}

function FamilyOverlayBand({
  monthStart,
  monthDays,
  events,
  properties,
}: {
  monthStart: Date;
  monthDays: Date[];
  events: FamilyEvent[];
  properties: Property[];
}) {
  if (events.length === 0) return null;

  // Group by event title (so the same person/trip merges across days)
  const groups = new Map<string, FamilyEvent[]>();
  for (const ev of events) {
    const key = ev.title || "Family";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }

  return (
    <div className="border-b border-border bg-muted/10">
      <div
        className="grid"
        style={{ gridTemplateColumns: `180px repeat(${monthDays.length}, minmax(28px, 1fr))` }}
      >
        <div
          className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border flex items-center gap-1 sticky left-0 bg-card z-10"
          style={{ gridRow: `1 / span ${groups.size}` }}
        >
          <PlaneTakeoff size={10} /> Family
        </div>
        {Array.from(groups.entries()).map(([title, evs]) => {
          const col = propColor(evs[0].property_id, properties);
          return monthDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const inEvent = evs.some((ev) => {
              const start = ev.start_date.slice(0, 10);
              const end = (ev.end_date ?? ev.start_date).slice(0, 10);
              return dateStr >= start && dateStr <= end;
            });
            return (
              <div key={`${title}-${dateStr}`} className="px-px py-0.5">
                {inEvent && (
                  <div
                    className={cn("h-3.5 rounded-sm border", col.bg, col.text)}
                    title={title}
                  />
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

// ── Worked-vs-Expected Calculator (shown when filtered to one person) ──────────

interface RosterStats {
  daysWorked: number;
  daysExpected: number;
  hoursWorked: number;
  hoursExpected: number;
  leaveTakenYTD: number;
  leaveAllowance: number;
}

function CalculatorPanel({
  personName,
  stats,
}: {
  personName: string;
  stats: RosterStats;
}) {
  const leaveRemaining = Math.max(0, stats.leaveAllowance - stats.leaveTakenYTD);
  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="flex-1 min-w-[120px] rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-muted/10 px-3 py-2.5 mb-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
        {personName} · This month
      </p>
      <div className="flex flex-wrap gap-2">
        <Stat
          label="Days worked"
          value={`${stats.daysWorked} / ${stats.daysExpected}`}
          sub={stats.daysExpected > 0 ? `${Math.round((stats.daysWorked / stats.daysExpected) * 100)}%` : undefined}
        />
        <Stat
          label="Hours worked"
          value={`${stats.hoursWorked.toFixed(1)} / ${stats.hoursExpected.toFixed(0)}`}
        />
        <Stat
          label="Annual leave"
          value={`${leaveRemaining} left`}
          sub={`${stats.leaveTakenYTD} taken of ${stats.leaveAllowance}`}
        />
      </div>
    </div>
  );
}

export function StaffCalendarTab({
  canEdit,
  userId,
  scopeFilterIds = null,
}: {
  canEdit: boolean;
  userId: string | null;
  /** If non-null, restrict the visible staff rows to these user IDs (for non-admin scopes). */
  scopeFilterIds?: string[] | null;
}) {
  const [calView, setCalView] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showScheduleManager, setShowScheduleManager] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();
  const [prefillStaff, setPrefillStaff] = useState<string | undefined>();
  const [editingShift, setEditingShift] = useState<DisplayShift | null>(null);
  const [scheduleManagerStaff, setScheduleManagerStaff] = useState<string | null>(null);
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

  const dragRef = useRef<DisplayShift | null>(null);
  const rowDragRef = useRef<string | null>(null); // staff_id being row-dragged
  const [rowDragOver, setRowDragOver] = useState<string | null>(null); // staff_id hovered over

  // Persistent staff order — stored in system_settings (DB), localStorage as fast cache
  const [staffOrder, setStaffOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("ronin_staff_order") ?? "[]"); }
    catch { return []; }
  });

  // Load authoritative order from DB on mount
  useEffect(() => {
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "staff_calendar_order")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && Array.isArray(data.value)) {
          const order = data.value as string[];
          setStaffOrder(order);
          try { localStorage.setItem("ronin_staff_order", JSON.stringify(order)); } catch { /* noop */ }
        }
      });
  }, []);

  const {
    schedules, shifts, leaveRequests, loading, refetch,
    createSchedule, editSchedule, updateSchedule, deactivateSchedule,
    createShift, updateShift, deleteShift,
    submitLeaveRequest, reviewLeaveRequest, deleteLeaveRequest,
  } = useStaffSchedules(
    calView === "month" ? monthStart : weekStart,
    userId,
    canEdit,
    calView === "month" ? endOfMonth(monthStart) : undefined
  );

  // Load profiles (admin + staff only — exclude principal/extended_family) and properties once
  useEffect(() => {
    setProfilesLoading(true);
    Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("properties").select("id, name, city, country").order("sort_order"),
    ]).then(async ([rolesRes, propRes]) => {
      const allRoles = rolesRes.data ?? [];

      // Build sets: who has a family role, who has a staff role
      const familyRoles = new Set(["principal", "extended_family"]);
      const staffRoles = new Set(["admin", "manager", "staff"]);

      const hasFamilyRole = new Set(
        allRoles.filter((r) => familyRoles.has(r.role)).map((r) => r.user_id)
      );
      // Only include users who have a staff/admin/manager role AND do NOT also have a family role
      const staffUserIds = allRoles
        .filter((r) => staffRoles.has(r.role) && !hasFamilyRole.has(r.user_id))
        .map((r) => r.user_id);

      const uniqueStaffIds = [...new Set(staffUserIds)];

      if (uniqueStaffIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, job_title, department, assigned_property_ids, is_draft")
          .in("id", uniqueStaffIds)
          .order("full_name");
        setProfiles((profileData as Profile[]) ?? []);
      } else {
        setProfiles([]);
      }
      setProperties((propRes.data as Property[]) ?? []);
      setProfilesLoading(false);
    });
  }, []);

  const weekDays = calView === "month"
    ? eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) })
    : eachDayOfInterval({
        start: weekStart,
        end: endOfWeek(weekStart, { weekStartsOn: 1 }),
      });

  const displayShifts = buildDisplayShifts(weekDays, schedules, shifts, leaveRequests);

  // Non-admins only see their own row UNLESS a wider scope was provided
  const staffToShow = !canEdit && userId && !scopeFilterIds
    ? profiles.filter((p) => p.id === userId)
    : (() => {
        const activeStaffIds = Array.from(
          new Set([
            ...displayShifts.map((s) => s.staff_id),
            ...schedules.map((s) => s.staff_id),
          ])
        );
        let allStaff = profiles.filter((p) =>
          filterStaff === "all" ? activeStaffIds.includes(p.id) : p.id === filterStaff
        );
        // Apply scope filter (e.g. department) for non-admin viewers
        if (scopeFilterIds) {
          const scopeSet = new Set(scopeFilterIds);
          allStaff = allStaff.filter((p) => scopeSet.has(p.id));
        }
        let base = allStaff.length > 0 ? allStaff : (filterStaff === "all" ? profiles.slice(0, 10).filter(p => !scopeFilterIds || scopeFilterIds.includes(p.id)) : profiles.filter((p) => p.id === filterStaff));

        // ── User-controlled filters (search / department / property) ────────
        const q = filterSearch.trim().toLowerCase();
        if (q) {
          base = base.filter((p) => {
            const name = (p.full_name ?? "").toLowerCase();
            const title = (p.job_title ?? "").toLowerCase();
            return name.includes(q) || title.includes(q);
          });
        }
        if (filterDepartment !== "all") {
          base = base.filter((p) => (p.department ?? "—") === filterDepartment);
        }
        if (filterProperty !== "all") {
          base = base.filter((p) => (p.assigned_property_ids ?? []).includes(filterProperty));
        }

        // Apply saved custom order
        const orderMap = new Map(staffOrder.map((id, i) => [id, i]));
        return [...base].sort((a, b) => {
          const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return ai - bi;
        });
      })();

  // Distinct departments present across loaded profiles (for filter dropdown)
  const departmentOptions = Array.from(
    new Set(profiles.map((p) => p.department).filter((d): d is string => !!d && d.trim() !== ""))
  ).sort();
  const filtersActive = !!filterSearch || filterDepartment !== "all" || filterProperty !== "all";

  // ── Row reorder drag handlers ───────────────────────────────────────────────
  const handleRowDragStart = (staffId: string) => { rowDragRef.current = staffId; };
  const handleRowDrop = useCallback(async (targetStaffId: string) => {
    const dragged = rowDragRef.current;
    rowDragRef.current = null;
    setRowDragOver(null);
    if (!dragged || dragged === targetStaffId) return;
    const ids = staffToShow.map((p) => p.id);
    const fromIdx = ids.indexOf(dragged);
    const toIdx = ids.indexOf(targetStaffId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...ids];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragged);
    setStaffOrder(newOrder);
    // Persist to localStorage (fast) and DB (permanent)
    try { localStorage.setItem("ronin_staff_order", JSON.stringify(newOrder)); } catch { /* noop */ }
    await supabase.from("system_settings").upsert(
      { key: "staff_calendar_order", value: newOrder as never, updated_by: userId },
      { onConflict: "key" }
    );
  }, [staffToShow, userId]);

  // ── Shift drag handlers ──────────────────────────────────────────────────────
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

  const weekLabel = calView === "month"
    ? format(monthStart, "MMMM yyyy")
    : `${format(weekStart, "MMM d")} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));
  const isCurrentMonth = format(monthStart, "yyyy-MM") === format(new Date(), "yyyy-MM");

  // ── Property color map for export (hex colors matching PROPERTY_COLORS + overrides) ──
  const EXPORT_PROP_COLORS = [
    { bg: "DBEAFE", text: "1D4ED8" },  // 0 blue
    { bg: "D1FAE5", text: "065F46" },  // 1 emerald
    { bg: "EDE9FE", text: "5B21B6" },  // 2 purple
    { bg: "FFEDD5", text: "9A3412" },  // 3 orange
    { bg: "FCE7F3", text: "9D174D" },  // 4 pink
    { bg: "CFFAFE", text: "164E63" },  // 5 cyan
    { bg: "FEF3C7", text: "92400E" },  // 6 amber
    { bg: "FFE4E6", text: "9F1239" },  // 7 rose
    { bg: "CCFBF1", text: "134E4A" },  // 8 teal
    { bg: "E0E7FF", text: "3730A3" },  // 9 indigo
  ];

  function getExportPropColor(propId: string | null) {
    if (!propId) return EXPORT_PROP_COLORS[EXPORT_PROP_COLORS.length - 1];
    const prop = properties.find((p) => p.id === propId);
    if (prop) {
      const nameLower = prop.name.toLowerCase();
      for (const [key, colorIdx] of Object.entries(PROPERTY_COLOR_OVERRIDES)) {
        if (nameLower.includes(key)) return EXPORT_PROP_COLORS[colorIdx % EXPORT_PROP_COLORS.length];
      }
    }
    const idx = properties.findIndex((p) => p.id === propId);
    return EXPORT_PROP_COLORS[Math.abs(idx) % EXPORT_PROP_COLORS.length];
  }

  function buildExportRows() {
    return staffToShow.map((person) => {
      // Staff column: name only — job title is drawn separately via didDrawCell
      const row: Record<string, string> = {
        Staff: getDisplayName(person),
      };
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayShifts = displayShifts.filter(
          (s) => s.staff_id === person.id && s.shift_date === dateStr
        );
        row[format(day, "EEE d/M")] = dayShifts.length === 0
          ? ""
          : dayShifts.map((s) => {
              if (s.is_leave) return "Leave";
              const prop = properties.find((p) => p.id === s.property_id);
              const name = prop?.name ?? "—";
              const timeStr = s.start_time && s.end_time
                ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}`
                : s.start_time ? formatTime(s.start_time) : "";
              return timeStr ? `${name}\n${timeStr}` : name;
            }).join("\n");
      });
      return row;
    });
  }

  const handleExportExcel = () => {
    const rows = buildExportRows();
    const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));
    // Excel: replace \n with space for cleaner single-line display
    const excelRows = rows.map((row) => {
      const r: Record<string, string> = { Staff: row["Staff"].replace(/\n/g, " – ") };
      dayHeaders.forEach((h) => { r[h] = (row[h] ?? "").replace(/\n/g, " "); });
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(excelRows, { header: ["Staff", ...dayHeaders] });

    // Style header row
    ["A1", ...dayHeaders.map((_, i) => `${String.fromCharCode(66 + i)}1`)].forEach((cell) => {
      if (ws[cell]) ws[cell].s = { font: { bold: true, color: { rgb: "F5F0E8" } }, fill: { patternType: "solid", fgColor: { rgb: "1C1D20" } } };
    });

    // Color data cells by property
    staffToShow.forEach((person, ri) => {
      weekDays.forEach((day, ci) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayShifts = displayShifts.filter(
          (s) => s.staff_id === person.id && s.shift_date === dateStr && !s.is_leave
        );
        const cellAddr = `${String.fromCharCode(66 + ci)}${ri + 2}`;
        if (ws[cellAddr] && dayShifts.length > 0) {
          const col = getExportPropColor(dayShifts[0].property_id);
          ws[cellAddr].s = { fill: { patternType: "solid", fgColor: { rgb: col.bg } }, font: { color: { rgb: col.text } } };
        }
      });
    });

    ws["!cols"] = [{ wch: 22 }, ...dayHeaders.map(() => ({ wch: 18 }))];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");
    XLSX.writeFile(wb, `staff-schedule-${format(weekStart, "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel file downloaded");
  };

  const handleExportPDF = () => {
    const pageWidth = 297; // A4 landscape mm
    const marginL = 10;
    const marginR = 10;
    const usableWidth = pageWidth - marginL - marginR;
    const staffColW = 36; // slightly wider to fit name + title
    const dayColW = (usableWidth - staffColW) / 7;

    const doc = new jsPDF({ orientation: "landscape", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Staff Schedule — ${weekLabel}`, marginL, 13);

    const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));

    // ── Build PDF body with department separator rows ─────────────────────────
    // A separator row is a full-width empty row (white bg, minimal height)
    // inserted whenever the department changes between consecutive staff members.
    type PdfBodyRow = { cells: string[]; isSeparator: boolean; staffIndex: number };
    const pdfRows: PdfBodyRow[] = [];
    let lastDept: string | null | undefined = undefined;

    staffToShow.forEach((person, idx) => {
      // Normalize: treat null and undefined the same so we don't get false breaks
      const dept = person.department ?? null;
      // Insert thin separator only when department genuinely changes (skip first row)
      if (idx > 0 && dept !== lastDept) {
        pdfRows.push({ cells: Array(8).fill(""), isSeparator: true, staffIndex: -1 });
      }
      lastDept = dept;

      const nameOnly = getDisplayName(person);
      const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));
      const exportRows = buildExportRows();
      const row = exportRows[idx];
      pdfRows.push({
        cells: [nameOnly, ...dayHeaders.map((h) => row[h] ?? "")],
        isSeparator: false,
        staffIndex: idx,
      });
    });

    const tableBody = pdfRows.map((r) => r.cells);

    autoTable(doc, {
      startY: 18,
      head: [["Staff", ...dayHeaders]],
      body: tableBody,
      headStyles: {
        fillColor: [28, 29, 32],
        textColor: [245, 240, 232],
        fontStyle: "bold",
        fontSize: 7.5,
        cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      },
      bodyStyles: {
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
        overflow: "linebreak",
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        minCellHeight: 14,
      },
      columnStyles: {
        0: { cellWidth: staffColW },
        ...Object.fromEntries(dayHeaders.map((_, i) => [i + 1, { cellWidth: dayColW }])),
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const pdfRow = pdfRows[data.row.index];
        if (!pdfRow) return;

        // Separator row: white bg, 3pt height, no borders
        if (pdfRow.isSeparator) {
          data.cell.styles.fillColor = [255, 255, 255];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontSize = 1;
          data.cell.styles.cellPadding = { top: 1, bottom: 1, left: 0, right: 0 };
          data.cell.styles.lineWidth = 0;
          data.cell.styles.minCellHeight = 3;
          return;
        }

        // Staff name column (col 0): bold name — title drawn via didDrawCell
        if (data.column.index === 0) {
          data.cell.styles.fontStyle = "bold";
          return;
        }

        // Shift cells: apply property bg + text color
        const person = staffToShow[pdfRow.staffIndex];
        if (!person) return;
        const day = weekDays[data.column.index - 1];
        const dateStr = format(day, "yyyy-MM-dd");
        const dayShifts = displayShifts.filter(
          (s) => s.staff_id === person.id && s.shift_date === dateStr && !s.is_leave
        );
        if (dayShifts.length > 0) {
          const col = getExportPropColor(dayShifts[0].property_id);
          data.cell.styles.fillColor = [
            parseInt(col.bg.slice(0, 2), 16),
            parseInt(col.bg.slice(2, 4), 16),
            parseInt(col.bg.slice(4, 6), 16),
          ];
          data.cell.styles.textColor = [
            parseInt(col.text.slice(0, 2), 16),
            parseInt(col.text.slice(2, 4), 16),
            parseInt(col.text.slice(4, 6), 16),
          ];
        }
      },
      didDrawCell: (data) => {
        // Draw job title in smaller italic grey text directly below the bold name
        if (data.section !== "body" || data.column.index !== 0) return;
        const pdfRow = pdfRows[data.row.index];
        if (!pdfRow || pdfRow.isSeparator) return;
        const person = staffToShow[pdfRow.staffIndex];
        if (!person?.job_title) return;

        // Name baseline is at y + top-padding + font-size-in-mm
        // 7.5pt ≈ 2.6mm; top padding = 2.5mm
        const nameBaselineY = data.cell.y + 2.5 + 2.6;
        const titleY = nameBaselineY + 3.5; // 3.5mm gap below name baseline
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(110, 110, 110);
        doc.text(person.job_title, data.cell.x + 2, titleY, { maxWidth: staffColW - 4 });
        // Reset
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7.5);
      },
      margin: { left: marginL, right: marginR },
    });

    // No legend — property names and colors in the cells are sufficient

    doc.save(`staff-schedule-${format(weekStart, "yyyy-MM-dd")}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => calView === "month"
              ? setMonthStart((m) => subMonths(m, 1))
              : setWeekStart((w) => subWeeks(w, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[160px]">
            <p className="text-sm font-semibold">{weekLabel}</p>
            {calView === "week" && !isCurrentWeek && (
              <button
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                This week
              </button>
            )}
            {calView === "month" && !isCurrentMonth && (
              <button
                onClick={() => setMonthStart(startOfMonth(new Date()))}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                This month
              </button>
            )}
          </div>
          <button
            onClick={() => calView === "month"
              ? setMonthStart((m) => addMonths(m, 1))
              : setWeekStart((w) => addWeeks(w, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* View toggle + Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Week / Month toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden h-8">
            <button
              onClick={() => setCalView("week")}
              className={cn(
                "px-3 h-full text-xs font-medium transition-colors",
                calView === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              Week
            </button>
            <button
              onClick={() => setCalView("month")}
              className={cn(
                "px-3 h-full text-xs font-medium transition-colors border-l border-border",
                calView === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              Month
            </button>
          </div>

          {/* Visible to ALL users — primary CTA for staff */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8 border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => { setShowLeaveModal(true); }}
          >
            <PlaneTakeoff size={13} /> Request Time Off
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
              {calView === "week" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleExportExcel}
                    title="Download Excel"
                  >
                    <Download size={15} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={handleExportPDF}
                    title="Download PDF"
                  >
                    PDF
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Filter Bar (search / department / property) ───────────────────── */}
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search staff…"
            className="h-8 text-xs w-44"
          />
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departmentOptions.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterProperty} onValueChange={setFilterProperty}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Property" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => { setFilterSearch(""); setFilterDepartment("all"); setFilterProperty("all"); }}
            >
              <X size={13} /> Clear
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">
            {staffToShow.length} {staffToShow.length === 1 ? "person" : "people"}
          </span>
        </div>
      )}

      {/* Property legend rendered below the calendar — see bottom of section. */}

      {/* ── Month View ────────────────────────────────────────────────────── */}
      {calView === "month" && (
        <StaffMonthGrid
          monthStart={monthStart}
          staffToShow={staffToShow}
          displayShifts={displayShifts}
          properties={properties}
          loading={loading || profilesLoading}
          canEdit={canEdit}
          onShowScheduleManager={() => setShowScheduleManager(true)}
        />
      )}

      {/* ── Week Schedule Grid ────────────────────────────────────────────── */}
      {calView === "week" && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Day headers */}
          <div className="grid border-b border-border" style={{ gridTemplateColumns: "200px repeat(7, 1fr)" }}>
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
              <div
                key={person.id}
                className={cn(
                  "border-b border-border last:border-b-0 transition-colors",
                  rowDragOver === person.id && "bg-primary/5 ring-1 ring-inset ring-primary/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setRowDragOver(person.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRowDragOver(null); }}
                onDrop={(e) => { e.preventDefault(); handleRowDrop(person.id); }}
              >
                <div
                  className="grid"
                  style={{ gridTemplateColumns: "200px repeat(7, 1fr)" }}
                >
                  {/* Staff name cell */}
                  <div className="px-1.5 py-2 border-r border-border flex items-center gap-1.5 min-w-0">
                    {canEdit && (
                      <div
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); handleRowDragStart(person.id); }}
                        onDragEnd={() => { rowDragRef.current = null; setRowDragOver(null); }}
                        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                        title="Drag to reorder"
                      >
                        <GripVertical size={12} />
                      </div>
                    )}
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold",
                      person.is_draft ? "bg-amber-500/20 text-amber-400" : "bg-primary/10 text-primary"
                    )}>
                      {getDisplayName(person, "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <p className={cn(
                          "text-xs font-medium truncate",
                          person.is_draft && "italic text-muted-foreground"
                        )}>
                          {getDisplayName(person)}
                        </p>
                      </div>
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
                    return (
                      <StaffDayCell
                        key={dateStr}
                        dateStr={dateStr}
                        day={day}
                        shifts={dayShifts}
                        properties={properties}
                        canEdit={canEdit}
                        onCellClick={() => handleCellClick(dateStr, person.id)}
                        onDragStart={handleDragStart}
                        onDrop={handleDrop}
                        onDeleteShift={async (shift) => {
                          if (shift.concrete_id) {
                            await deleteShift(shift.concrete_id);
                          } else if (shift.is_virtual && shift.schedule_id) {
                            // Insert a cancelled concrete record to override the recurring pattern for this day
                            const { error } = await supabase.from("staff_shifts").insert({
                              staff_id: shift.staff_id,
                              property_id: shift.property_id,
                              schedule_id: shift.schedule_id,
                              shift_date: shift.shift_date,
                              start_time: shift.start_time,
                              end_time: shift.end_time,
                              status: "cancelled",
                              notes: "Cancelled for this day",
                              created_by: userId,
                            } as never);
                            if (error) { toast.error("Failed to cancel shift"); }
                            else { toast.success("Shift cancelled for this day"); refetch(); }
                          }
                        }}
                        onShiftDoubleClick={(shift) => {
                          setEditingShift(shift);
                          setPrefillDate(shift.shift_date);
                          setPrefillStaff(shift.staff_id);
                          setShowShiftModal(true);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
        </div>
      )}

      {/* ── Leave Panel ──────────────────────────────────────────── */}
      <LeavePanel
        leaveRequests={leaveRequests}
        profiles={profiles}
        onReview={reviewLeaveRequest}
        onDelete={deleteLeaveRequest}
        onNew={() => setShowLeaveModal(true)}
        userId={userId}
        canEdit={canEdit}
      />

      {/* ── Property Legend (grouped by city) ─────────────────────────────── */}
      {properties.length > 0 && (() => {
        const groups = new Map<string, Property[]>();
        for (const p of properties) {
          const key = (p.city?.trim() || p.country?.trim() || "Other");
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(p);
        }
        const groupEntries = Array.from(groups.entries());
        return (
          <div className="space-y-1.5 pt-1">
            {groupEntries.map(([city, props]) => (
              <div key={city} className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 flex-shrink-0">
                  {city}
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                  {props.map((p) => {
                    const col = propColor(p.id, properties);
                    return (
                      <div key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                        {p.name}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 flex-shrink-0">
                Other
              </span>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarOff size={10} /> Leave
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <ShiftModal
        open={showShiftModal}
        onClose={() => { setShowShiftModal(false); setEditingShift(null); }}
        onSave={createShift}
        onUpdate={updateShift}
        onUpdateSchedule={updateSchedule}
        onSaveSchedule={createSchedule}
        profiles={profiles}
        properties={properties}
        prefillDate={prefillDate}
        prefillStaff={prefillStaff}
        userId={userId}
        editShift={editingShift}
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
