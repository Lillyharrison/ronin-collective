import { useState, useEffect, useCallback, useRef } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { StaffCalendarTab } from "@/components/calendar/StaffCalendarTab";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ChevronLeft, ChevronRight, Settings, RefreshCw, Plus, CalendarDays,
  MapPin, Clock, Tag, Globe, Lock, Plane, Users, Wrench, PartyPopper,
  Calendar, X, Check, AlertTriangle, Cake, Package, UserCheck, HardHat,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths,
  subMonths, parseISO, isWithinInterval, addDays, setYear, setMonth,
  setDate as setDayFn, getYear, getMonth, getDate, startOfDay, endOfDay,
  isBefore, isAfter,
} from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/contexts/NavigationContext";

// ─── Types ───────────────────────────────────────────────────────────────────

type CalendarMode = "family" | "ronin";
type RoninTab = "all" | "birthdays" | "maintenance" | "deliveries" | "travel" | "construction" | "staff";

interface CalEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  event_type: string;
  is_private: boolean;
  keywords: string[] | null;
  location: string | null;
  status: string;
  calendar_source: string | null;
  property_id: string | null;
  // virtual fields for Ronin events
  _source?: "calendar_events" | "maintenance" | "orders" | "birthday" | "planned_maintenance";
  _source_id?: string;
  _color?: string;
  _tab?: RoninTab;
  _is_draggable?: boolean;
}

interface Property {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  birthday: string | null;
  avatar_url: string | null;
  job_title: string | null;
}

interface MaintenanceIssue {
  id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
  priority: string;
  property_id: string | null;
}

interface Order {
  id: string;
  title: string;
  expected_delivery: string | null;
  status: string;
  property_id: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const RONIN_TAB_CONFIG: Record<RoninTab, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  all:          { label: "All",               icon: <Calendar size={12} />,    color: "text-foreground",      bg: "bg-muted" },
  birthdays:    { label: "Birthdays",         icon: <Cake size={12} />,        color: "text-pink-400",        bg: "bg-pink-500/15 border-pink-500/30" },
  maintenance:  { label: "Maintenance",       icon: <Wrench size={12} />,      color: "text-amber-400",       bg: "bg-amber-500/15 border-amber-500/30" },
  deliveries:   { label: "Deliveries",        icon: <Package size={12} />,     color: "text-emerald-400",     bg: "bg-emerald-500/15 border-emerald-500/30" },
  travel:       { label: "Travel",            icon: <Plane size={12} />,       color: "text-blue-400",        bg: "bg-blue-500/15 border-blue-500/30" },
  construction: { label: "Construction",      icon: <HardHat size={12} />,     color: "text-orange-400",      bg: "bg-orange-500/15 border-orange-500/30" },
  staff:        { label: "Staff",             icon: <UserCheck size={12} />,   color: "text-violet-400",      bg: "bg-violet-500/15 border-violet-500/30" },
};

const FAMILY_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  travel:       { label: "Travel",             color: "text-blue-400",   bg: "bg-blue-500/15 border-blue-500/30",    icon: <Plane size={10} /> },
  guest_stay:   { label: "Guest Stay",         color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/30", icon: <Users size={10} /> },
  event:        { label: "Event / Party",      color: "text-pink-400",   bg: "bg-pink-500/15 border-pink-500/30",    icon: <PartyPopper size={10} /> },
  maintenance:  { label: "Maintenance",        color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/30",  icon: <Wrench size={10} /> },
  construction: { label: "Construction / Design", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30", icon: <HardHat size={10} /> },
  general:      { label: "General",            color: "text-accent",     bg: "bg-accent/15 border-accent/30",        icon: <Calendar size={10} /> },
};

const EVENT_SOLID_COLORS: Record<string, string> = {
  travel:       "hsl(217 91% 60%)",
  guest_stay:   "hsl(271 91% 65%)",
  event:        "hsl(330 85% 60%)",
  maintenance:  "hsl(38 92% 50%)",
  construction: "hsl(24 94% 53%)",
  general:      "hsl(var(--accent))",
  // ronin types
  birthdays:    "hsl(330 85% 60%)",
  delivery:     "hsl(142 71% 45%)",
  birthday:     "hsl(330 85% 60%)",
  // ronin travel tab
  ronin_travel: "hsl(217 91% 60%)",
};

function getFamilyTypeConfig(type: string) {
  return FAMILY_TYPE_CONFIG[type] ?? FAMILY_TYPE_CONFIG.general;
}

function getRoninTabForEvent(ev: CalEvent): RoninTab {
  if (ev._tab) return ev._tab;
  if (ev._source === "birthday") return "birthdays";
  if (ev._source === "maintenance" || ev._source === "planned_maintenance") return "maintenance";
  if (ev._source === "orders") return "deliveries";
  if (ev.event_type === "travel") return "travel";
  if (ev.event_type === "construction") return "construction";
  if (ev.event_type === "birthday") return "birthdays";
  if (ev.event_type === "maintenance") return "maintenance";
  if (ev.event_type === "delivery") return "deliveries";
  return "all";
}

/** Returns true if an event spans more than one calendar day */
function isMultiDay(ev: CalEvent): boolean {
  if (!ev.end_date) return false;
  try {
    const s = startOfDay(parseISO(ev.start_date));
    const e = startOfDay(parseISO(ev.end_date));
    return e > s;
  } catch { return false; }
}

function eventsForDay(events: CalEvent[], day: Date): CalEvent[] {
  return events.filter((ev) => {
    try {
      const start = parseISO(ev.start_date);
      const end = ev.end_date ? parseISO(ev.end_date) : start;
      return isWithinInterval(startOfDay(day), { start: startOfDay(start), end: startOfDay(end) });
    } catch { return false; }
  });
}

/** Returns only single-day events that start on this exact day */
function singleDayEventsForDay(events: CalEvent[], day: Date): CalEvent[] {
  return events.filter((ev) => {
    if (isMultiDay(ev)) return false;
    try {
      return isSameDay(parseISO(ev.start_date), day);
    } catch { return false; }
  });
}

// ─── Drag-and-drop ────────────────────────────────────────────────────────────

async function rescheduleEvent(ev: CalEvent, newDate: Date) {
  const origStart = parseISO(ev.start_date);
  const newStart = setDayFn(setMonth(setYear(origStart, getYear(newDate)), getMonth(newDate)), getDate(newDate));

  if (ev._source === "maintenance" && ev._source_id) {
    const { error } = await supabase
      .from("maintenance_issues")
      .update({ scheduled_date: newStart.toISOString() })
      .eq("id", ev._source_id);
    if (error) { toast.error("Failed to reschedule maintenance issue"); return false; }
    toast.success("Maintenance rescheduled");
    return true;
  }

  if (ev._source === "orders" && ev._source_id) {
    const { error } = await supabase
      .from("orders")
      .update({ expected_delivery: format(newStart, "yyyy-MM-dd") })
      .eq("id", ev._source_id);
    if (error) { toast.error("Failed to reschedule delivery"); return false; }
    toast.success("Delivery date updated");
    return true;
  }

  if (ev._source === "calendar_events" || !ev._source) {
    const origEnd = ev.end_date ? parseISO(ev.end_date) : null;
    const diff = origEnd ? origEnd.getTime() - origStart.getTime() : 0;
    const newEnd = origEnd ? new Date(newStart.getTime() + diff) : null;
    const { error } = await supabase
      .from("calendar_events")
      .update({
        start_date: newStart.toISOString(),
        end_date: newEnd ? newEnd.toISOString() : null,
      })
      .eq("id", ev.id);
    if (error) { toast.error("Failed to move event"); return false; }
    toast.success("Event moved");
    return true;
  }

  return false;
}

// ─── Event chip (single-day, draggable) ───────────────────────────────────────

function EventChip({
  ev,
  onClick,
  onDragStart,
  isRoninMode,
  canDrag,
}: {
  ev: CalEvent;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, ev: CalEvent) => void;
  isRoninMode: boolean;
  canDrag: boolean;
}) {
  const tab = getRoninTabForEvent(ev);
  const cfg = isRoninMode
    ? (RONIN_TAB_CONFIG[tab] ?? RONIN_TAB_CONFIG.all)
    : getFamilyTypeConfig(ev.event_type);

  const isDraggable = canDrag && ev._is_draggable !== false;

  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => isDraggable && onDragStart(e, ev)}
      onClick={onClick}
      title={ev.calendar_source === "ical" ? "Synced from iCal · read-only" : ev.title}
      className={cn(
        "text-[10px] font-medium px-1 py-0.5 rounded truncate flex items-center gap-0.5 border transition-opacity select-none",
        isDraggable ? "cursor-grab active:cursor-grabbing hover:opacity-80" : "cursor-pointer hover:opacity-80",
        isRoninMode ? `${cfg.bg} ${cfg.color}` : `${cfg.bg} ${cfg.color}`
      )}
    >
      <span className="flex-shrink-0">{cfg.icon}</span>
      {ev.is_private && <Lock size={7} className="flex-shrink-0" />}
      {ev.calendar_source === "ical" && <Globe size={7} className="flex-shrink-0 opacity-60" />}
      <span className="truncate">{ev.title}</span>
    </div>
  );
}

// ─── Multi-day bar spanning across the week row ───────────────────────────────

/**
 * For each week row, we compute multi-day event bars.
 * Each bar knows its colStart (0–6) and span (number of columns).
 */
interface MultiDayBar {
  ev: CalEvent;
  colStart: number; // 0-indexed column in this week row
  span: number;     // how many columns this bar spans
  isStart: boolean; // true if the event actually starts this week
  isEnd: boolean;   // true if the event actually ends this week
}

function getMultiDayBarsForWeek(events: CalEvent[], weekDays: Date[], isRoninMode: boolean, activeTab: RoninTab): MultiDayBar[] {
  const multiDay = events.filter((ev) => {
    if (!isMultiDay(ev)) return false;
    if (isRoninMode && activeTab !== "all" && getRoninTabForEvent(ev) !== activeTab) return false;
    try {
      const evStart = startOfDay(parseISO(ev.start_date));
      const evEnd = startOfDay(parseISO(ev.end_date!));
      const weekStart = startOfDay(weekDays[0]);
      const weekEnd = startOfDay(weekDays[6]);
      // overlaps this week?
      return !isAfter(evStart, weekEnd) && !isBefore(evEnd, weekStart);
    } catch { return false; }
  });

  return multiDay.map((ev) => {
    const evStart = startOfDay(parseISO(ev.start_date));
    const evEnd = startOfDay(parseISO(ev.end_date!));
    const weekStart = startOfDay(weekDays[0]);
    const weekEnd = startOfDay(weekDays[6]);

    const barStart = isAfter(evStart, weekStart) ? evStart : weekStart;
    const barEnd = isBefore(evEnd, weekEnd) ? evEnd : weekEnd;

    const colStart = weekDays.findIndex((d) => isSameDay(d, barStart));
    const colEnd = weekDays.findIndex((d) => isSameDay(d, barEnd));

    return {
      ev,
      colStart: colStart >= 0 ? colStart : 0,
      span: (colEnd >= 0 ? colEnd : 6) - (colStart >= 0 ? colStart : 0) + 1,
      isStart: !isBefore(evStart, weekStart),
      isEnd: !isAfter(evEnd, weekEnd),
    };
  });
}

function getEventBarColor(ev: CalEvent, isRoninMode: boolean): string {
  if (isRoninMode) {
    const tab = getRoninTabForEvent(ev);
    if (tab === "birthdays") return EVENT_SOLID_COLORS.birthdays;
    if (tab === "maintenance") return EVENT_SOLID_COLORS.maintenance;
    if (tab === "deliveries") return EVENT_SOLID_COLORS.delivery;
    if (tab === "travel") return EVENT_SOLID_COLORS.travel;
    if (tab === "construction") return EVENT_SOLID_COLORS.construction;
    return "hsl(var(--accent))";
  }
  return EVENT_SOLID_COLORS[ev.event_type] ?? EVENT_SOLID_COLORS.general;
}

// ─── Day Cell ─────────────────────────────────────────────────────────────────

function DayCell({
  day,
  singleDayEvents,
  isCurrentMonth,
  isSelected,
  isRoninMode,
  activeTab,
  canDrag,
  onSelect,
  onEventClick,
  onDragStart,
  onDrop,
}: {
  day: Date;
  singleDayEvents: CalEvent[];
  isCurrentMonth: boolean;
  isSelected: boolean;
  isRoninMode: boolean;
  activeTab: RoninTab;
  canDrag: boolean;
  onSelect: () => void;
  onEventClick: (ev: CalEvent, e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, ev: CalEvent) => void;
  onDrop: (day: Date) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const todayDay = isToday(day);

  const filtered = isRoninMode && activeTab !== "all"
    ? singleDayEvents.filter((ev) => getRoninTabForEvent(ev) === activeTab)
    : singleDayEvents;

  return (
    <div
      onClick={onSelect}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(day); }}
      className={cn(
        "min-h-[80px] p-1 border-b border-r border-border text-left transition-colors cursor-pointer",
        "hover:bg-muted/40",
        !isCurrentMonth && "opacity-30",
        isSelected && "bg-accent/10",
        isDragOver && canDrag && "bg-primary/10 ring-1 ring-inset ring-primary/40",
      )}
    >
      <div className={cn(
        "w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1",
        todayDay ? "bg-primary text-primary-foreground" : isSelected ? "bg-accent/20 text-accent-foreground" : "text-foreground",
      )}>
        {format(day, "d")}
      </div>
      {/* Reserve space for multi-day bars (rendered at week-row level) */}
      <div className="space-y-0.5 mt-5">
        {filtered.slice(0, 2).map((ev) => (
          <EventChip
            key={ev.id}
            ev={ev}
            isRoninMode={isRoninMode}
            canDrag={canDrag}
            onClick={(e) => onEventClick(ev, e)}
            onDragStart={onDragStart}
          />
        ))}
        {filtered.length > 2 && (
          <div className="text-[10px] text-muted-foreground px-1">+{filtered.length - 2}</div>
        )}
      </div>
    </div>
  );
}

// ─── Calendar Week Row (contains DayCells + overlaid multi-day bars) ──────────

function WeekRow({
  weekDays,
  allEvents,
  isRoninMode,
  activeTab,
  canDrag,
  selectedDay,
  currentMonth,
  onDaySelect,
  onEventClick,
  onDragStart,
  onDrop,
}: {
  weekDays: Date[];
  allEvents: CalEvent[];
  isRoninMode: boolean;
  activeTab: RoninTab;
  canDrag: boolean;
  selectedDay: Date | null;
  currentMonth: Date;
  onDaySelect: (day: Date) => void;
  onEventClick: (ev: CalEvent, e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, ev: CalEvent) => void;
  onDrop: (day: Date) => void;
}) {
  const multiDayBars = getMultiDayBarsForWeek(allEvents, weekDays, isRoninMode, activeTab);

  return (
    <div className="relative grid grid-cols-7">
      {weekDays.map((day, i) => (
        <DayCell
          key={i}
          day={day}
          singleDayEvents={singleDayEventsForDay(allEvents, day)}
          isCurrentMonth={isSameMonth(day, currentMonth)}
          isSelected={selectedDay ? isSameDay(day, selectedDay) : false}
          isRoninMode={isRoninMode}
          activeTab={activeTab}
          canDrag={canDrag}
          onSelect={() => onDaySelect(day)}
          onEventClick={onEventClick}
          onDragStart={onDragStart}
          onDrop={onDrop}
        />
      ))}

      {/* Multi-day event bars — absolutely positioned over the row */}
      <div className="absolute inset-0 pointer-events-none" style={{ top: "28px" }}>
        {multiDayBars.map((bar, idx) => {
          const color = getEventBarColor(bar.ev, isRoninMode);
          const isDraggable = canDrag && bar.ev._is_draggable !== false;

          // Position: left = colStart/7 * 100%, width = span/7 * 100%
          // Small inner padding so bars don't bleed to cell edges
          const leftPct = (bar.colStart / 7) * 100;
          const widthPct = (bar.span / 7) * 100;
          const INSET = 2; // px

          return (
            <div
              key={`${bar.ev.id}-${idx}`}
              className="absolute pointer-events-auto"
              style={{
                left: `calc(${leftPct}% + ${bar.isStart ? INSET : 0}px)`,
                width: `calc(${widthPct}% - ${(bar.isStart ? INSET : 0) + (bar.isEnd ? INSET : 0)}px)`,
                top: `${idx * 18}px`,
                height: "16px",
                zIndex: 10 + idx,
              }}
            >
              <div
                onClick={(e) => { e.stopPropagation(); onEventClick(bar.ev, e); }}
                title={bar.ev.title}
                className={cn(
                  "h-full flex items-center px-1.5 text-white text-[10px] font-medium overflow-hidden select-none",
                  bar.isStart ? "rounded-l-full" : "",
                  bar.isEnd ? "rounded-r-full" : "",
                  isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                  "hover:brightness-90 transition-all"
                )}
                style={{ background: color }}
              >
                {bar.isStart && (
                  <span className="flex items-center gap-1 truncate">
                    {bar.ev.calendar_source === "ical" && <Globe size={8} className="flex-shrink-0 opacity-80" />}
                    {bar.ev.is_private && <Lock size={8} className="flex-shrink-0" />}
                    <span className="truncate">{bar.ev.title}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Edit Event Dialog ────────────────────────────────────────────────────────

function EditEventDialog({ event, open, onClose, onSave, properties, userId }: {
  event: CalEvent | null;
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  properties: Property[];
  userId: string | null;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    start_date: "",
    end_date: "",
    event_type: "general",
    property_id: "",
    is_private: false,
    recurrence: "none",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setForm({
        title: event.title,
        description: event.description ?? "",
        location: event.location ?? "",
        start_date: event.start_date ? event.start_date.slice(0, 16) : "",
        end_date: event.end_date ? event.end_date.slice(0, 16) : "",
        event_type: event.event_type ?? "general",
        property_id: event.property_id ?? "",
        is_private: event.is_private ?? false,
        recurrence: event.keywords?.find((k) => k.startsWith("recurrence:"))?.split(":")[1] ?? "none",
      });
    }
  }, [event]);

  if (!event) return null;

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const keywords: string[] = [];
    if (form.recurrence !== "none") keywords.push(`recurrence:${form.recurrence}`);
    const { error } = await supabase.from("calendar_events").update({
      title: form.title.trim(),
      description: form.description || null,
      location: form.location || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      event_type: form.event_type,
      is_private: form.is_private,
      property_id: form.property_id || null,
      keywords: keywords.length ? keywords : null,
    }).eq("id", event.id);
    setSaving(false);
    if (error) { toast.error("Failed to save changes"); return; }
    toast.success("Event updated");
    onSave();
    onClose();
  };

  const f = (key: string, val: string | boolean) => setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col w-full max-w-lg">
        <DialogHeader className="flex-shrink-0"><DialogTitle>Edit Event</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => f("title", e.target.value)} placeholder="Event title" />
          </div>
          <div className="space-y-1.5">
            <Label>Start</Label>
            <Input type="datetime-local" value={form.start_date} onChange={(e) => f("start_date", e.target.value)} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label>End <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input type="datetime-local" value={form.end_date} onChange={(e) => f("end_date", e.target.value)} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label>Repeat</Label>
            <Select value={form.recurrence} onValueChange={(v) => f("recurrence", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.event_type} onValueChange={(v) => f("event_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FAMILY_TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      <span className={v.color}>{v.icon}</span>
                      {v.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => f("location", e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Property</Label>
            <Select value={form.property_id || "__none__"} onValueChange={(v) => f("property_id", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={form.description}
              onChange={(e) => f("description", e.target.value)}
              placeholder="Optional notes…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.is_private} onChange={(e) => f("is_private", e.target.checked)} className="w-4 h-4 accent-primary" />
            <div>
              <p className="text-sm font-medium">Private</p>
              <p className="text-xs text-muted-foreground">Admins only</p>
            </div>
          </label>
        </div>
        <DialogFooter className="flex-shrink-0 pt-3 border-t border-border gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Event Detail Sheet ───────────────────────────────────────────────────────

function EventDetailSheet({
  event,
  onClose,
  canDelete,
  canEdit,
  userId,
  onDelete,
  onEdit,
}: {
  event: CalEvent | null;
  onClose: () => void;
  canDelete: boolean;
  canEdit: boolean;
  userId: string | null;
  onDelete: (ev: CalEvent) => void;
  onEdit: (ev: CalEvent) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!event) return null;

  // Only editable if: not ical-synced, not a virtual source (birthday/auto), and user has edit rights
  const isEditableEvent = event.calendar_source !== "ical" && event._source === "calendar_events" || event._source === undefined;
  const tab = getRoninTabForEvent(event);
  const familyCfg = getFamilyTypeConfig(event.event_type);
  const roninCfg = RONIN_TAB_CONFIG[tab];
  const start = parseISO(event.start_date);
  const end = event.end_date ? parseISO(event.end_date) : null;

  // Birthdays and linked planned maintenance events are auto-managed elsewhere
  const isDeletable = canDelete
    && event._source !== "birthday"
    && event._source !== "planned_maintenance"
    && event.calendar_source !== "ical";
  // Source label for linked events
  const sourceLabel = event._source === "maintenance" ? "maintenance issue"
    : event._source === "orders" ? "delivery order"
    : "event";

  return (
    <Sheet open={!!event} onOpenChange={(o) => { if (!o) { setConfirmDelete(false); onClose(); } }}>
      <SheetContent
        side="bottom"
        className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl"
      >
        <SheetHeader className="flex-shrink-0 pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0",
              event._source ? `${roninCfg.bg} ${roninCfg.color}` : `${familyCfg.bg} ${familyCfg.color}`
            )}>
              <span className="text-base">
                {event._source === "birthday" ? <Cake size={16} />
                  : event._source === "maintenance" ? <Wrench size={16} />
                  : event._source === "orders" ? <Package size={16} />
                  : event.calendar_source === "ical" ? <Globe size={16} />
                  : <Calendar size={16} />}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold leading-tight">{event.title}</SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {event._source === "birthday" && <Badge variant="outline" className={cn("text-xs border", roninCfg.bg, roninCfg.color)}>Birthday</Badge>}
                {event._source === "maintenance" && <Badge variant="outline" className={cn("text-xs border", roninCfg.bg, roninCfg.color)}>Maintenance</Badge>}
                {event._source === "orders" && <Badge variant="outline" className={cn("text-xs border", roninCfg.bg, roninCfg.color)}>Delivery</Badge>}
                {!event._source && <Badge variant="outline" className={cn("text-xs border", familyCfg.bg, familyCfg.color)}>{getFamilyTypeConfig(event.event_type).label}</Badge>}
                {event.is_private && <Badge variant="outline" className="text-xs"><Lock size={10} className="mr-1" />Private</Badge>}
                {event.calendar_source === "ical" && <Badge variant="outline" className="text-xs"><Globe size={10} className="mr-1" />Synced</Badge>}
                {event.keywords?.some((k) => k.startsWith("recurrence:")) && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    🔁 {event.keywords.find((k) => k.startsWith("recurrence:"))?.split(":")[1]}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <div className="flex items-start gap-3">
            <Clock size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">{format(start, "EEEE, MMMM d, yyyy")}</p>
              {end && !isSameDay(start, end) && (
                <p className="text-muted-foreground">→ {format(end, "EEEE, MMMM d, yyyy")}</p>
              )}
            </div>
          </div>
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm">{event.location}</p>
            </div>
          )}
          {event.description && (
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
          {event._source === "maintenance" && event._source_id && (
            <div className="rounded-xl border border-amber-500/20 bg-[hsl(38_92%_50%/0.05)] p-3 text-xs text-amber-400">
              ↗ Linked to Maintenance section — drag to reschedule
            </div>
          )}
          {event._source === "orders" && event._source_id && (
            <div className="rounded-xl border border-emerald-500/20 bg-[hsl(142_71%_45%/0.05)] p-3 text-xs text-emerald-400">
              ↗ Linked to Orders section — drag to update delivery date
            </div>
          )}
          {event.keywords && event.keywords.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {event.keywords.map((kw) => (
                  <span key={kw} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{kw}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {(isDeletable || (canEdit && isEditableEvent)) && (
          <div className="flex-shrink-0 pt-3 border-t border-border space-y-2">
            {canEdit && isEditableEvent && !confirmDelete && (
              <Button
                variant="outline" size="sm"
                className="w-full gap-1"
                onClick={() => { onEdit(event); onClose(); }}
              >
                <Settings size={14} className="mr-1" />
                Edit event
              </Button>
            )}
            {isDeletable && (
              confirmDelete ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive" size="sm" className="flex-1"
                    onClick={() => { setConfirmDelete(false); onDelete(event); onClose(); }}
                  >
                    {event._source ? `Delete ${sourceLabel}` : "Delete event"}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <X size={14} className="mr-1" />
                  {event._source === "maintenance" ? "Delete maintenance issue" :
                   event._source === "orders" ? "Delete delivery order" :
                   "Delete event"}
                </Button>
              )
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Calendar Settings Dialog ─────────────────────────────────────────────────

function CalendarSettingsDialog({ open, onClose, properties }: { open: boolean; onClose: () => void; properties: Property[] }) {
  const [icalUrl, setIcalUrl] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [privateKw, setPrivateKw] = useState("");
  const [estateKw, setEstateKw] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from("system_settings").select("key, value")
        .in("key", ["ical_url", "ical_property_id", "ical_private_keywords", "ical_estate_keywords", "ical_last_sync"]);
      const map: Record<string, unknown> = {};
      for (const row of data ?? []) map[row.key] = row.value;
      setIcalUrl((map["ical_url"] as string) || "");
      setPropertyId((map["ical_property_id"] as string) || "");
      setPrivateKw(Array.isArray(map["ical_private_keywords"]) ? (map["ical_private_keywords"] as string[]).join(", ") : "");
      setEstateKw(Array.isArray(map["ical_estate_keywords"]) ? (map["ical_estate_keywords"] as string[]).join(", ") : "");
      setLastSync((map["ical_last_sync"] as string) || null);
    })();
  }, [open]);

  const save = async () => {
    setLoading(true);
    const rows = [
      { key: "ical_url", value: icalUrl.trim() },
      { key: "ical_property_id", value: propertyId || null },
      { key: "ical_private_keywords", value: privateKw.split(",").map((k) => k.trim()).filter(Boolean) },
      { key: "ical_estate_keywords", value: estateKw.split(",").map((k) => k.trim()).filter(Boolean) },
    ];
    for (const row of rows) await supabase.from("system_settings").upsert({ key: row.key, value: row.value as never });
    toast.success("Settings saved");
    setLoading(false);
  };

  const syncNow = async () => {
    if (!icalUrl.trim()) { toast.error("Save an iCal URL first"); return; }
    setSyncing(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const data = await resp.json();
      if (!resp.ok) { toast.error(data.error ?? "Sync failed"); return; }
      const ts = new Date().toISOString();
      await supabase.from("system_settings").upsert({ key: "ical_last_sync", value: ts });
      setLastSync(ts);
      toast.success(`Synced ${data.synced} events`);
    } catch { toast.error("Sync failed"); }
    finally { setSyncing(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0"><DialogTitle>Family Calendar Sync</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-5 py-2">
          <div className="space-y-2">
            <Label>iCal / WebCal URL</Label>
            <p className="text-xs text-muted-foreground">Apple Calendar → Share → Copy Link. Google → Settings → Secret iCal address.</p>
            <Input value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} placeholder="https://…basic.ics" className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label>Default Property</Label>
            <Select value={propertyId || "__none__"} onValueChange={(v) => setPropertyId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2"><Lock size={14} />Privacy Filter</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Always-Private Keywords</Label>
              <Input value={privateKw} onChange={(e) => setPrivateKw(e.target.value)} placeholder="doctor, gym, school…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Estate-Relevant Keywords</Label>
              <Input value={estateKw} onChange={(e) => setEstateKw(e.target.value)} placeholder="montana, hamptons, dinner party…" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Manual Sync</p>
              {lastSync && <p className="text-xs text-muted-foreground">Last: {format(parseISO(lastSync), "MMM d, h:mm a")}</p>}
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={syncNow} disabled={syncing || !icalUrl.trim()}>
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          </div>
          <div className="rounded-xl border border-[hsl(var(--status-progress)/0.4)] bg-[hsl(var(--status-progress)/0.1)] p-3 flex gap-2">
            <AlertTriangle size={14} className="text-[hsl(var(--status-progress))] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">Agent Ronin will analyse estate-relevant events and post briefings to staff chat threads.</p>
          </div>
        </div>
        <DialogFooter className="flex-shrink-0 pt-3 border-t border-border gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={loading} className="gap-2"><Check size={14} />{loading ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Event Dialog ─────────────────────────────────────────────────────────

const RECURRENCE_OPTIONS = [
  { value: "none",    label: "Does not repeat" },
  { value: "daily",   label: "Daily" },
  { value: "weekly",  label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly",  label: "Yearly" },
];

function NewEventDialog({ open, onClose, onSave, properties, userId }: {
  open: boolean; onClose: () => void; onSave: () => void; properties: Property[]; userId: string | null;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    end_date: "",
    event_type: "general",
    property_id: "",
    is_private: false,
    recurrence: "none",
    recurrence_end: "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim() || !userId) return;
    setSaving(true);

    const keywords: string[] = [];
    if (form.recurrence !== "none") keywords.push(`recurrence:${form.recurrence}`);

    const notes = form.recurrence !== "none"
      ? `Recurs ${form.recurrence}${form.recurrence_end ? ` until ${format(new Date(form.recurrence_end), "MMM d, yyyy")}` : ""}`
      : null;

    const { error } = await supabase.from("calendar_events").insert({
      title: form.title.trim(),
      description: form.description || null,
      location: form.location || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      event_type: form.event_type,
      is_private: form.is_private,
      property_id: form.property_id || null,
      created_by: userId,
      calendar_source: "manual",
      status: "upcoming",
      keywords: keywords.length ? keywords : null,
      notes,
    });

    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Event added");

    setForm({ title: "", description: "", location: "", start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), end_date: "", event_type: "general", property_id: "", is_private: false, recurrence: "none", recurrence_end: "" });
    onSave(); onClose();
  };

  const f = (key: string, val: string | boolean) => setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col w-full max-w-lg">
        <DialogHeader className="flex-shrink-0"><DialogTitle>New Event</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => f("title", e.target.value)} placeholder="Event title" />
          </div>
          <div className="space-y-1.5">
            <Label>Start</Label>
            <Input type="datetime-local" value={form.start_date} onChange={(e) => f("start_date", e.target.value)} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label>End <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input type="datetime-local" value={form.end_date} onChange={(e) => f("end_date", e.target.value)} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label>Repeat</Label>
            <Select value={form.recurrence} onValueChange={(v) => f("recurrence", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.recurrence !== "none" && (
            <div className="space-y-1.5">
              <Label>Repeat until <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="date" value={form.recurrence_end} onChange={(e) => f("recurrence_end", e.target.value)} className="w-full" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.event_type} onValueChange={(v) => f("event_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">📅 General</SelectItem>
                <SelectItem value="travel">✈️ Travel</SelectItem>
                <SelectItem value="construction">🏗️ Construction / Design</SelectItem>
                <SelectItem value="guest_stay">🏠 Guest Stay</SelectItem>
                <SelectItem value="event">🎉 Event / Party</SelectItem>
                <SelectItem value="maintenance">🔧 Maintenance</SelectItem>
                <SelectItem value="delivery">📦 Delivery</SelectItem>
                <SelectItem value="birthday">🎂 Birthday</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => f("location", e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Property</Label>
            <Select value={form.property_id || "__none__"} onValueChange={(v) => f("property_id", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={form.description}
              onChange={(e) => f("description", e.target.value)}
              placeholder="Optional notes…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.is_private} onChange={(e) => f("is_private", e.target.checked)} className="w-4 h-4 accent-primary" />
            <div>
              <p className="text-sm font-medium">Private</p>
              <p className="text-xs text-muted-foreground">Admins only</p>
            </div>
          </label>
        </div>
        <DialogFooter className="flex-shrink-0 pt-3 border-t border-border gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? "Saving…" : "Add Event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

function RightPanel({
  mode,
  roninTab,
  events,
  familyEvents,
  onEventClick,
  selectedDay,
  currentMonth,
}: {
  mode: CalendarMode;
  roninTab: RoninTab;
  events: CalEvent[];
  familyEvents: CalEvent[];
  onEventClick: (ev: CalEvent) => void;
  selectedDay: Date | null;
  currentMonth: Date;
}) {
  // Combine both sources for the right panel — show everything
  const source = mode === "family" ? familyEvents : events;

  const filtered = (() => {
    if (selectedDay) {
      return eventsForDay(source, selectedDay);
    }
    // Upcoming: any event that hasn't fully ended yet, within current month view
    const now = startOfDay(new Date());
    const monthEnd = endOfMonth(currentMonth);
    return source
      .filter((e) => {
        try {
          const start = parseISO(e.start_date);
          const end = e.end_date ? parseISO(e.end_date) : start;
          // Include if event ends on or after today AND starts before month end
          return !isBefore(end, now) && !isAfter(start, monthEnd);
        } catch { return false; }
      })
      .sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime())
      .slice(0, 30);
  })();

  const tabFiltered = mode === "ronin" && roninTab !== "all"
    ? filtered.filter((ev) => getRoninTabForEvent(ev) === roninTab)
    : filtered;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <p className="font-semibold text-sm">
          {selectedDay ? format(selectedDay, "MMMM d") : "Upcoming"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{tabFiltered.length} event{tabFiltered.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border max-h-[480px]">
        {tabFiltered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No events</div>
        ) : tabFiltered.map((ev) => {
          const tab = getRoninTabForEvent(ev);
          const roninCfg = RONIN_TAB_CONFIG[tab];
          const familyCfg = getFamilyTypeConfig(ev.event_type);
          let start: Date;
          try { start = parseISO(ev.start_date); } catch { return null; }
          const end = ev.end_date ? parseISO(ev.end_date) : null;

          return (
            <button
              key={ev.id}
              onClick={() => onEventClick(ev)}
              className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-1.5 self-stretch rounded-full flex-shrink-0 mt-0.5"
                  style={{ background: getEventBarColor(ev, mode === "ronin") }}
                />
                <div className="text-center w-9 flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">{format(start, "MMM")}</p>
                  <p className="text-lg font-bold leading-none text-foreground">{format(start, "d")}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-foreground">{ev.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {mode === "ronin" ? (
                      <Badge variant="outline" className={cn("text-[10px] border px-1 py-0", roninCfg.bg, roninCfg.color)}>
                        {roninCfg.label}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={cn("text-[10px] border px-1 py-0", familyCfg.bg, familyCfg.color)}>
                        {familyCfg.label}
                      </Badge>
                    )}
                    {end && !isSameDay(start, end) && (
                      <span className="text-[10px] text-muted-foreground">
                        → {format(end, "MMM d")}
                      </span>
                    )}
                    {ev.is_private && <Lock size={10} className="text-muted-foreground" />}
                    {ev.calendar_source === "ical" && <Globe size={10} className="text-muted-foreground" />}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main CalendarSection ─────────────────────────────────────────────────────

export function CalendarSection() {
  const { isMasterAdmin, isAdmin, isManager, isFamily, userId, level, canSee, assignedPropertyIds } = usePermissions();
  // Only principal/extended_family default to Family; everyone else (including admin) defaults to Ronin
  const canSeeFamilyCal = canSee("family-calendar");
  const isFamilyUser = isFamily && !isMasterAdmin && !isAdmin && !isManager;

  const defaultMode: CalendarMode = (isFamilyUser && canSeeFamilyCal) ? "family" : "ronin";
  const [mode, setMode] = useLocalStorage<CalendarMode>("cal_mode", defaultMode);
  const [roninTabRaw, setRoninTab] = useLocalStorage<RoninTab>("cal_ronin_tab", "all");
  // "staff" was a previous tab that has since been moved to its own section.
  // If a user has it cached in localStorage, fall back to "all" so the tab bar isn't hidden.
  const roninTab: RoninTab = roninTabRaw === "staff" ? "all" : roninTabRaw;
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [familyEvents, setFamilyEvents] = useState<CalEvent[]>([]);
  const [roninEvents, setRoninEvents] = useState<CalEvent[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [maintenancePropertyFilter, setMaintenancePropertyFilter] = useState<string>("all");
  const dragRef = useRef<CalEvent | null>(null);

  // ── Fetch family (iCal synced) events ──────────────────────────────────────
  const fetchFamilyEvents = useCallback(async () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    // Narrow columns + cap result size — calendar list never needs notes/description on chips
    const CAL_COLS = "id, title, description, event_type, start_date, end_date, property_id, calendar_source, status, is_private, assigned_staff_ids, keywords, location, created_by";
    const { data } = await supabase
      .from("calendar_events")
      .select(CAL_COLS)
      .eq("calendar_source", "ical")
      .or(`start_date.gte.${start.toISOString()},end_date.gte.${start.toISOString()}`)
      .lte("start_date", end.toISOString())
      .order("start_date")
      .limit(500);
    return (data ?? []).map((ev) => ({ ...ev, _source: "calendar_events" as const, _is_draggable: false }));
  }, [currentMonth]);

  // ── Fetch Ronin events (manual + auto) ─────────────────────────────────────
  const fetchRoninEvents = useCallback(async () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const CAL_COLS = "id, title, description, event_type, start_date, end_date, property_id, calendar_source, status, is_private, assigned_staff_ids, keywords, location, created_by";

    const [{ data: manualData }, { data: profiles }, { data: maintenance }, { data: orders }] = await Promise.all([
      // Manual calendar events (non-ical) — capped + scoped to overlapping month window
      supabase.from("calendar_events").select(CAL_COLS)
        .neq("calendar_source", "ical")
        .or(`start_date.gte.${monthStart.toISOString()},end_date.gte.${monthStart.toISOString()}`)
        .lte("start_date", monthEnd.toISOString())
        .order("start_date")
        .limit(500),
      supabase.from("profiles").select("id, full_name, birthday, avatar_url, job_title"),
      supabase.from("maintenance_issues").select("id, title, scheduled_date, status, priority, property_id")
        .not("scheduled_date", "is", null)
        .gte("scheduled_date", monthStart.toISOString())
        .lte("scheduled_date", monthEnd.toISOString()),
      supabase.from("orders").select("id, title, expected_delivery, status, property_id")
        .not("expected_delivery", "is", null)
        .gte("expected_delivery", format(monthStart, "yyyy-MM-dd"))
        .lte("expected_delivery", format(monthEnd, "yyyy-MM-dd"))
        .neq("status", "delivered"),
    ]);

    const manualEventIds = (manualData ?? []).map((ev) => ev.id);
    const { data: linkedPlanned } = manualEventIds.length
      ? await supabase
          .from("planned_maintenance")
          .select("calendar_event_id")
          .in("calendar_event_id", manualEventIds)
      : { data: [] };

    const linkedPlannedIds = new Set(
      (linkedPlanned ?? [])
        .map((entry) => entry.calendar_event_id)
        .filter((id): id is string => !!id)
    );

    const events: CalEvent[] = [];

    for (const ev of manualData ?? []) {
      const tab: RoninTab =
        ev.event_type === "travel" ? "travel"
        : ev.event_type === "maintenance" || ev.event_type === "repair" ? "maintenance"
        : ev.event_type === "delivery" || ev.event_type === "order" ? "deliveries"
        : ev.event_type === "birthday" ? "birthdays"
        : ev.event_type === "construction" ? "construction"
        : "all";
      const isLinkedPlanned = ev.calendar_source === "planned_maintenance" || linkedPlannedIds.has(ev.id);
      events.push({
        ...ev,
        end_date: isLinkedPlanned ? ev.start_date : ev.end_date,
        calendar_source: isLinkedPlanned ? "planned_maintenance" : ev.calendar_source,
        _source: isLinkedPlanned ? "planned_maintenance" : "calendar_events",
        _is_draggable: !isLinkedPlanned,
        _tab: tab,
      });
    }

    for (const p of profiles ?? []) {
      if (!p.birthday || !p.full_name) continue;
      try {
        const bDay = parseISO(p.birthday);
        const thisYearBday = new Date(getYear(currentMonth), getMonth(bDay), getDate(bDay));
        if (!isSameMonth(thisYearBday, currentMonth)) continue;
        events.push({
          id: `bday-${p.id}`,
          title: `🎂 ${p.full_name}'s Birthday`,
          description: p.job_title ?? null,
          start_date: thisYearBday.toISOString(),
          end_date: null,
          event_type: "birthday",
          is_private: false,
          keywords: ["birthday"],
          location: null,
          status: "upcoming",
          calendar_source: "auto",
          property_id: null,
          _source: "birthday",
          _source_id: p.id,
          _tab: "birthdays",
          _is_draggable: false,
        });
      } catch { /* skip */ }
    }

    for (const issue of maintenance ?? []) {
      if (!issue.scheduled_date) continue;
      events.push({
        id: `maint-${issue.id}`,
        title: issue.title,
        description: `Priority: ${issue.priority} · Status: ${issue.status}`,
        start_date: issue.scheduled_date,
        end_date: null,
        event_type: "maintenance",
        is_private: false,
        keywords: ["maintenance"],
        location: null,
        status: issue.status,
        calendar_source: "auto",
        property_id: issue.property_id,
        _source: "maintenance",
        _source_id: issue.id,
        _tab: "maintenance",
        _is_draggable: true,
      });
    }

    for (const order of orders ?? []) {
      if (!order.expected_delivery) continue;
      events.push({
        id: `order-${order.id}`,
        title: `📦 ${order.title}`,
        description: `Status: ${order.status}`,
        start_date: new Date(order.expected_delivery + "T12:00:00").toISOString(),
        end_date: null,
        event_type: "delivery",
        is_private: false,
        keywords: ["delivery"],
        location: null,
        status: order.status,
        calendar_source: "auto",
        property_id: order.property_id,
        _source: "orders",
        _source_id: order.id,
        _tab: "deliveries",
        _is_draggable: true,
      });
    }

    return events;
  }, [currentMonth]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [family, ronin] = await Promise.all([fetchFamilyEvents(), fetchRoninEvents()]);
    setFamilyEvents(family);
    setRoninEvents(ronin);
    setLoading(false);
  }, [fetchFamilyEvents, fetchRoninEvents]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const canSeeAll = isMasterAdmin || isAdmin || isManager;
    supabase.from("properties").select("id, name").order("sort_order").then(({ data }) => {
      const all = (data as Property[]) ?? [];
      setProperties(canSeeAll ? all : all.filter(p => assignedPropertyIds.includes(p.id)));
    });
  }, [isMasterAdmin, isAdmin, isManager, assignedPropertyIds]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("cal_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_issues" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = (_e: React.DragEvent, ev: CalEvent) => {
    if (!isMasterAdmin) return;
    dragRef.current = ev;
  };

  const handleDrop = async (day: Date) => {
    if (!isMasterAdmin) return;
    const ev = dragRef.current;
    dragRef.current = null;
    if (!ev || !ev._is_draggable) return;
    const ok = await rescheduleEvent(ev, day);
    if (ok) refresh();
  };

  // ── Calendar grid ─────────────────────────────────────────────────────────
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Split days into week rows
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const activeEvents = mode === "family" ? familyEvents : roninEvents;

  // Properties with scheduled maintenance this month (auto-scoped via RLS)
  const maintenanceProperties = [...new Set(
    roninEvents.filter(e => e._tab === "maintenance" && e.property_id).map(e => e.property_id as string)
  )];

  // Apply property filter when on maintenance tab
  const filteredActiveEvents = (mode === "ronin" && roninTab === "maintenance" && maintenancePropertyFilter !== "all")
    ? activeEvents.filter(ev => ev._tab !== "maintenance" || ev.property_id === maintenancePropertyFilter)
    : activeEvents;

  const deleteEvent = async (ev: CalEvent) => {
    if (ev._source === "maintenance" && ev._source_id) {
      // Delete the maintenance issue itself — cascade also removes any auto calendar_events entries
      const issueTitle = ev.title;
      await Promise.all([
        supabase.from("calendar_events").delete().eq("calendar_source", "auto").ilike("title", `%${issueTitle}%`),
        supabase.from("tasks").delete().eq("is_draft", true).eq("ai_suggested", true).ilike("title_en", `%${issueTitle}%`),
        supabase.from("maintenance_issues").delete().eq("id", ev._source_id),
      ]);
      toast.success("Maintenance issue deleted");
      refresh();
      return;
    }
    if (ev._source === "orders" && ev._source_id) {
      await supabase.from("orders").delete().eq("id", ev._source_id);
      toast.success("Delivery order deleted");
      refresh();
      return;
    }
    if (ev._source === "calendar_events" || !ev._source) {
      await supabase.from("calendar_events").delete().eq("id", ev.id);
      toast.success("Event deleted");
      refresh();
    }
  };

  return (
    <div className="animate-fade-in space-y-2 px-4 py-2">
      {/* Header — single compact row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">Calendar</h1>
          <p className="text-xs text-muted-foreground leading-tight">
            {mode === "family" ? "Family calendar · synced from iCal" : "Ronin calendar · smart & operational"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Staff Schedule moved to its own top-level section under Calendar in the sidebar */}
          {isMasterAdmin && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettings(true)}>
              <Settings size={16} />
            </Button>
          )}
          {(isMasterAdmin || isAdmin) && (
            <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setShowNewEvent(true)}>
              <Plus size={13} /> Add
            </Button>
          )}
        </div>
      </div>

      {/* Mode toggle + property filter */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted w-fit">
          {canSeeFamilyCal && (
            <button
              onClick={() => setMode("family")}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                mode === "family" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Globe size={14} /> Family
            </button>
          )}
          <button
            onClick={() => setMode("ronin")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              mode === "ronin" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarDays size={14} /> Ronin
          </button>
        </div>

        {/* Property filter — next to Ronin toggle, only when Maintenance tab is active */}
        {mode === "ronin" && roninTab === "maintenance" && properties.length > 0 && (
          <Select value={maintenancePropertyFilter} onValueChange={setMaintenancePropertyFilter}>
            <SelectTrigger className="h-8 text-xs w-[150px] border-amber-500/30 bg-amber-500/10 text-amber-400">
              <SelectValue placeholder="All properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Ronin category tabs — staff excluded here, lives in the header button */}
      {mode === "ronin" && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(Object.entries(RONIN_TAB_CONFIG) as [RoninTab, typeof RONIN_TAB_CONFIG[RoninTab]][])
            .filter(([key]) => {
              if ((key as string) === "staff") return false; // staff moved to header
              if (isMasterAdmin) return true;
              if (key === "all") return true;
              if (key === "birthdays") return canSee("calendar-birthdays");
              if (key === "maintenance") return canSee("calendar-maintenance");
              if (key === "deliveries") return canSee("calendar-deliveries");
              if (key === "travel") return canSee("calendar-travel");
              if (key === "construction") return canSee("calendar-construction");
              return true;
            })
            .map(([key, cfg]) => {
            const count = key === "all"
              ? roninEvents.length
              : roninEvents.filter((ev) => getRoninTabForEvent(ev) === key).length;
            return (
              <button
                key={key}
                onClick={() => setRoninTab(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border",
                  roninTab === key
                    ? `${cfg.bg} ${cfg.color} border-current/30`
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {cfg.icon} {cfg.label}
                {count > 0 && (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", roninTab === key ? "bg-background/50" : "bg-muted")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Staff Schedule moved to its own top-level section */}
      {(mode === "ronin" || mode === "family") && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar grid */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
              <ChevronLeft size={16} />
            </Button>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">{format(currentMonth, "MMMM yyyy")}</h2>
              {!isSameMonth(new Date(), currentMonth) && (
                <button onClick={() => setCurrentMonth(new Date())} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Today
                </button>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-[11px] text-muted-foreground font-medium py-2">{d}</div>
            ))}
          </div>

          {/* Grid — week rows with multi-day bar overlay */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div>
              {weeks.map((weekDays, wi) => (
                <WeekRow
                  key={wi}
                  weekDays={weekDays}
                  allEvents={filteredActiveEvents}
                  isRoninMode={mode === "ronin"}
                  activeTab={roninTab}
                  canDrag={isMasterAdmin}
                  selectedDay={selectedDay}
                  currentMonth={currentMonth}
                  onDaySelect={(day) => setSelectedDay(isSameDay(day, selectedDay ?? new Date(-1)) ? null : day)}
                  onEventClick={(ev, e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <RightPanel
            mode={mode}
            roninTab={roninTab}
            events={filteredActiveEvents}
            familyEvents={familyEvents}
            onEventClick={setSelectedEvent}
            selectedDay={selectedDay}
            currentMonth={currentMonth}
          />

          {isMasterAdmin && mode === "family" && (
            <div
              onClick={() => setShowSettings(true)}
              className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe size={14} className="text-muted-foreground" /> Calendar Sync
              </div>
              <p className="text-xs text-muted-foreground mt-1">Connect Apple, Google, or Skylight via iCal → Settings</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Modals */}
      <EventDetailSheet
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        canDelete={isMasterAdmin || isAdmin}
        canEdit={isMasterAdmin || isAdmin || (selectedEvent?.calendar_source === "manual")}
        userId={userId}
        onDelete={deleteEvent}
        onEdit={(ev) => { setSelectedEvent(null); setEditingEvent(ev); }}
      />
      <EditEventDialog
        event={editingEvent}
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={refresh}
        properties={properties}
        userId={userId}
      />
      <CalendarSettingsDialog open={showSettings} onClose={() => setShowSettings(false)} properties={properties} />
      <NewEventDialog open={showNewEvent} onClose={() => setShowNewEvent(false)} onSave={refresh} properties={properties} userId={userId} />
    </div>
  );
}
