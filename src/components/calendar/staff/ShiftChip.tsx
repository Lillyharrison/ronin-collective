import { CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { propColor, formatTime } from "./utils";
import type { DisplayShift, Property } from "./types";

export function ShiftChip({
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
  const rawNotes = (shift.notes ?? "").trim();
  const virtualLocMatch = rawNotes.match(/^📍 (Office|Remote)/);
  const virtualLoc = virtualLocMatch?.[1];
  const displayLabel = prop?.name ?? virtualLoc ?? "—";

  // Show any note text that isn't just the location prefix
  const noteBody = rawNotes
    .replace(/^📍 (?:Office|Remote)(?:\s*[–—-]\s*)?/, "")
    .trim();

  const timeLabel = shift.start_time && shift.end_time
    ? `${formatTime(shift.start_time)}–${formatTime(shift.end_time)}`
    : shift.start_time ? formatTime(shift.start_time) : "";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={noteBody || "Double-click to edit"}
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
      {noteBody && (
        <div className="opacity-80 text-[9px] line-clamp-2 break-words mt-0.5">
          {noteBody}
        </div>
      )}
    </div>
  );
}
