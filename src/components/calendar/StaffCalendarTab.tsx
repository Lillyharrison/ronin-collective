import { useState, useRef, useEffect, useCallback } from "react";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, isSameDay,
  differenceInCalendarDays, parseISO,
  startOfMonth, endOfMonth, addMonths, subMonths,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffSchedules } from "@/hooks/useStaffSchedules";
import { usePermissions } from "@/hooks/usePermissions";

import type { Profile, Property, DisplayShift, FamilyEvent, RosterStats } from "./staff/types";
import { getDisplayName, buildDisplayShifts } from "./staff/utils";
import { FamilyOverlayBand } from "./staff/FamilyOverlayBand";
import { CalculatorPanel } from "./staff/CalculatorPanel";
import { ShiftModal } from "./staff/ShiftModal";
import { LeaveModal } from "./staff/LeaveModal";
import { ScheduleManagerDrawer } from "./staff/ScheduleManagerDrawer";
import { LeavePanel } from "./staff/LeavePanel";
import { StaffMonthGrid } from "./staff/StaffMonthGrid";
import { StaffDaysSummary } from "./staff/StaffDaysSummary";
import { StaffWeekGrid } from "./staff/StaffWeekGrid";
import { CalendarToolbar } from "./staff/CalendarToolbar";
import { StaffFilterBar } from "./staff/StaffFilterBar";
import { PropertyLegend } from "./staff/PropertyLegend";
import { exportScheduleExcel, exportSchedulePDF } from "./staff/exportUtils";

export function StaffCalendarTab({
  canEdit,
  userId,
  scopeFilterIds = null,
}: {
  canEdit: boolean;
  userId: string | null;
  /** If non-null, restrict the visible staff rows to these user IDs (for non-admin scopes). */
  scopeFilterIds?: string[] | null;
}) {
  const [calView, setCalView] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Month-view date range (From / To). Persisted to localStorage.
  // Defaults: today's month → end of (today + 3 months), matching reference HTML behaviour.
  const [rangeStart, setRangeStartState] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("ronin_staff_range_start");
      if (saved) return startOfMonth(new Date(saved));
    } catch { /* noop */ }
    return startOfMonth(new Date());
  });
  const [rangeEnd, setRangeEndState] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("ronin_staff_range_end");
      if (saved) return endOfMonth(new Date(saved));
    } catch { /* noop */ }
    return endOfMonth(addMonths(new Date(), 3));
  });
  const setRangeStart = (d: Date) => {
    const s = startOfMonth(d);
    setRangeStartState(s);
    try { localStorage.setItem("ronin_staff_range_start", s.toISOString()); } catch { /* noop */ }
    // Auto-correct end if user picked start after current end
    if (s > rangeEnd) {
      const newEnd = endOfMonth(s);
      setRangeEndState(newEnd);
      try { localStorage.setItem("ronin_staff_range_end", newEnd.toISOString()); } catch { /* noop */ }
    }
  };
  const setRangeEnd = (d: Date) => {
    const e = endOfMonth(d);
    setRangeEndState(e);
    try { localStorage.setItem("ronin_staff_range_end", e.toISOString()); } catch { /* noop */ }
    if (e < rangeStart) {
      const newStart = startOfMonth(e);
      setRangeStartState(newStart);
      try { localStorage.setItem("ronin_staff_range_start", newStart.toISOString()); } catch { /* noop */ }
    }
  };
  // Backwards-compat alias for code that still references monthStart (week-view nav, etc.)
  const monthStart = rangeStart;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showScheduleManager, setShowScheduleManager] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();
  const [prefillStaff, setPrefillStaff] = useState<string | undefined>();
  const [editingShift, setEditingShift] = useState<DisplayShift | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DisplayShift | null>(null);
  const [scheduleManagerStaff, setScheduleManagerStaff] = useState<string | null>(null);
  const [filterStaff] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [familyEvents, setFamilyEvents] = useState<FamilyEvent[]>([]);

  const { canSee } = usePermissions();
  const showFamilyOverlay = canSee("family-movements");

  const dragRef = useRef<DisplayShift | null>(null);
  const rowDragRef = useRef<string | null>(null);
  const [rowDragOver, setRowDragOver] = useState<string | null>(null);

  const [staffOrder, setStaffOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("ronin_staff_order") ?? "[]"); }
    catch { return []; }
  });

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "staff_calendar_order")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && Array.isArray(data.value)) {
          const order = data.value as string[];
          setStaffOrder(order);
          try { localStorage.setItem("ronin_staff_order", JSON.stringify(order)); } catch { /* noop */ }
        }
      });
  }, []);

  const monthRangeEnd = rangeEnd;

  const {
    schedules, shifts, leaveRequests, loading, refetch,
    createSchedule, editSchedule, updateSchedule, deactivateSchedule,
    createShift, updateShift, deleteShift,
    submitLeaveRequest, reviewLeaveRequest, deleteLeaveRequest,
  } = useStaffSchedules(
    calView === "month" ? monthStart : weekStart,
    userId,
    canEdit,
    calView === "month" ? monthRangeEnd : undefined
  );

  useEffect(() => {
    setProfilesLoading(true);
    Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("properties").select("id, name, city, country").order("sort_order"),
    ]).then(async ([rolesRes, propRes]) => {
      const allRoles = rolesRes.data ?? [];
      const familyRoles = new Set(["principal", "extended_family"]);
      const staffRoles = new Set(["admin", "manager", "staff"]);
      const hasFamilyRole = new Set(
        allRoles.filter((r) => familyRoles.has(r.role)).map((r) => r.user_id)
      );
      const staffUserIds = allRoles
        .filter((r) => staffRoles.has(r.role) && !hasFamilyRole.has(r.user_id))
        .map((r) => r.user_id);
      const uniqueStaffIds = [...new Set(staffUserIds)];

      if (uniqueStaffIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, job_title, department, assigned_property_ids, is_draft, contracted_days_per_week, contracted_hours_per_week, annual_leave_days")
          .in("id", uniqueStaffIds)
          .order("full_name");
        setProfiles((profileData as Profile[]) ?? []);
      } else {
        setProfiles([]);
      }
      setProperties((propRes.data as Property[]) ?? []);
      setProfilesLoading(false);
    });
  }, []);

  useEffect(() => {
    if (calView !== "month" || !showFamilyOverlay) {
      setFamilyEvents([]);
      return;
    }
    const monthEnd = monthRangeEnd;
    const startISO = monthStart.toISOString();
    const endISO = monthEnd.toISOString();
    let cancelled = false;
    supabase
      .from("calendar_events")
      .select("id, title, start_date, end_date, event_type, property_id")
      .in("event_type", ["travel", "guest"])
      .lte("start_date", endISO)
      .or(`end_date.gte.${startISO},end_date.is.null`)
      .then(({ data }) => {
        if (cancelled) return;
        setFamilyEvents((data ?? []) as FamilyEvent[]);
      });
    return () => { cancelled = true; };
  }, [calView, monthStart, monthRangeEnd, showFamilyOverlay]);

  const weekDays = calView === "month"
    ? eachDayOfInterval({ start: monthStart, end: monthRangeEnd })
    : eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) });

  const displayShifts = buildDisplayShifts(weekDays, schedules, shifts, leaveRequests);

  const staffToShow = !canEdit && userId && !scopeFilterIds
    ? profiles.filter((p) => p.id === userId)
    : (() => {
        const activeStaffIds = Array.from(
          new Set([
            ...displayShifts.map((s) => s.staff_id),
            ...schedules.map((s) => s.staff_id),
          ])
        );
        let allStaff = profiles.filter((p) =>
          filterStaff === "all" ? activeStaffIds.includes(p.id) : p.id === filterStaff
        );
        if (scopeFilterIds) {
          const scopeSet = new Set(scopeFilterIds);
          allStaff = allStaff.filter((p) => scopeSet.has(p.id));
        }
        let base = allStaff.length > 0 ? allStaff : (filterStaff === "all" ? profiles.slice(0, 10).filter(p => !scopeFilterIds || scopeFilterIds.includes(p.id)) : profiles.filter((p) => p.id === filterStaff));

        const q = filterSearch.trim().toLowerCase();
        if (q) {
          base = base.filter((p) => {
            const name = (p.full_name ?? "").toLowerCase();
            const title = (p.job_title ?? "").toLowerCase();
            return name.includes(q) || title.includes(q);
          });
        }
        if (filterDepartment !== "all") {
          base = base.filter((p) => (p.department ?? "—") === filterDepartment);
        }
        if (filterProperty !== "all") {
          base = base.filter((p) => (p.assigned_property_ids ?? []).includes(filterProperty));
        }

        const orderMap = new Map(staffOrder.map((id, i) => [id, i]));
        return [...base].sort((a, b) => {
          const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return ai - bi;
        });
      })();

  const departmentOptions = Array.from(
    new Set(profiles.map((p) => p.department).filter((d): d is string => !!d && d.trim() !== ""))
  ).sort();
  const filtersActive = !!filterSearch || filterDepartment !== "all" || filterProperty !== "all";

  const handleRowDragStart = (staffId: string) => { rowDragRef.current = staffId; };
  const handleRowDrop = useCallback(async (targetStaffId: string) => {
    const dragged = rowDragRef.current;
    rowDragRef.current = null;
    setRowDragOver(null);
    if (!dragged || dragged === targetStaffId) return;
    const ids = staffToShow.map((p) => p.id);
    const fromIdx = ids.indexOf(dragged);
    const toIdx = ids.indexOf(targetStaffId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...ids];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragged);
    setStaffOrder(newOrder);
    try { localStorage.setItem("ronin_staff_order", JSON.stringify(newOrder)); } catch { /* noop */ }
    await supabase.from("system_settings").upsert(
      { key: "staff_calendar_order", value: newOrder as never, updated_by: userId },
      { onConflict: "key" }
    );
  }, [staffToShow, userId]);

  const handleDragStart = (shift: DisplayShift) => {
    dragRef.current = shift;
  };

  const handleDrop = useCallback(async (targetDate: string) => {
    const dragged = dragRef.current;
    dragRef.current = null;
    if (!dragged || dragged.is_leave) return;
    if (dragged.shift_date === targetDate) return;

    if (dragged.is_virtual) {
      await supabase.from("staff_shifts").insert([
        {
          staff_id: dragged.staff_id,
          property_id: dragged.property_id,
          schedule_id: dragged.schedule_id,
          shift_date: dragged.shift_date,
          start_time: dragged.start_time,
          end_time: dragged.end_time,
          status: "cancelled",
          notes: "Cancelled — moved to " + targetDate,
          created_by: userId,
        },
        {
          staff_id: dragged.staff_id,
          property_id: dragged.property_id,
          schedule_id: null,
          shift_date: targetDate,
          start_time: dragged.start_time,
          end_time: dragged.end_time,
          status: "scheduled",
          notes: "Moved from " + dragged.shift_date,
          created_by: userId,
        },
      ] as never);
      toast.success("Shift moved · Recurring pattern unchanged for future weeks");
    } else if (dragged.concrete_id) {
      await supabase.from("staff_shifts").update({ shift_date: targetDate } as never).eq("id", dragged.concrete_id);
      toast.success("Shift rescheduled");
    }
    refetch();
  }, [userId, refetch]);

  const handleCellClick = (dateStr: string, staffId: string) => {
    if (!canEdit) return;
    setPrefillDate(dateStr);
    setPrefillStaff(staffId);
    setShowShiftModal(true);
  };

  const handleDeleteShift = useCallback(async (shift: DisplayShift) => {
    if (shift.concrete_id) {
      await deleteShift(shift.concrete_id);
    } else if (shift.is_virtual && shift.schedule_id) {
      const { error } = await supabase.from("staff_shifts").insert({
        staff_id: shift.staff_id,
        property_id: shift.property_id,
        schedule_id: shift.schedule_id,
        shift_date: shift.shift_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        status: "cancelled",
        notes: "Cancelled for this day",
        created_by: userId,
      } as never);
      if (error) { toast.error("Failed to cancel shift"); }
      else { toast.success("Shift cancelled for this day"); refetch(); }
    }
  }, [deleteShift, refetch, userId]);

  const handleShiftDoubleClick = (shift: DisplayShift) => {
    setEditingShift(shift);
    setPrefillDate(shift.shift_date);
    setPrefillStaff(shift.staff_id);
    setShowShiftModal(true);
  };

  const monthsSpan = (rangeEnd.getFullYear() - rangeStart.getFullYear()) * 12 + (rangeEnd.getMonth() - rangeStart.getMonth()) + 1;
  const weekLabel = calView === "month"
    ? (monthsSpan > 1
        ? `${format(rangeStart, "MMM yyyy")} – ${format(rangeEnd, "MMM yyyy")}`
        : format(rangeStart, "MMMM yyyy"))
    : `${format(weekStart, "MMM d")} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));
  const isCurrentMonth = format(rangeStart, "yyyy-MM") === format(new Date(), "yyyy-MM") && monthsSpan === 1;

  // Prev/Next shift the entire range by one month while preserving its width.
  const shiftRange = (delta: number) => {
    setRangeStartState((s) => {
      const ns = startOfMonth(addMonths(s, delta));
      try { localStorage.setItem("ronin_staff_range_start", ns.toISOString()); } catch { /* noop */ }
      return ns;
    });
    setRangeEndState((e) => {
      const ne = endOfMonth(addMonths(e, delta));
      try { localStorage.setItem("ronin_staff_range_end", ne.toISOString()); } catch { /* noop */ }
      return ne;
    });
  };
  const handlePrev = () => calView === "month" ? shiftRange(-1) : setWeekStart((w) => subWeeks(w, 1));
  const handleNext = () => calView === "month" ? shiftRange(1) : setWeekStart((w) => addWeeks(w, 1));
  const handleToday = () => {
    if (calView === "month") {
      const ns = startOfMonth(new Date());
      const ne = endOfMonth(addMonths(new Date(), Math.max(0, monthsSpan - 1)));
      setRangeStartState(ns);
      setRangeEndState(ne);
      try {
        localStorage.setItem("ronin_staff_range_start", ns.toISOString());
        localStorage.setItem("ronin_staff_range_end", ne.toISOString());
      } catch { /* noop */ }
    } else {
      setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    }
  };

  return (
    <div className="space-y-4">
      <CalendarToolbar
        calView={calView}
        setCalView={setCalView}
        weekLabel={weekLabel}
        isCurrentWeek={isCurrentWeek}
        isCurrentMonth={isCurrentMonth}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        canEdit={canEdit}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        setRangeStart={setRangeStart}
        setRangeEnd={setRangeEnd}
        onRequestLeave={() => setShowLeaveModal(true)}
        onAddShift={() => { setPrefillDate(undefined); setPrefillStaff(undefined); setShowShiftModal(true); }}
        onOpenScheduleManager={() => { setScheduleManagerStaff(null); setShowScheduleManager(true); }}
        onExportExcel={() => exportScheduleExcel({ staffToShow, weekDays, weekStart, displayShifts, properties })}
        onExportPDF={() => exportSchedulePDF({ staffToShow, weekDays, weekStart, weekLabel, displayShifts, properties })}
      />

      {canEdit && (
        <StaffFilterBar
          filterSearch={filterSearch}
          setFilterSearch={setFilterSearch}
          filterDepartment={filterDepartment}
          setFilterDepartment={setFilterDepartment}
          filterProperty={filterProperty}
          setFilterProperty={setFilterProperty}
          departmentOptions={departmentOptions}
          properties={properties}
          filtersActive={filtersActive}
          staffCount={staffToShow.length}
          onClear={() => { setFilterSearch(""); setFilterDepartment("all"); setFilterProperty("all"); }}
        />
      )}

      {calView === "month" && (() => {
        const monthDays = eachDayOfInterval({ start: monthStart, end: monthRangeEnd });

        const singleStaff = filterStaff !== "all"
          ? profiles.find((p) => p.id === filterStaff)
          : null;

        let calc: RosterStats | null = null;
        if (singleStaff) {
          const personShifts = displayShifts.filter(
            (s) => s.staff_id === singleStaff.id && !s.is_leave && s.status === "scheduled"
          );
          const daysWorked = new Set(personShifts.map((s) => s.shift_date)).size;
          const hoursWorked = personShifts.reduce((sum, s) => {
            if (!s.start_time || !s.end_time) return sum;
            const [sh, sm] = s.start_time.split(":").map(Number);
            const [eh, em] = s.end_time.split(":").map(Number);
            return sum + Math.max(0, (eh + em / 60) - (sh + sm / 60));
          }, 0);

          const dpw = singleStaff.contracted_days_per_week ?? 5;
          const hpw = singleStaff.contracted_hours_per_week ?? 40;
          const allowance = singleStaff.annual_leave_days ?? 25;

          const weeksInMonth = monthDays.length / 7;
          const daysExpected = Math.round(dpw * weeksInMonth);
          const hoursExpected = hpw * weeksInMonth;

          const yearStart = `${monthStart.getFullYear()}-01-01`;
          const yearEnd = `${monthStart.getFullYear()}-12-31`;
          const leaveTakenYTD = leaveRequests
            .filter((lr) => lr.staff_id === singleStaff.id && lr.status === "approved")
            .reduce((sum, lr) => {
              const start = lr.start_date > yearStart ? lr.start_date : yearStart;
              const end = lr.end_date < yearEnd ? lr.end_date : yearEnd;
              if (start > end) return sum;
              return sum + differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
            }, 0);

          calc = {
            daysWorked, daysExpected, hoursWorked, hoursExpected,
            leaveTakenYTD, leaveAllowance: allowance,
          };
        }

        // Build the list of months in the selected range — each renders as its own stacked card.
        const monthCards: Date[] = [];
        let cursor = startOfMonth(rangeStart);
        const lastMonth = startOfMonth(rangeEnd);
        while (cursor <= lastMonth) {
          monthCards.push(cursor);
          cursor = startOfMonth(addMonths(cursor, 1));
        }

        return (
          <>
            {calc && singleStaff && (
              <CalculatorPanel personName={getDisplayName(singleStaff)} stats={calc} />
            )}
            <StaffDaysSummary
              staffToShow={staffToShow}
              displayShifts={displayShifts}
              leaveRequests={leaveRequests}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
            />
            <div className="space-y-4 mt-4">
              {monthCards.map((mStart) => {
                const mEnd = endOfMonth(mStart);
                const cardDays = eachDayOfInterval({ start: mStart, end: mEnd });
                return (
                  <div key={mStart.toISOString()} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="bg-primary/10 border-b border-border px-4 py-2">
                      <p className="text-sm font-semibold text-primary">{format(mStart, "MMMM yyyy")}</p>
                    </div>
                    <div className="overflow-x-auto">
                      {showFamilyOverlay && (
                        <FamilyOverlayBand
                          monthStart={mStart}
                          monthDays={cardDays}
                          events={familyEvents}
                          properties={properties}
                        />
                      )}
                      <StaffMonthGrid
                        monthStart={mStart}
                        staffToShow={staffToShow}
                        displayShifts={displayShifts}
                        properties={properties}
                        loading={loading || profilesLoading}
                        canEdit={canEdit}
                        onShowScheduleManager={() => setShowScheduleManager(true)}
                        visibleStart={rangeStart}
                        visibleEnd={rangeEnd}
                        noWrapper
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {calView === "week" && (
        <StaffWeekGrid
          weekDays={weekDays}
          staffToShow={staffToShow}
          displayShifts={displayShifts}
          properties={properties}
          loading={loading || profilesLoading}
          canEdit={canEdit}
          rowDragOver={rowDragOver}
          onRowDragStart={handleRowDragStart}
          onRowDragEnd={() => { rowDragRef.current = null; setRowDragOver(null); }}
          onRowDragOver={setRowDragOver}
          onRowDragLeave={() => setRowDragOver(null)}
          onRowDrop={handleRowDrop}
          onOpenScheduleManager={() => setShowScheduleManager(true)}
          onOpenStaffScheduleManager={(staffId) => { setScheduleManagerStaff(staffId); setShowScheduleManager(true); }}
          onCellClick={handleCellClick}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onDeleteShift={handleDeleteShift}
          onShiftDoubleClick={handleShiftDoubleClick}
        />
      )}

      <LeavePanel
        leaveRequests={leaveRequests}
        profiles={profiles}
        onReview={reviewLeaveRequest}
        onDelete={deleteLeaveRequest}
        onNew={() => setShowLeaveModal(true)}
        userId={userId}
        canEdit={canEdit}
      />

      <PropertyLegend properties={properties} />

      <ShiftModal
        open={showShiftModal}
        onClose={() => { setShowShiftModal(false); setEditingShift(null); }}
        onSave={createShift}
        onUpdate={updateShift}
        onUpdateSchedule={updateSchedule}
        onSaveSchedule={createSchedule}
        profiles={profiles}
        properties={properties}
        prefillDate={prefillDate}
        prefillStaff={prefillStaff}
        userId={userId}
        editShift={editingShift}
      />

      <LeaveModal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onSave={submitLeaveRequest}
        profiles={profiles}
        userId={userId}
        canEdit={canEdit}
      />

      <ScheduleManagerDrawer
        open={showScheduleManager}
        onClose={() => setShowScheduleManager(false)}
        staffId={scheduleManagerStaff}
        profiles={profiles}
        properties={properties}
        schedules={schedules}
        onDeactivate={deactivateSchedule}
        onCreate={createSchedule}
        onEdit={editSchedule}
        userId={userId}
      />
    </div>
  );
}
