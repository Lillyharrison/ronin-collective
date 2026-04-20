import { useState, useRef, useEffect, useCallback } from "react";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, isToday, getDay, isSameDay,
  differenceInCalendarDays, parseISO, isWeekend,
  startOfMonth, endOfMonth, addMonths, subMonths,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffSchedules, StaffSchedule, StaffShift, StaffLeaveRequest } from "@/hooks/useStaffSchedules";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Settings2,
  CalendarOff, UserCheck, X, Check, Clock, Pencil,
  PlaneTakeoff, AlertCircle, GripVertical, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Shared local types, constants, and pure helpers live in ./staff/*
// Re-exported here so existing in-file references continue to work unchanged.
import type { Profile, Property, DisplayShift } from "./staff/types";
import {
  PROPERTY_COLORS,
  PROPERTY_COLOR_OVERRIDES,
  LEAVE_TYPES,
  DOW_LABELS,
  DOW_FULL,
  LEAVE_TYPE_CONFIG,
} from "./staff/constants";
import {
  getDisplayName,
  propColor,
  formatTime,
  calcWorkdays,
  buildDisplayShifts,
} from "./staff/utils";
import type { FamilyEvent, RosterStats } from "./staff/types";
import { ShiftChip } from "./staff/ShiftChip";
import { LeaveCard } from "./staff/LeaveCard";
import { FamilyOverlayBand } from "./staff/FamilyOverlayBand";
import { CalculatorPanel } from "./staff/CalculatorPanel";
import { ShiftModal } from "./staff/ShiftModal";
import { LeaveModal } from "./staff/LeaveModal";
import { ScheduleManagerDrawer } from "./staff/ScheduleManagerDrawer";
import { LeavePanel } from "./staff/LeavePanel";
import { StaffDayCell } from "./staff/StaffDayCell";
import { StaffMonthGrid } from "./staff/StaffMonthGrid";

// Leaf components, modals, and grid layers all live in ./staff/*

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
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showScheduleManager, setShowScheduleManager] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();
  const [prefillStaff, setPrefillStaff] = useState<string | undefined>();
  const [editingShift, setEditingShift] = useState<DisplayShift | null>(null);
  const [scheduleManagerStaff, setScheduleManagerStaff] = useState<string | null>(null);
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
  const [familyEvents, setFamilyEvents] = useState<FamilyEvent[]>([]);

  const { canSee } = usePermissions();
  const showFamilyOverlay = canSee("family-movements");

  const dragRef = useRef<DisplayShift | null>(null);
  const rowDragRef = useRef<string | null>(null); // staff_id being row-dragged
  const [rowDragOver, setRowDragOver] = useState<string | null>(null); // staff_id hovered over

  // Persistent staff order — stored in system_settings (DB), localStorage as fast cache
  const [staffOrder, setStaffOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("ronin_staff_order") ?? "[]"); }
    catch { return []; }
  });

  // Load authoritative order from DB on mount
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

  const {
    schedules, shifts, leaveRequests, loading, refetch,
    createSchedule, editSchedule, updateSchedule, deactivateSchedule,
    createShift, updateShift, deleteShift,
    submitLeaveRequest, reviewLeaveRequest, deleteLeaveRequest,
  } = useStaffSchedules(
    calView === "month" ? monthStart : weekStart,
    userId,
    canEdit,
    calView === "month" ? endOfMonth(monthStart) : undefined
  );

  // Load profiles (admin + staff only — exclude principal/extended_family) and properties once
  useEffect(() => {
    setProfilesLoading(true);
    Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("properties").select("id, name, city, country").order("sort_order"),
    ]).then(async ([rolesRes, propRes]) => {
      const allRoles = rolesRes.data ?? [];

      // Build sets: who has a family role, who has a staff role
      const familyRoles = new Set(["principal", "extended_family"]);
      const staffRoles = new Set(["admin", "manager", "staff"]);

      const hasFamilyRole = new Set(
        allRoles.filter((r) => familyRoles.has(r.role)).map((r) => r.user_id)
      );
      // Only include users who have a staff/admin/manager role AND do NOT also have a family role
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

  // ── Fetch family travel/guest events for the visible month (when overlay enabled) ──
  useEffect(() => {
    if (calView !== "month" || !showFamilyOverlay) {
      setFamilyEvents([]);
      return;
    }
    const monthEnd = endOfMonth(monthStart);
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
  }, [calView, monthStart, showFamilyOverlay]);
  const weekDays = calView === "month"
    ? eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) })
    : eachDayOfInterval({
        start: weekStart,
        end: endOfWeek(weekStart, { weekStartsOn: 1 }),
      });

  const displayShifts = buildDisplayShifts(weekDays, schedules, shifts, leaveRequests);

  // Non-admins only see their own row UNLESS a wider scope was provided
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
        // Apply scope filter (e.g. department) for non-admin viewers
        if (scopeFilterIds) {
          const scopeSet = new Set(scopeFilterIds);
          allStaff = allStaff.filter((p) => scopeSet.has(p.id));
        }
        let base = allStaff.length > 0 ? allStaff : (filterStaff === "all" ? profiles.slice(0, 10).filter(p => !scopeFilterIds || scopeFilterIds.includes(p.id)) : profiles.filter((p) => p.id === filterStaff));

        // ── User-controlled filters (search / department / property) ────────
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

        // Apply saved custom order
        const orderMap = new Map(staffOrder.map((id, i) => [id, i]));
        return [...base].sort((a, b) => {
          const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return ai - bi;
        });
      })();

  // Distinct departments present across loaded profiles (for filter dropdown)
  const departmentOptions = Array.from(
    new Set(profiles.map((p) => p.department).filter((d): d is string => !!d && d.trim() !== ""))
  ).sort();
  const filtersActive = !!filterSearch || filterDepartment !== "all" || filterProperty !== "all";

  // ── Row reorder drag handlers ───────────────────────────────────────────────
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
    // Persist to localStorage (fast) and DB (permanent)
    try { localStorage.setItem("ronin_staff_order", JSON.stringify(newOrder)); } catch { /* noop */ }
    await supabase.from("system_settings").upsert(
      { key: "staff_calendar_order", value: newOrder as never, updated_by: userId },
      { onConflict: "key" }
    );
  }, [staffToShow, userId]);

  // ── Shift drag handlers ──────────────────────────────────────────────────────
  const handleDragStart = (shift: DisplayShift) => {
    dragRef.current = shift;
  };

  const handleDrop = useCallback(async (targetDate: string) => {
    const dragged = dragRef.current;
    dragRef.current = null;
    if (!dragged || dragged.is_leave) return;
    if (dragged.shift_date === targetDate) return;

    if (dragged.is_virtual) {
      // Cancel for original date, create concrete for new date (pattern unchanged)
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

  // ── Cell click: open add shift modal pre-filled ────────────────────────────
  const handleCellClick = (dateStr: string, staffId: string) => {
    if (!canEdit) return;
    setPrefillDate(dateStr);
    setPrefillStaff(staffId);
    setShowShiftModal(true);
  };

  const weekLabel = calView === "month"
    ? format(monthStart, "MMMM yyyy")
    : `${format(weekStart, "MMM d")} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));
  const isCurrentMonth = format(monthStart, "yyyy-MM") === format(new Date(), "yyyy-MM");

  // ── Property color map for export (hex colors matching PROPERTY_COLORS + overrides) ──
  const EXPORT_PROP_COLORS = [
    { bg: "DBEAFE", text: "1D4ED8" },  // 0 blue
    { bg: "D1FAE5", text: "065F46" },  // 1 emerald
    { bg: "EDE9FE", text: "5B21B6" },  // 2 purple
    { bg: "FFEDD5", text: "9A3412" },  // 3 orange
    { bg: "FCE7F3", text: "9D174D" },  // 4 pink
    { bg: "CFFAFE", text: "164E63" },  // 5 cyan
    { bg: "FEF3C7", text: "92400E" },  // 6 amber
    { bg: "FFE4E6", text: "9F1239" },  // 7 rose
    { bg: "CCFBF1", text: "134E4A" },  // 8 teal
    { bg: "E0E7FF", text: "3730A3" },  // 9 indigo
  ];

  function getExportPropColor(propId: string | null) {
    if (!propId) return EXPORT_PROP_COLORS[EXPORT_PROP_COLORS.length - 1];
    const prop = properties.find((p) => p.id === propId);
    if (prop) {
      const nameLower = prop.name.toLowerCase();
      for (const [key, colorIdx] of Object.entries(PROPERTY_COLOR_OVERRIDES)) {
        if (nameLower.includes(key)) return EXPORT_PROP_COLORS[colorIdx % EXPORT_PROP_COLORS.length];
      }
    }
    const idx = properties.findIndex((p) => p.id === propId);
    return EXPORT_PROP_COLORS[Math.abs(idx) % EXPORT_PROP_COLORS.length];
  }

  function buildExportRows() {
    return staffToShow.map((person) => {
      // Staff column: name only — job title is drawn separately via didDrawCell
      const row: Record<string, string> = {
        Staff: getDisplayName(person),
      };
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayShifts = displayShifts.filter(
          (s) => s.staff_id === person.id && s.shift_date === dateStr
        );
        row[format(day, "EEE d/M")] = dayShifts.length === 0
          ? ""
          : dayShifts.map((s) => {
              if (s.is_leave) return "Leave";
              const prop = properties.find((p) => p.id === s.property_id);
              const name = prop?.name ?? "—";
              const timeStr = s.start_time && s.end_time
                ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}`
                : s.start_time ? formatTime(s.start_time) : "";
              return timeStr ? `${name}\n${timeStr}` : name;
            }).join("\n");
      });
      return row;
    });
  }

  const handleExportExcel = () => {
    const rows = buildExportRows();
    const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));
    // Excel: replace \n with space for cleaner single-line display
    const excelRows = rows.map((row) => {
      const r: Record<string, string> = { Staff: row["Staff"].replace(/\n/g, " – ") };
      dayHeaders.forEach((h) => { r[h] = (row[h] ?? "").replace(/\n/g, " "); });
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(excelRows, { header: ["Staff", ...dayHeaders] });

    // Style header row
    ["A1", ...dayHeaders.map((_, i) => `${String.fromCharCode(66 + i)}1`)].forEach((cell) => {
      if (ws[cell]) ws[cell].s = { font: { bold: true, color: { rgb: "F5F0E8" } }, fill: { patternType: "solid", fgColor: { rgb: "1C1D20" } } };
    });

    // Color data cells by property
    staffToShow.forEach((person, ri) => {
      weekDays.forEach((day, ci) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayShifts = displayShifts.filter(
          (s) => s.staff_id === person.id && s.shift_date === dateStr && !s.is_leave
        );
        const cellAddr = `${String.fromCharCode(66 + ci)}${ri + 2}`;
        if (ws[cellAddr] && dayShifts.length > 0) {
          const col = getExportPropColor(dayShifts[0].property_id);
          ws[cellAddr].s = { fill: { patternType: "solid", fgColor: { rgb: col.bg } }, font: { color: { rgb: col.text } } };
        }
      });
    });

    ws["!cols"] = [{ wch: 22 }, ...dayHeaders.map(() => ({ wch: 18 }))];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");
    XLSX.writeFile(wb, `staff-schedule-${format(weekStart, "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel file downloaded");
  };

  const handleExportPDF = () => {
    const pageWidth = 297; // A4 landscape mm
    const marginL = 10;
    const marginR = 10;
    const usableWidth = pageWidth - marginL - marginR;
    const staffColW = 36; // slightly wider to fit name + title
    const dayColW = (usableWidth - staffColW) / 7;

    const doc = new jsPDF({ orientation: "landscape", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Staff Schedule — ${weekLabel}`, marginL, 13);

    const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));

    // ── Build PDF body with department separator rows ─────────────────────────
    // A separator row is a full-width empty row (white bg, minimal height)
    // inserted whenever the department changes between consecutive staff members.
    type PdfBodyRow = { cells: string[]; isSeparator: boolean; staffIndex: number };
    const pdfRows: PdfBodyRow[] = [];
    let lastDept: string | null | undefined = undefined;

    staffToShow.forEach((person, idx) => {
      // Normalize: treat null and undefined the same so we don't get false breaks
      const dept = person.department ?? null;
      // Insert thin separator only when department genuinely changes (skip first row)
      if (idx > 0 && dept !== lastDept) {
        pdfRows.push({ cells: Array(8).fill(""), isSeparator: true, staffIndex: -1 });
      }
      lastDept = dept;

      const nameOnly = getDisplayName(person);
      const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));
      const exportRows = buildExportRows();
      const row = exportRows[idx];
      pdfRows.push({
        cells: [nameOnly, ...dayHeaders.map((h) => row[h] ?? "")],
        isSeparator: false,
        staffIndex: idx,
      });
    });

    const tableBody = pdfRows.map((r) => r.cells);

    autoTable(doc, {
      startY: 18,
      head: [["Staff", ...dayHeaders]],
      body: tableBody,
      headStyles: {
        fillColor: [28, 29, 32],
        textColor: [245, 240, 232],
        fontStyle: "bold",
        fontSize: 7.5,
        cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      },
      bodyStyles: {
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
        overflow: "linebreak",
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        minCellHeight: 14,
      },
      columnStyles: {
        0: { cellWidth: staffColW },
        ...Object.fromEntries(dayHeaders.map((_, i) => [i + 1, { cellWidth: dayColW }])),
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const pdfRow = pdfRows[data.row.index];
        if (!pdfRow) return;

        // Separator row: white bg, 3pt height, no borders
        if (pdfRow.isSeparator) {
          data.cell.styles.fillColor = [255, 255, 255];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontSize = 1;
          data.cell.styles.cellPadding = { top: 1, bottom: 1, left: 0, right: 0 };
          data.cell.styles.lineWidth = 0;
          data.cell.styles.minCellHeight = 3;
          return;
        }

        // Staff name column (col 0): bold name — title drawn via didDrawCell
        if (data.column.index === 0) {
          data.cell.styles.fontStyle = "bold";
          return;
        }

        // Shift cells: apply property bg + text color
        const person = staffToShow[pdfRow.staffIndex];
        if (!person) return;
        const day = weekDays[data.column.index - 1];
        const dateStr = format(day, "yyyy-MM-dd");
        const dayShifts = displayShifts.filter(
          (s) => s.staff_id === person.id && s.shift_date === dateStr && !s.is_leave
        );
        if (dayShifts.length > 0) {
          const col = getExportPropColor(dayShifts[0].property_id);
          data.cell.styles.fillColor = [
            parseInt(col.bg.slice(0, 2), 16),
            parseInt(col.bg.slice(2, 4), 16),
            parseInt(col.bg.slice(4, 6), 16),
          ];
          data.cell.styles.textColor = [
            parseInt(col.text.slice(0, 2), 16),
            parseInt(col.text.slice(2, 4), 16),
            parseInt(col.text.slice(4, 6), 16),
          ];
        }
      },
      didDrawCell: (data) => {
        // Draw job title in smaller italic grey text directly below the bold name
        if (data.section !== "body" || data.column.index !== 0) return;
        const pdfRow = pdfRows[data.row.index];
        if (!pdfRow || pdfRow.isSeparator) return;
        const person = staffToShow[pdfRow.staffIndex];
        if (!person?.job_title) return;

        // Name baseline is at y + top-padding + font-size-in-mm
        // 7.5pt ≈ 2.6mm; top padding = 2.5mm
        const nameBaselineY = data.cell.y + 2.5 + 2.6;
        const titleY = nameBaselineY + 3.5; // 3.5mm gap below name baseline
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(110, 110, 110);
        doc.text(person.job_title, data.cell.x + 2, titleY, { maxWidth: staffColW - 4 });
        // Reset
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7.5);
      },
      margin: { left: marginL, right: marginR },
    });

    // No legend — property names and colors in the cells are sufficient

    doc.save(`staff-schedule-${format(weekStart, "yyyy-MM-dd")}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => calView === "month"
              ? setMonthStart((m) => subMonths(m, 1))
              : setWeekStart((w) => subWeeks(w, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[160px]">
            <p className="text-sm font-semibold">{weekLabel}</p>
            {calView === "week" && !isCurrentWeek && (
              <button
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                This week
              </button>
            )}
            {calView === "month" && !isCurrentMonth && (
              <button
                onClick={() => setMonthStart(startOfMonth(new Date()))}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                This month
              </button>
            )}
          </div>
          <button
            onClick={() => calView === "month"
              ? setMonthStart((m) => addMonths(m, 1))
              : setWeekStart((w) => addWeeks(w, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border hover:bg-muted transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* View toggle + Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Week / Month toggle */}
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

          {/* Visible to ALL users — primary CTA for staff */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8 border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => { setShowLeaveModal(true); }}
          >
            <PlaneTakeoff size={13} /> Request Time Off
          </Button>
          {canEdit && (
            <>
              <Button
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => { setPrefillDate(undefined); setPrefillStaff(undefined); setShowShiftModal(true); }}
              >
                <Plus size={13} /> Shift
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setScheduleManagerStaff(null); setShowScheduleManager(true); }}
                title="Manage recurring schedules"
              >
                <Settings2 size={15} />
              </Button>
              {calView === "week" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleExportExcel}
                    title="Download Excel"
                  >
                    <Download size={15} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={handleExportPDF}
                    title="Download PDF"
                  >
                    PDF
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Filter Bar (search / department / property) ───────────────────── */}
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search staff…"
            className="h-8 text-xs w-44"
          />
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departmentOptions.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterProperty} onValueChange={setFilterProperty}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Property" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => { setFilterSearch(""); setFilterDepartment("all"); setFilterProperty("all"); }}
            >
              <X size={13} /> Clear
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">
            {staffToShow.length} {staffToShow.length === 1 ? "person" : "people"}
          </span>
        </div>
      )}

      {/* Property legend rendered below the calendar — see bottom of section. */}

      {/* ── Month View ────────────────────────────────────────────────────── */}
      {calView === "month" && (() => {
        const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) });

        // Show calculator only when filtered to a single person
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

          // Approx weeks in month: total days / 7
          const weeksInMonth = monthDays.length / 7;
          const daysExpected = Math.round(dpw * weeksInMonth);
          const hoursExpected = hpw * weeksInMonth;

          // YTD leave taken (calendar year so far)
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
            daysWorked,
            daysExpected,
            hoursWorked,
            hoursExpected,
            leaveTakenYTD,
            leaveAllowance: allowance,
          };
        }

        return (
          <>
            {calc && singleStaff && (
              <CalculatorPanel personName={getDisplayName(singleStaff)} stats={calc} />
            )}
            <div className="rounded-2xl border border-border bg-card overflow-x-auto">
              {showFamilyOverlay && (
                <FamilyOverlayBand
                  monthStart={monthStart}
                  monthDays={monthDays}
                  events={familyEvents}
                  properties={properties}
                />
              )}
              <StaffMonthGrid
                monthStart={monthStart}
                staffToShow={staffToShow}
                displayShifts={displayShifts}
                properties={properties}
                loading={loading || profilesLoading}
                canEdit={canEdit}
                onShowScheduleManager={() => setShowScheduleManager(true)}
                noWrapper
              />
            </div>
          </>
        );
      })()}

      {/* ── Week Schedule Grid ────────────────────────────────────────────── */}
      {calView === "week" && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Day headers */}
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

        {/* Staff rows */}
        {loading || profilesLoading ? (
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
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => { setShowScheduleManager(true); }}>
                <Settings2 size={13} /> Set Up Schedules
              </Button>
            )}
          </div>
        ) : (
          staffToShow.map((person) => {
            const isExpanded = expandedStaff.has(person.id);
            const personShifts = displayShifts.filter((s) => s.staff_id === person.id);

            return (
              <div
                key={person.id}
                className={cn(
                  "border-b border-border last:border-b-0 transition-colors",
                  rowDragOver === person.id && "bg-primary/5 ring-1 ring-inset ring-primary/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setRowDragOver(person.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRowDragOver(null); }}
                onDrop={(e) => { e.preventDefault(); handleRowDrop(person.id); }}
              >
                <div
                  className="grid"
                  style={{ gridTemplateColumns: "200px repeat(7, 1fr)" }}
                >
                  {/* Staff name cell */}
                  <div className="px-1.5 py-2 border-r border-border flex items-center gap-1.5 min-w-0">
                    {canEdit && (
                      <div
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); handleRowDragStart(person.id); }}
                        onDragEnd={() => { rowDragRef.current = null; setRowDragOver(null); }}
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
                        onClick={() => { setScheduleManagerStaff(person.id); setShowScheduleManager(true); }}
                        className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                        title="Manage schedules"
                      >
                        <Settings2 size={10} />
                      </button>
                    )}
                  </div>

                  {/* Day cells */}
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
                        onCellClick={() => handleCellClick(dateStr, person.id)}
                        onDragStart={handleDragStart}
                        onDrop={handleDrop}
                        onDeleteShift={async (shift) => {
                          if (shift.concrete_id) {
                            await deleteShift(shift.concrete_id);
                          } else if (shift.is_virtual && shift.schedule_id) {
                            // Insert a cancelled concrete record to override the recurring pattern for this day
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
                        }}
                        onShiftDoubleClick={(shift) => {
                          setEditingShift(shift);
                          setPrefillDate(shift.shift_date);
                          setPrefillStaff(shift.staff_id);
                          setShowShiftModal(true);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
        </div>
      )}

      {/* ── Leave Panel ──────────────────────────────────────────── */}
      <LeavePanel
        leaveRequests={leaveRequests}
        profiles={profiles}
        onReview={reviewLeaveRequest}
        onDelete={deleteLeaveRequest}
        onNew={() => setShowLeaveModal(true)}
        userId={userId}
        canEdit={canEdit}
      />

      {/* ── Property Legend (grouped by city) ─────────────────────────────── */}
      {properties.length > 0 && (() => {
        const groups = new Map<string, Property[]>();
        for (const p of properties) {
          const key = (p.city?.trim() || p.country?.trim() || "Other");
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(p);
        }
        const groupEntries = Array.from(groups.entries());
        return (
          <div className="space-y-1.5 pt-1">
            {groupEntries.map(([city, props]) => (
              <div key={city} className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 flex-shrink-0">
                  {city}
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                  {props.map((p) => {
                    const col = propColor(p.id, properties);
                    return (
                      <div key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                        {p.name}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 flex-shrink-0">
                Other
              </span>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarOff size={10} /> Leave
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
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
