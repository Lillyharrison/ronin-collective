import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { addDays, format, isToday, parseISO, isSameMonth, isSameYear } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ShiftChip } from "@/components/calendar/staff/ShiftChip";
import { buildDisplayShifts } from "@/components/calendar/staff/utils";
import { getDisplayName } from "@/components/calendar/staff/utils";
import type { DisplayShift, Profile, Property } from "@/components/calendar/staff/types";
import type { StaffSchedule, StaffShift, StaffLeaveRequest } from "@/hooks/useStaffSchedules";

interface SharePayload {
  week_start: string;
  week_end: string;
  range_start: string;
  range_end: string;
  label: string | null;
  staff: Profile[];
  properties: Property[];
  shifts: StaffShift[];
  schedules: StaffSchedule[];
  leave_requests: StaffLeaveRequest[];
}

interface EditingState {
  staff_id: string;
  shift_date: string;
  existing?: DisplayShift;
}

export default function SharedStaffSchedule() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SharePayload | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [viewWeekStart, setViewWeekStart] = useState<string | null>(null);

  const fetchData = async (weekStart?: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("staff-schedule-share-get", {
        body: { token, week_start: weekStart ?? viewWeekStart ?? undefined },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const payload = data as SharePayload;
      setData(payload);
      setViewWeekStart(payload.week_start);
      setError(null);
    } catch (e) {
      setError((e as Error)?.message ?? "Couldn't load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const canPrev = !!data && data.week_start > data.range_start;
  const canNext = !!data && data.week_end < data.range_end;
  const goPrev = () => {
    if (!data) return;
    const prev = format(addDays(parseISO(data.week_start), -7), "yyyy-MM-dd");
    fetchData(prev < data.range_start ? data.range_start : prev);
  };
  const goNext = () => {
    if (!data) return;
    const next = format(addDays(parseISO(data.week_start), 7), "yyyy-MM-dd");
    fetchData(next > data.range_end ? data.range_end : next);
  };

  const weekDays = useMemo(() => {
    if (!data) return [];
    const start = parseISO(data.week_start);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [data]);

  const displayShifts = useMemo(() => {
    if (!data) return [] as DisplayShift[];
    return buildDisplayShifts(weekDays, data.schedules, data.shifts, data.leave_requests, data.staff);
  }, [data, weekDays]);

  const staffToShow = useMemo(() => {
    if (!data) return [] as Profile[];
    const ids = new Set(displayShifts.map((s) => s.staff_id));
    return data.staff.filter((p) => ids.has(p.id));
  }, [data, displayShifts]);

  // Snap the staff column to the widest name/job-title in view (avatar 24 + gap 6 + text + padding).
  const staffColWidth = useMemo(() => {
    const longest = staffToShow.reduce((max, p) => {
      const name = getDisplayName(p, "?");
      const job = p.job_title ?? "";
      return Math.max(max, name.length, job.length * 0.85);
    }, 0);
    return Math.max(110, Math.min(220, Math.round(24 + 6 + longest * 7 + 16)));
  }, [staffToShow]);
  const gridTemplate = `${staffColWidth}px repeat(7, minmax(0, 1fr))`;
  const minInnerWidth = staffColWidth + 7 * 88;

  const titleRange = useMemo(() => {
    if (!data) return "";
    const s = parseISO(data.week_start);
    const e = parseISO(data.week_end);
    const startFmt = isSameMonth(s, e)
      ? format(s, "d")
      : isSameYear(s, e) ? format(s, "d MMM") : format(s, "d MMM yyyy");
    return `${startFmt} – ${format(e, "d MMM yyyy")}`;
  }, [data]);

  if (!token || token.length < 16) {
    return <FullScreen msg="Invalid share link" sub="The link is missing or malformed." />;
  }
  if (loading) {
    return (
      <FullScreen
        msg="Loading shared schedule…"
        sub={<Loader2 className="w-5 h-5 animate-spin mx-auto mt-3" />}
      />
    );
  }
  if (error) {
    return <FullScreen msg="Can't open this link" sub={error} />;
  }
  if (!data) return null;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <header className="space-y-2 border-b border-border pb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared staff schedule</p>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold">{titleRange}</h1>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={goPrev} disabled={!canPrev} className="h-8 w-8 p-0">
                <ChevronLeft size={16} />
              </Button>
              <Button variant="outline" size="sm" onClick={goNext} disabled={!canNext} className="h-8 w-8 p-0">
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
          {data.label && <p className="text-sm text-muted-foreground">{data.label}</p>}
          <p className="text-[11px] text-muted-foreground">
            Editable range: {format(parseISO(data.range_start), "d MMM yyyy")} – {format(parseISO(data.range_end), "d MMM yyyy")}
          </p>
        </header>

        {staffToShow.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No shifts scheduled this week.</p>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden overflow-x-auto">
            <div style={{ minWidth: minInnerWidth }}>
              <div className="grid border-b border-border" style={{ gridTemplateColumns: gridTemplate }}>
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

              {staffToShow.map((person) => {
                const personShifts = displayShifts.filter((s) => s.staff_id === person.id);
                return (
                  <div key={person.id} className="border-b border-border last:border-b-0">
                    <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
                      <div className="px-1.5 py-2 border-r border-border flex items-center gap-1.5 min-w-0">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold",
                          person.is_draft ? "bg-amber-500/20 text-amber-400" : "bg-primary/10 text-primary"
                        )}>
                          {getDisplayName(person, "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-xs font-medium truncate", person.is_draft && "italic text-muted-foreground")}>
                            {getDisplayName(person)}
                          </p>
                          {person.job_title && (
                            <p className="text-[9px] text-muted-foreground truncate">{person.job_title}</p>
                          )}
                        </div>
                      </div>

                      {weekDays.map((day) => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const dayShifts = personShifts.filter((s) => s.shift_date === dateStr);
                        return (
                          <div
                            key={dateStr}
                            className={cn(
                              "border-r border-border last:border-r-0 p-1 min-h-[52px]",
                              isToday(day) && "bg-primary/5"
                            )}
                          >
                            <div className="flex flex-col gap-0.5 w-full">
                              {dayShifts.map((sh) => (
                                <div key={sh.key} className="relative group">
                                  <ShiftChip
                                    shift={sh}
                                    properties={data.properties}
                                    onDragStart={() => {}}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (sh.is_leave) return;
                                      setEditing({ staff_id: person.id, shift_date: dateStr, existing: sh });
                                    }}
                                  />
                                </div>
                              ))}
                              <button
                                onClick={() => setEditing({ staff_id: person.id, shift_date: dateStr })}
                                className="rounded px-1 py-0.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
                              >
                                <Plus size={9} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <ShiftEditDialog
          token={token}
          editing={editing}
          properties={data.properties}
          staffName={getDisplayName(data.staff.find((s) => s.id === editing.staff_id))}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function FullScreen({ msg, sub }: { msg: string; sub?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold mb-2">{msg}</h1>
        {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function ShiftEditDialog({
  token, editing, properties, staffName, onClose, onSaved,
}: {
  token: string;
  editing: EditingState;
  properties: Property[];
  staffName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ex = editing.existing;
  const isVirtual = !!ex?.is_virtual;
  const concreteId = ex?.concrete_id ?? null;

  const [startTime, setStartTime] = useState(ex?.start_time?.slice(0, 5) ?? "09:00");
  const [endTime, setEndTime] = useState(ex?.end_time?.slice(0, 5) ?? "17:00");
  const [propertyId, setPropertyId] = useState<string>(ex?.property_id ?? "__none__");
  const [notes, setNotes] = useState(ex?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const callMutate = async (action: "create" | "update" | "delete", body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("staff-schedule-share-mutate", {
        body: { token, action, shift: body },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success(action === "delete" ? "Shift removed" : "Shift saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const payload = {
      staff_id: editing.staff_id,
      shift_date: editing.shift_date,
      start_time: startTime + ":00",
      end_time: endTime + ":00",
      property_id: propertyId === "__none__" ? null : propertyId,
      notes: notes || null,
      status: "scheduled",
      schedule_id: ex?.schedule_id ?? null,
    };
    if (concreteId) callMutate("update", { ...payload, id: concreteId });
    else callMutate("create", payload);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col max-w-md">
        <DialogHeader>
          <DialogTitle>{concreteId ? "Edit shift" : isVirtual ? "Override recurring shift" : "Add shift"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {staffName} · {format(parseISO(editing.shift_date), "EEE d MMM")}
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-base" />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-base" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Property</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No property</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base" />
          </div>
        </div>
        <div className="border-t border-border pt-3 flex gap-2">
          {concreteId && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => callMutate("delete", { id: concreteId })}
              disabled={busy}
            >
              <Trash2 size={14} />
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
