import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StaffSchedule } from "@/hooks/useStaffSchedules";
import { DOW_FULL, DOW_LABELS } from "./constants";
import { formatTime, getDisplayName, propColor } from "./utils";
import type { Profile, Property } from "./types";

export function ScheduleManagerDrawer({
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
                      {DOW_LABELS.map((_d, i) => (
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
