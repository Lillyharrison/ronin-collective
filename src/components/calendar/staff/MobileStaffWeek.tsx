import { useState } from "react";
import { format, isToday } from "date-fns";
import { ClipboardList, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatTime, getDisplayName, propColor } from "./utils";
import { LEAVE_TYPE_CONFIG } from "./constants";
import type { DisplayShift, Profile, Property } from "./types";

export interface MobileStaffWeekProps {
  weekDays: Date[];
  staffToShow: Profile[];
  displayShifts: DisplayShift[];
  properties: Property[];
  loading: boolean;
  canEdit: boolean;
  onCellClick: (date: string, staffId: string) => void;
  onOpenStaffScheduleManager: (staffId: string) => void;
  onShiftDoubleClick: (shift: DisplayShift) => void;
}

function shiftLabel(shift: DisplayShift, properties: Property[]) {
  if (shift.is_leave) return (LEAVE_TYPE_CONFIG[shift.leave_type ?? "other"] ?? LEAVE_TYPE_CONFIG.other).label;
  return properties.find(p => p.id === shift.property_id)?.name ?? shift.notes?.match(/^📍 (Office|Remote)/)?.[1] ?? "Shift";
}

function shortTime(time: string | null) {
  if (!time) return "";
  const [hour, minute] = time.split(":");
  const h = Number(hour);
  return `${h % 12 || 12}${minute === "00" ? "" : `:${minute}`}${h < 12 ? "a" : "p"}`;
}

export function MobileStaffWeek({ weekDays, staffToShow, displayShifts, properties, loading, canEdit, onCellClick, onOpenStaffScheduleManager, onShiftDoubleClick }: MobileStaffWeekProps) {
  const [selected, setSelected] = useState<DisplayShift | null>(null);
  const days = weekDays.map(day => ({ day, date: format(day, "yyyy-MM-dd") }));
  const selectedPerson = staffToShow.find(p => p.id === selected?.staff_id);

  if (loading) return <div className="h-40 animate-pulse bg-muted/20" />;
  if (!staffToShow.length) return <p className="py-8 text-center text-base text-muted-foreground">No staff scheduled this week</p>;

  return (
    <div className="space-y-0">
      {canEdit && (
        <div className="grid grid-cols-7 border-b border-border bg-card sticky top-0 z-10">
          {days.map(({ day, date }) => (
            <div key={date} className={cn("text-center py-2 min-w-0", isToday(day) && "bg-primary/10 text-primary")}>
              <p className="text-base">{format(day, "EEEEE")}</p>
              <p className="text-base font-semibold">{format(day, "d")}</p>
            </div>
          ))}
        </div>
      )}
      {staffToShow.map(person => {
        const shifts = displayShifts.filter(s => s.staff_id === person.id);
        return (
          <section key={person.id} className="border-b border-border last:border-b-0 py-2">
            <div className="flex items-center justify-between gap-2 min-w-0 mb-1">
              <div className="min-w-0">
                <h3 className="text-base font-semibold break-words">{getDisplayName(person)}</h3>
                {!canEdit && person.job_title && <p className="text-base text-muted-foreground">{person.job_title}</p>}
              </div>
              {canEdit && <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" title={`Manage schedules for ${getDisplayName(person)}`} onClick={() => onOpenStaffScheduleManager(person.id)}><Settings2 size={16} /></Button>}
            </div>
            <div className={canEdit ? "grid grid-cols-7" : "space-y-1"}>
              {days.map(({ day, date }) => {
                const dayShifts = shifts.filter(s => s.shift_date === date).sort((a, b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99"));
                if (!canEdit && !dayShifts.length) return null;
                return (
                  <div key={date} className={cn(canEdit ? "min-w-0 border-r border-border last:border-r-0 px-0.5 space-y-1" : "grid grid-cols-[64px_minmax(0,1fr)] gap-2 py-2 border-t border-border", isToday(day) && "bg-primary/5")}>
                    {!canEdit && <div className="text-base text-muted-foreground">{format(day, "EEE")}<br />{format(day, "d MMM")}</div>}
                    <div className="min-w-0 space-y-1">
                      {dayShifts.map(shift => {
                        const color = propColor(shift.property_id, properties);
                        const label = shiftLabel(shift, properties);
                        return (
                          <Button key={shift.key} variant="outline" title={`${label} ${formatTime(shift.start_time)}–${formatTime(shift.end_time)}`} onClick={() => setSelected(shift)} className={cn("w-full h-auto min-h-11 text-base whitespace-normal font-normal", canEdit ? "px-0.5 py-1 flex-col gap-0 leading-tight" : "items-start text-left px-2 py-2 flex-col gap-1", shift.is_leave ? "bg-muted text-muted-foreground border-border" : `${color.bg} ${color.text}`)}>
                            {!canEdit && <span className="block truncate max-w-full font-medium">{label}</span>}
                            {shift.start_time && <span>{canEdit ? shortTime(shift.start_time) : formatTime(shift.start_time)}{!canEdit && shift.end_time ? `–${formatTime(shift.end_time)}` : ""}</span>}
                            {canEdit && shift.end_time && <span className="opacity-80">{shortTime(shift.end_time)}</span>}
                            {shift.is_leave && shift.leave_status === "pending" && <span className="break-all">Pending</span>}
                            {!canEdit && shift.notes && <span className="break-words">{shift.notes}</span>}
                            {!canEdit && shift.checklist_template_id && <ClipboardList size={16} />}
                          </Button>
                        );
                      })}
                      {canEdit && !dayShifts.length && <Button variant="ghost" size="icon" className="min-h-11 h-11 w-full text-muted-foreground" aria-label={`Add shift for ${getDisplayName(person)} on ${format(day, "EEE d MMM")}`} onClick={() => onCellClick(date, person.id)}><Plus size={16} /></Button>}
                    </div>
                  </div>
                );
              })}
            </div>
            {!canEdit && !shifts.length && <p className="text-base text-muted-foreground py-2">No shifts this week</p>}
          </section>
        );
      })}
      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selected ? shiftLabel(selected, properties) : "Shift"}</DialogTitle>
            <DialogDescription>{getDisplayName(selectedPerson)}{selected ? ` · ${format(new Date(`${selected.shift_date}T12:00:00`), "EEE d MMM yyyy")}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 space-y-3 text-base">
            {selected?.start_time && <p>{formatTime(selected.start_time)}{selected.end_time ? `–${formatTime(selected.end_time)}` : ""}</p>}
            {selected?.is_leave && <p>{selected.leave_status === "pending" ? "Awaiting approval" : "Approved"}</p>}
            {selected?.notes && <p className="whitespace-pre-wrap break-words">{selected.notes}</p>}
            {selected?.checklist_template_id && <p className="flex items-center gap-2"><ClipboardList size={16} />Checklist attached</p>}
          </div>
          <div className="shrink-0 flex gap-2 pt-3 border-t border-border">
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            {canEdit && selected && <Button onClick={() => { onShiftDoubleClick(selected); setSelected(null); }}>{selected.is_leave ? "Review leave" : "Edit shift"}</Button>}
            {canEdit && selected && <Button variant="outline" onClick={() => { onCellClick(selected.shift_date, selected.staff_id); setSelected(null); }}><Plus size={16} className="mr-1" />Shift</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}