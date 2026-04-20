import { format, isToday } from "date-fns";
import { Settings2, UserCheck, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StaffDayCell } from "./StaffDayCell";
import { getDisplayName } from "./utils";
import type { DisplayShift, Profile, Property } from "./types";

export function StaffWeekGrid({
  weekDays,
  staffToShow,
  displayShifts,
  properties,
  loading,
  canEdit,
  rowDragOver,
  onRowDragStart,
  onRowDragEnd,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onOpenScheduleManager,
  onOpenStaffScheduleManager,
  onCellClick,
  onDragStart,
  onDrop,
  onDeleteShift,
  onShiftDoubleClick,
}: {
  weekDays: Date[];
  staffToShow: Profile[];
  displayShifts: DisplayShift[];
  properties: Property[];
  loading: boolean;
  canEdit: boolean;
  rowDragOver: string | null;
  onRowDragStart: (staffId: string) => void;
  onRowDragEnd: () => void;
  onRowDragOver: (staffId: string) => void;
  onRowDragLeave: () => void;
  onRowDrop: (staffId: string) => void;
  onOpenScheduleManager: () => void;
  onOpenStaffScheduleManager: (staffId: string) => void;
  onCellClick: (dateStr: string, staffId: string) => void;
  onDragStart: (shift: DisplayShift) => void;
  onDrop: (targetDate: string) => void;
  onDeleteShift: (shift: DisplayShift) => void;
  onShiftDoubleClick: (shift: DisplayShift) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
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

      {loading ? (
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
            <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={onOpenScheduleManager}>
              <Settings2 size={13} /> Set Up Schedules
            </Button>
          )}
        </div>
      ) : (
        staffToShow.map((person) => {
          const personShifts = displayShifts.filter((s) => s.staff_id === person.id);

          return (
            <div
              key={person.id}
              className={cn(
                "border-b border-border last:border-b-0 transition-colors",
                rowDragOver === person.id && "bg-primary/5 ring-1 ring-inset ring-primary/30"
              )}
              onDragOver={(e) => { e.preventDefault(); onRowDragOver(person.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onRowDragLeave(); }}
              onDrop={(e) => { e.preventDefault(); onRowDrop(person.id); }}
            >
              <div className="grid" style={{ gridTemplateColumns: "200px repeat(7, 1fr)" }}>
                <div className="px-1.5 py-2 border-r border-border flex items-center gap-1.5 min-w-0">
                  {canEdit && (
                    <div
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); onRowDragStart(person.id); }}
                      onDragEnd={onRowDragEnd}
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
                      onClick={() => onOpenStaffScheduleManager(person.id)}
                      className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                      title="Manage schedules"
                    >
                      <Settings2 size={10} />
                    </button>
                  )}
                </div>

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
                      onCellClick={() => onCellClick(dateStr, person.id)}
                      onDragStart={onDragStart}
                      onDrop={onDrop}
                      onDeleteShift={onDeleteShift}
                      onShiftDoubleClick={onShiftDoubleClick}
                    />
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
