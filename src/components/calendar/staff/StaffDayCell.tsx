import { useState } from "react";
import { isToday } from "date-fns";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftChip } from "./ShiftChip";
import type { DisplayShift, Property } from "./types";

export function StaffDayCell({
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
      onDrop={(_e) => { setDragOver(false); onDrop(dateStr); }}
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
