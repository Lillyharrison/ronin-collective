import { ChevronLeft, ChevronRight, Plus, Settings2, PlaneTakeoff, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onRequestLeave: () => void;
  onAddShift: () => void;
  onOpenScheduleManager: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
}) {
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
