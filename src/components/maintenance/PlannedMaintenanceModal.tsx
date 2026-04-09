import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { PlannedMaintenanceEntry } from "@/hooks/usePlannedMaintenance";

interface Vendor { id: string; name: string; }
interface Property { id: string; name: string; }
interface Profile { id: string; name: string; avatar: string | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (payload: Omit<PlannedMaintenanceEntry, "id" | "created_at" | "updated_at" | "vendor_name" | "property_name" | "assignee_name" | "assignee_avatar">) => Promise<void>;
  initial?: PlannedMaintenanceEntry | null;
  vendors: Vendor[];
  properties: Property[];
  profiles: Profile[];
  userId: string | null;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const RECURRENCE_OPTIONS = [
  { value: "", label: "One-off (no repeat)" },
  { value: "3", label: "Every 3 months (Quarterly)" },
  { value: "6", label: "Every 6 months (Semi-annual)" },
  { value: "12", label: "Every year (Annual)" },
  { value: "custom", label: "Custom interval…" },
];

export function PlannedMaintenanceModal({ open, onClose, onSave, initial, vendors, properties, profiles, userId }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dateType, setDateType] = useState<"specific" | "month_only">("month_only");
  const [specificDate, setSpecificDate] = useState<Date | undefined>();
  const [calOpen, setCalOpen] = useState(false);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [reminderDays, setReminderDays] = useState(90);
  const [recurrence, setRecurrence] = useState("");
  const [customMonths, setCustomMonths] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastServiceDate, setLastServiceDate] = useState("");

  // Populate from initial
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTitle(initial.title);
      setDescription(initial.description ?? "");
      setVendorId(initial.vendor_id ?? "");
      setPropertyId(initial.property_id ?? "");
      setAssignedTo(initial.assigned_to ?? "");
      setDateType(initial.date_type);
      setSpecificDate(initial.scheduled_date ? parseISO(initial.scheduled_date) : undefined);
      setMonth(initial.scheduled_month ?? new Date().getMonth() + 1);
      setYear(initial.scheduled_year ?? new Date().getFullYear());
      setReminderDays(initial.reminder_days);
      const rec = initial.recurrence_months;
      if (!rec) setRecurrence("");
      else if ([3,6,12].includes(rec)) setRecurrence(String(rec));
      else { setRecurrence("custom"); setCustomMonths(String(rec)); }
    } else {
      setTitle(""); setDescription(""); setVendorId(""); setPropertyId("");
      setAssignedTo(""); setDateType("month_only"); setSpecificDate(undefined);
      setMonth(new Date().getMonth() + 1); setYear(new Date().getFullYear());
      setReminderDays(90); setRecurrence(""); setCustomMonths("");
    }
  }, [open, initial]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear + i);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const recurrenceMonths = recurrence === "custom"
      ? (parseInt(customMonths) || null)
      : recurrence ? parseInt(recurrence) : null;

    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      vendor_id: vendorId || null,
      property_id: propertyId || null,
      assigned_to: assignedTo || null,
      date_type: dateType,
      scheduled_date: dateType === "specific" && specificDate ? format(specificDate, "yyyy-MM-dd") : null,
      scheduled_month: dateType === "month_only" ? month : null,
      scheduled_year: dateType === "month_only" ? year : null,
      reminder_days: reminderDays,
      recurrence_months: recurrenceMonths,
      status: initial?.status ?? "to_be_booked",
      last_service_date: initial?.last_service_date ?? null,
      calendar_event_id: initial?.calendar_event_id ?? null,
      created_by: initial?.created_by ?? userId,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col p-0 gap-0 max-w-lg w-full">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <DialogTitle className="font-display text-lg">
            {initial ? "Edit Planned Maintenance" : "Add Planned Maintenance"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. HVAC service, Pool maintenance…" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Scope of work, notes…" rows={3} />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location (Property)</Label>
            <select value={propertyId} onChange={e => setPropertyId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Select property —</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Contractor */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contractor (Vendor)</Label>
            <select value={vendorId} onChange={e => setVendorId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Select vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {/* Assigned to */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned To</Label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Select staff —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Date type toggle */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</Label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setDateType("month_only")}
                className={cn("flex-1 text-xs py-2 transition-colors font-medium",
                  dateType === "month_only" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                )}>
                Month Only
              </button>
              <button
                type="button"
                onClick={() => setDateType("specific")}
                className={cn("flex-1 text-xs py-2 transition-colors font-medium",
                  dateType === "specific" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                )}>
                Specific Date
              </button>
            </div>

            {dateType === "month_only" ? (
              <div className="grid grid-cols-2 gap-2">
                <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
                <select value={year} onChange={e => setYear(parseInt(e.target.value))}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            ) : (
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !specificDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {specificDate ? format(specificDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start">
                  <Calendar
                    mode="single"
                    selected={specificDate}
                    onSelect={d => { setSpecificDate(d); setCalOpen(false); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Reminder */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reminder — days before
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={reminderDays}
                onChange={e => setReminderDays(parseInt(e.target.value) || 90)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">days before scheduled date</span>
            </div>
          </div>

          {/* Recurrence */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recurrence</Label>
            <select value={recurrence} onChange={e => setRecurrence(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {recurrence === "custom" && (
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={customMonths}
                  onChange={e => setCustomMonths(e.target.value)}
                  placeholder="e.g. 18"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">months between services</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-4 border-t border-border flex-shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim() || saving} className="flex-1 sm:flex-none bg-primary hover:bg-primary/90">
            {saving ? "Saving…" : initial ? "Update" : "Add Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
