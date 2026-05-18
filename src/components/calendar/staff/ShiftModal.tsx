import { useEffect, useState } from "react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { StaffSchedule, StaffShift } from "@/hooks/useStaffSchedules";
import { DOW_FULL, DOW_LABELS } from "./constants";
import { getDisplayName } from "./utils";
import type { DisplayShift, Profile, Property } from "./types";

type ShiftMode = "single" | "range" | "recurring";

export function ShiftModal({
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
