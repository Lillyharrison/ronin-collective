import { ChevronLeft, ChevronRight, Plus, Settings2, PlaneTakeoff, Download, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function CalendarToolbar({
  calView,
  setCalView,
  weekLabel,
  isCurrentWeek,
  isCurrentMonth,
  onPrev,
  onNext,
  onToday,
  canEdit,
  rangeStart,
  rangeEnd,
  setRangeStart,
  setRangeEnd,
  onRequestLeave,
  onAddShift,
  onOpenScheduleManager,
  onExportExcel,
  onExportPDF,
}: {
  calView: "week" | "month";
  setCalView: (v: "week" | "month") => void;
  weekLabel: string;
  isCurrentWeek: boolean;
  isCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  canEdit: boolean;
  rangeStart?: Date;
  rangeEnd?: Date;
  setRangeStart?: (d: Date) => void;
  setRangeEnd?: (d: Date) => void;
  onRequestLeave: () => void;
  onAddShift: () => void;
  onOpenScheduleManager: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
}) {
  const showRangePickers = calView === "month" && rangeStart && rangeEnd && setRangeStart && setRangeEnd;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="w-8 h-8 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center min-w-[160px]">
          <p className="text-sm font-semibold">{weekLabel}</p>
          {calView === "week" && !isCurrentWeek && (
            <button onClick={onToday} className="text-[10px] text-muted-foreground hover:text-foreground underline">
              This week
            </button>
          )}
          {calView === "month" && !isCurrentMonth && (
            <button onClick={onToday} className="text-[10px] text-muted-foreground hover:text-foreground underline">
              This month
            </button>
          )}
        </div>
        <button
          onClick={onNext}
          className="w-8 h-8 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
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

        {showRangePickers && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">From</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-normal">
                  <CalendarIcon size={12} />
                  {format(rangeStart!, "d MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={rangeStart}
                  onSelect={(d) => d && setRangeStart!(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <span className="text-[11px] text-muted-foreground">To</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-normal">
                  <CalendarIcon size={12} />
                  {format(rangeEnd!, "d MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={rangeEnd}
                  onSelect={(d) => d && setRangeEnd!(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-8 border-primary/40 text-primary hover:bg-primary/10"
          onClick={onRequestLeave}
        >
          <PlaneTakeoff size={13} /> Request Time Off
        </Button>
        {canEdit && (
          <>
            <Button size="sm" className="gap-1.5 text-xs h-8" onClick={onAddShift}>
              <Plus size={13} /> Shift
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onOpenScheduleManager}
              title="Manage recurring schedules"
            >
              <Settings2 size={15} />
            </Button>
            {calView === "week" && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExportExcel} title="Download Excel">
                  <Download size={15} />
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={onExportPDF} title="Download PDF">
                  PDF
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
