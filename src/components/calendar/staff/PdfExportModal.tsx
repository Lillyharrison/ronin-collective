import { useEffect, useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type PdfExportLayout = "weekly" | "monthly" | "both";

export interface PdfExportOptions {
  rangeStart: Date;
  rangeEnd: Date;
  layout: PdfExportLayout;
  includeTracking: boolean;
}

export function PdfExportModal({
  open,
  onClose,
  defaultStart,
  defaultEnd,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  defaultStart: Date;
  defaultEnd: Date;
  onExport: (opts: PdfExportOptions) => void;
}) {
  const [start, setStart] = useState<Date>(defaultStart);
  const [end, setEnd] = useState<Date>(defaultEnd);
  const [layout, setLayout] = useState<PdfExportLayout>("weekly");
  const [includeTracking, setIncludeTracking] = useState<boolean>(true);

  const setQuickRange = (kind: "thisWeek" | "thisMonth" | "next3" | "thisYear") => {
    const now = new Date();
    if (kind === "thisWeek") {
      setStart(startOfWeek(now, { weekStartsOn: 1 }));
      setEnd(endOfWeek(now, { weekStartsOn: 1 }));
    } else if (kind === "thisMonth") {
      setStart(startOfMonth(now));
      setEnd(endOfMonth(now));
    } else if (kind === "next3") {
      setStart(startOfMonth(now));
      setEnd(endOfMonth(addMonths(now, 2)));
    } else {
      setStart(new Date(now.getFullYear(), 0, 1));
      setEnd(new Date(now.getFullYear(), 11, 31));
    }
  };

  const handleExport = () => {
    if (start > end) return;
    onExport({ rangeStart: start, rangeEnd: end, layout, includeTracking });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download Schedule PDF</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 px-1">
          {/* Date Range */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Date Range
            </Label>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 flex-1 justify-start gap-2 text-xs font-normal">
                    <CalendarIcon size={13} />
                    {format(start, "d MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={start} onSelect={(d) => d && setStart(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 flex-1 justify-start gap-2 text-xs font-normal">
                    <CalendarIcon size={13} />
                    {format(end, "d MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={end} onSelect={(d) => d && setEnd(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <QuickBtn onClick={() => setQuickRange("thisWeek")}>This week</QuickBtn>
              <QuickBtn onClick={() => setQuickRange("thisMonth")}>This month</QuickBtn>
              <QuickBtn onClick={() => setQuickRange("next3")}>Next 3 months</QuickBtn>
              <QuickBtn onClick={() => setQuickRange("thisYear")}>This year</QuickBtn>
            </div>
            {start > end && (
              <p className="text-[11px] text-destructive">Start date must be before end date.</p>
            )}
          </div>

          {/* Layout */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Layout
            </Label>
            <RadioGroup value={layout} onValueChange={(v) => setLayout(v as PdfExportLayout)} className="gap-2">
              <LayoutOption value="weekly" label="Weekly stacked" description="Portrait pages, ~4 weeks per page. Detailed shift times and properties — best for posting/staff reference." current={layout} />
              <LayoutOption value="monthly" label="Monthly overview" description="Landscape pages, ~4 months per page. Compact day-by-day color grid — best for coverage planning." current={layout} />
              <LayoutOption value="both" label="Both" description="Weekly pages first, followed by monthly overview pages." current={layout} />
            </RadioGroup>
          </div>

          {/* Tracking toggle */}
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor="include-tracking" className="text-sm font-medium cursor-pointer">
                Include staff hours tracking
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Appends a compact summary table (days, hours, leave) after the calendars.
              </p>
            </div>
            <Switch
              id="include-tracking"
              checked={includeTracking}
              onCheckedChange={setIncludeTracking}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-3 mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleExport} disabled={start > end}>Download PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 text-[11px] rounded-md border border-border bg-background hover:bg-muted transition-colors"
    >
      {children}
    </button>
  );
}

function LayoutOption({
  value, label, description, current,
}: { value: PdfExportLayout; label: string; description: string; current: PdfExportLayout }) {
  const selected = current === value;
  return (
    <label
      htmlFor={`layout-${value}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
      )}
    >
      <RadioGroupItem value={value} id={`layout-${value}`} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
    </label>
  );
}
