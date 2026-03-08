import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ChevronLeft, ChevronRight, CalendarDays, Settings, RefreshCw, Plus,
  MapPin, Clock, Tag, Globe, Lock, Plane, Users, Wrench, PartyPopper, Calendar,
  X, Check, AlertTriangle
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths,
  subMonths, parseISO, isWithinInterval, addDays
} from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CalendarEvent {
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
}

interface Property {
  id: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG: Record<string, { color: string; bgColor: string; icon: React.ReactNode; label: string }> = {
  travel:      { color: "text-blue-400",   bgColor: "bg-blue-500/20 border-blue-500/30",   icon: <Plane size={10} />,        label: "Travel" },
  guest_stay:  { color: "text-purple-400", bgColor: "bg-purple-500/20 border-purple-500/30", icon: <Users size={10} />,      label: "Guest" },
  event:       { color: "text-pink-400",   bgColor: "bg-pink-500/20 border-pink-500/30",   icon: <PartyPopper size={10} />,  label: "Event" },
  maintenance: { color: "text-amber-400",  bgColor: "bg-amber-500/20 border-amber-500/30", icon: <Wrench size={10} />,       label: "Maintenance" },
  general:     { color: "text-accent",     bgColor: "bg-accent/20 border-accent/30",       icon: <Calendar size={10} />,     label: "General" },
};

function getTypeConfig(type: string) {
  return EVENT_TYPE_CONFIG[type] ?? EVENT_TYPE_CONFIG.general;
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((ev) => {
    const start = parseISO(ev.start_date);
    const end = ev.end_date ? addDays(parseISO(ev.end_date), -1) : start;
    return isWithinInterval(day, { start, end }) || isSameDay(start, day);
  });
}

// ─── Event Detail Sheet ───────────────────────────────────────────────────────

function EventDetailSheet({
  event,
  onClose,
  isMasterAdmin,
  onDelete,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  isMasterAdmin: boolean;
  onDelete: (id: string) => void;
}) {
  if (!event) return null;
  const cfg = getTypeConfig(event.event_type);
  const start = parseISO(event.start_date);
  const end = event.end_date ? parseISO(event.end_date) : null;

  return (
    <Sheet open={!!event} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl"
      >
        <SheetHeader className="flex-shrink-0 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0", cfg.bgColor)}>
                <span className={cn("text-base", cfg.color)}>{cfg.icon}</span>
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base font-semibold leading-tight truncate">
                  {event.title}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={cn("text-xs border", cfg.bgColor, cfg.color)}>
                    {cfg.label}
                  </Badge>
                  {event.is_private && (
                    <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                      <Lock size={10} className="mr-1" /> Private
                    </Badge>
                  )}
                  {event.calendar_source === "ical" && (
                    <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                      <Globe size={10} className="mr-1" /> Synced
                    </Badge>
                  )}
                </div>
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
              <p className="text-muted-foreground">{format(start, "h:mm a")}</p>
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

        {isMasterAdmin && (
          <div className="flex-shrink-0 pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => { onDelete(event.id); onClose(); }}
            >
              Delete Event
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Calendar Settings Dialog ─────────────────────────────────────────────────

function CalendarSettingsDialog({
  open,
  onClose,
  properties,
}: {
  open: boolean;
  onClose: () => void;
  properties: Property[];
}) {
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
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
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

  const saveSettings = async () => {
    setLoading(true);
    const rows = [
      { key: "ical_url", value: icalUrl.trim() },
      { key: "ical_property_id", value: propertyId || null },
      {
        key: "ical_private_keywords",
        value: privateKw.split(",").map((k) => k.trim()).filter(Boolean),
      },
      {
        key: "ical_estate_keywords",
        value: estateKw.split(",").map((k) => k.trim()).filter(Boolean),
      },
    ];
    for (const row of rows) {
      await supabase.from("system_settings").upsert({ key: row.key, value: row.value as never });
    }
    toast.success("Calendar settings saved");
    setLoading(false);
  };

  const syncNow = async () => {
    if (!icalUrl.trim()) { toast.error("Please save an iCal URL first"); return; }
    setSyncing(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        },
      );
      const data = await resp.json();
      if (!resp.ok) { toast.error(data.error ?? "Sync failed"); return; }
      const ts = new Date().toISOString();
      await supabase.from("system_settings").upsert({ key: "ical_last_sync", value: ts });
      setLastSync(ts);
      toast.success(`Synced ${data.synced} events (${data.parsed} parsed)`);
    } catch {
      toast.error("Sync request failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Calendar Sync Settings</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2">
          {/* iCal URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">iCal / WebCal URL</Label>
            <p className="text-xs text-muted-foreground">
              Paste an iCal (.ics) URL from Apple Calendar, Google Calendar, Skylight, or any CalDAV source.
              In Apple Calendar: Share → Copy Link. In Google: Calendar settings → Integrate → Secret address in iCal format.
            </p>
            <Input
              value={icalUrl}
              onChange={(e) => setIcalUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              className="font-mono text-xs"
            />
          </div>

          {/* Property */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Property</Label>
            <p className="text-xs text-muted-foreground">Synced events will be linked to this property.</p>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select property…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No property</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Privacy filter */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lock size={14} className="text-muted-foreground" />
              Privacy Filter
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Always-Private Keywords (comma separated)</Label>
              <p className="text-xs text-muted-foreground/70">Events matching these words will never be shown to staff.</p>
              <Input
                value={privateKw}
                onChange={(e) => setPrivateKw(e.target.value)}
                placeholder="doctor, therapy, school, personal…"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Estate-Relevant Keywords (comma separated)</Label>
              <p className="text-xs text-muted-foreground/70">Events matching these words will be shown to staff & trigger Agent Ronin.</p>
              <Input
                value={estateKw}
                onChange={(e) => setEstateKw(e.target.value)}
                placeholder="montana, hamptons, dinner party, renovation…"
              />
            </div>
          </div>

          {/* Sync status */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Manual Sync</p>
              {lastSync && (
                <p className="text-xs text-muted-foreground">
                  Last sync: {format(parseISO(lastSync), "MMM d, h:mm a")}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Trigger an immediate pull from your iCal feed. Events are deduplicated — re-syncing is safe.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={syncNow}
              disabled={syncing || !icalUrl.trim()}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          </div>

          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 flex gap-2">
            <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
            <p className="text-xs text-warning/90">
              <span className="font-medium">Agent Ronin</span> will automatically analyse estate-relevant synced events and post briefings + SOP links to the relevant staff chat threads.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 pt-3 border-t border-border gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={saveSettings} disabled={loading} className="gap-2">
            <Check size={14} />
            {loading ? "Saving…" : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Event Dialog ─────────────────────────────────────────────────────────

function NewEventDialog({
  open,
  onClose,
  onSave,
  properties,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  properties: Property[];
  userId: string | null;
}) {
  const [form, setForm] = useState({
    title: "", description: "", location: "",
    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    end_date: "", event_type: "general", property_id: "",
    is_private: false,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim() || !userId) return;
    setSaving(true);
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
    });
    setSaving(false);
    if (error) { toast.error("Failed to save event"); return; }
    toast.success("Event added");
    onSave();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>New Event</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Event title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="datetime-local" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="datetime-local" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.event_type} onValueChange={(v) => setForm((f) => ({ ...f, event_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Optional location" />
          </div>
          <div className="space-y-1.5">
            <Label>Property</Label>
            <Select value={form.property_id} onValueChange={(v) => setForm((f) => ({ ...f, property_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select property…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional notes…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_private}
              onChange={(e) => setForm((f) => ({ ...f, is_private: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Private event</p>
              <p className="text-xs text-muted-foreground">Only visible to admins</p>
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

// ─── Main CalendarSection ─────────────────────────────────────────────────────

export function CalendarSection() {
  const { isMasterAdmin, userId } = usePermissions();
  const { language } = useLanguage();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_date", start.toISOString())
      .lte("start_date", end.toISOString())
      .order("start_date");

    setEvents((data as CalendarEvent[]) ?? []);
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    supabase.from("properties").select("id, name").order("sort_order").then(({ data }) => {
      setProperties((data as Property[]) ?? []);
    });
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("calendar_events_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, fetchEvents)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchEvents]);

  const deleteEvent = async (id: string) => {
    await supabase.from("calendar_events").delete().eq("id", id);
    toast.success("Event deleted");
    fetchEvents();
  };

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const dayEvents = selectedDay ? eventsForDay(events, selectedDay) : [];
  const upcomingEvents = events
    .filter((e) => parseISO(e.start_date) >= new Date())
    .slice(0, 5);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {isMasterAdmin ? "Full schedule — private & estate events" : "Estate schedule & events"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isMasterAdmin && (
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
              <Settings size={18} />
            </Button>
          )}
          {isMasterAdmin && (
            <Button size="sm" onClick={() => setShowNewEvent(true)} className="gap-2">
              <Plus size={14} /> Add Event
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
              <ChevronLeft size={16} />
            </Button>
            <h2 className="font-semibold text-base">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-xs text-muted-foreground font-medium py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dayEvs = eventsForDay(events, day);
              const inMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              const todayDay = isToday(day);

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(-1)) ? null : day)}
                  className={cn(
                    "min-h-[72px] p-1 border-b border-r border-border text-left transition-colors",
                    "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    !inMonth && "opacity-30",
                    isSelected && "bg-accent/10",
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1",
                    todayDay ? "bg-primary text-primary-foreground" : (isSelected ? "bg-accent/20 text-accent-foreground" : "text-foreground"),
                  )}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvs.slice(0, 2).map((ev) => {
                      const cfg = getTypeConfig(ev.event_type);
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                          className={cn(
                            "text-[10px] font-medium px-1 py-0.5 rounded truncate flex items-center gap-1 border cursor-pointer hover:opacity-80",
                            cfg.bgColor, cfg.color
                          )}
                        >
                          {ev.is_private && <Lock size={7} className="flex-shrink-0" />}
                          <span className="truncate">{ev.title}</span>
                        </div>
                      );
                    })}
                    {dayEvs.length > 2 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayEvs.length - 2} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Selected day events */}
          {selectedDay && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm">{format(selectedDay, "MMMM d")}</h3>
                <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              {dayEvents.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">No events</div>
              ) : (
                <div className="divide-y divide-border">
                  {dayEvents.map((ev) => {
                    const cfg = getTypeConfig(ev.event_type);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 mt-0.5", cfg.bgColor)}>
                            <span className={cfg.color}>{cfg.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{ev.title}</p>
                            <p className="text-xs text-muted-foreground">{format(parseISO(ev.start_date), "h:mm a")}</p>
                          </div>
                          {ev.is_private && <Lock size={12} className="text-muted-foreground mt-1 flex-shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming events */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Upcoming</h3>
            </div>
            {loading ? (
              <div className="px-4 py-6 flex justify-center">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No upcoming events</div>
            ) : (
              <div className="divide-y divide-border">
                {upcomingEvents.map((ev) => {
                  const cfg = getTypeConfig(ev.event_type);
                  const start = parseISO(ev.start_date);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-center w-9 flex-shrink-0">
                          <p className="text-[10px] text-muted-foreground uppercase font-medium">{format(start, "MMM")}</p>
                          <p className="text-lg font-bold leading-none">{format(start, "d")}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{ev.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className={cn("text-[10px] border px-1 py-0", cfg.bgColor, cfg.color)}>
                              {cfg.label}
                            </Badge>
                            {ev.is_private && <Lock size={10} className="text-muted-foreground" />}
                            {ev.calendar_source === "ical" && <Globe size={10} className="text-muted-foreground" />}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* iCal sync info for admin */}
          {isMasterAdmin && (
            <div
              onClick={() => setShowSettings(true)}
              className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe size={14} className="text-muted-foreground" />
                Calendar Sync
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Connect Apple, Google, or Skylight calendar via iCal URL → Settings
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <EventDetailSheet
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        isMasterAdmin={isMasterAdmin}
        onDelete={deleteEvent}
      />
      <CalendarSettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        properties={properties}
      />
      <NewEventDialog
        open={showNewEvent}
        onClose={() => setShowNewEvent(false)}
        onSave={fetchEvents}
        properties={properties}
        userId={userId}
      />
    </div>
  );
}
