import {
  format, eachDayOfInterval, startOfWeek, endOfWeek, addWeeks,
  startOfMonth, endOfMonth, addMonths, differenceInCalendarDays, parseISO,
} from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { PROPERTY_COLOR_OVERRIDES } from "./constants";
import { getDisplayName, formatTime } from "./utils";
import type { DisplayShift, Profile, Property } from "./types";
import type { StaffLeaveRequest } from "@/hooks/useStaffSchedules";
import type { PdfExportLayout } from "./PdfExportModal";

// ─ Colour palette (light bg + dark text per property) ────────────────────────
const EXPORT_PROP_COLORS = [
  { bg: "DBEAFE", text: "1D4ED8" },
  { bg: "D1FAE5", text: "065F46" },
  { bg: "EDE9FE", text: "5B21B6" },
  { bg: "FFEDD5", text: "9A3412" },
  { bg: "FCE7F3", text: "9D174D" },
  { bg: "CFFAFE", text: "164E63" },
  { bg: "FEF3C7", text: "92400E" },
  { bg: "FFE4E6", text: "9F1239" },
  { bg: "CCFBF1", text: "134E4A" },
  { bg: "E0E7FF", text: "3730A3" },
  { bg: "E5E7EB", text: "374151" },
];

function getExportPropColor(propId: string | null, properties: Property[]) {
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

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function propAbbrev(prop: Property | undefined) {
  if (!prop) return "?";
  // Use uppercase letters if name has multiple words; otherwise first 2 chars
  const words = prop.name.trim().split(/\s+/);
  if (words.length > 1) return words.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  return prop.name.slice(0, 2).toUpperCase();
}

// ─ Shared helpers ────────────────────────────────────────────────────────────
function shiftCellText(s: DisplayShift, properties: Property[]) {
  if (s.is_leave) return "Leave";
  const prop = properties.find((p) => p.id === s.property_id);
  const name = prop?.name ?? "—";
  const timeStr = s.start_time && s.end_time
    ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}`
    : s.start_time ? formatTime(s.start_time) : "";
  return timeStr ? `${name}\n${timeStr}` : name;
}

// ─ Header (title + range subtitle) ───────────────────────────────────────────
function drawHeader(doc: jsPDF, title: string, subtitle: string, marginL: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, marginL, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(subtitle, marginL, 15.5);
  doc.setTextColor(0, 0, 0);
}

// ─ Property legend strip ─────────────────────────────────────────────────────
function drawPropertyLegend(doc: jsPDF, properties: Property[], usedPropIds: Set<string>, y: number, marginL: number, usableWidth: number) {
  const used = properties.filter((p) => usedPropIds.has(p.id));
  if (used.length === 0) return y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text("PROPERTIES", marginL, y);
  y += 2.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);

  const swatchSize = 2.5;
  const itemPad = 2;
  let x = marginL;
  for (const p of used) {
    const col = getExportPropColor(p.id, properties);
    const [r, g, b] = hexToRgb(col.bg);
    const label = `${propAbbrev(p)}  ${p.name}`;
    const textW = doc.getTextWidth(label);
    const itemW = swatchSize + 1 + textW + 5;
    if (x + itemW > marginL + usableWidth) {
      x = marginL;
      y += 4;
    }
    doc.setFillColor(r, g, b);
    doc.rect(x, y - swatchSize + 0.4, swatchSize, swatchSize, "F");
    const [tr, tg, tb] = hexToRgb(col.text);
    doc.setTextColor(tr, tg, tb);
    doc.text(label, x + swatchSize + 1, y);
    x += itemW;
  }
  doc.setTextColor(0, 0, 0);
  return y + 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY STACKED (portrait, ~4 weeks/page)
// ─────────────────────────────────────────────────────────────────────────────
function renderWeeklyStacked(
  doc: jsPDF,
  ctx: {
    staffToShow: Profile[];
    displayShifts: DisplayShift[];
    properties: Property[];
    rangeStart: Date;
    rangeEnd: Date;
    rangeLabel: string;
    addPage: boolean;
  },
) {
  const { staffToShow, displayShifts, properties, rangeStart, rangeEnd, rangeLabel, addPage } = ctx;
  if (addPage) doc.addPage("a4", "portrait");

  // Page geometry (portrait A4)
  const pageWidth = 210;
  const marginL = 8;
  const marginR = 8;
  const usableWidth = pageWidth - marginL - marginR;
  const staffColW = 28;
  const dayColW = (usableWidth - staffColW) / 7;

  drawHeader(doc, "Staff Schedule — Weekly", rangeLabel, marginL);

  // Build list of week-starts that overlap the range
  const weeks: Date[] = [];
  let w = startOfWeek(rangeStart, { weekStartsOn: 1 });
  while (w <= rangeEnd) {
    weeks.push(w);
    w = addWeeks(w, 1);
  }

  let cursorY = 19;

  for (let wi = 0; wi < weeks.length; wi++) {
    const wkStart = weeks[wi];
    const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: wkStart, end: wkEnd });

    // Week sub-header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setFillColor(28, 29, 32);
    doc.setTextColor(245, 240, 232);
    doc.rect(marginL, cursorY, usableWidth, 5, "F");
    doc.text(
      `Week of ${format(wkStart, "MMM d")} – ${format(wkEnd, "MMM d, yyyy")}`,
      marginL + 2,
      cursorY + 3.6,
    );
    doc.setTextColor(0, 0, 0);
    cursorY += 5;

    const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));

    type Row = { cells: string[]; staffIndex: number; isSep: boolean };
    const rows: Row[] = [];
    let lastDept: string | null | undefined = undefined;
    staffToShow.forEach((person, idx) => {
      const dept = person.department ?? null;
      if (idx > 0 && dept !== lastDept) rows.push({ cells: Array(8).fill(""), staffIndex: -1, isSep: true });
      lastDept = dept;
      const cells = [
        getDisplayName(person),
        ...weekDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const ds = displayShifts.filter((s) => s.staff_id === person.id && s.shift_date === dateStr);
          if (ds.length === 0) return "";
          return ds.map((s) => shiftCellText(s, properties)).join("\n");
        }),
      ];
      rows.push({ cells, staffIndex: idx, isSep: false });
    });

    autoTable(doc, {
      startY: cursorY,
      head: [["Staff", ...dayHeaders]],
      body: rows.map((r) => r.cells),
      theme: "grid",
      headStyles: {
        fillColor: [55, 55, 60],
        textColor: [245, 240, 232],
        fontStyle: "bold",
        fontSize: 6.8,
        cellPadding: { top: 1.6, bottom: 1.6, left: 1.4, right: 1.4 },
      },
      bodyStyles: {
        fontSize: 6.5,
        cellPadding: { top: 1.4, bottom: 1.4, left: 1.4, right: 1.4 },
        overflow: "linebreak",
        lineWidth: 0.08,
        lineColor: [210, 210, 210],
        minCellHeight: 8,
      },
      columnStyles: {
        0: { cellWidth: staffColW, fontStyle: "bold" },
        ...Object.fromEntries(dayHeaders.map((_, i) => [i + 1, { cellWidth: dayColW }])),
      },
      margin: { left: marginL, right: marginR, top: 18, bottom: 8 },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = rows[data.row.index];
        if (!row) return;
        if (row.isSep) {
          data.cell.styles.fillColor = [255, 255, 255];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontSize = 1;
          data.cell.styles.cellPadding = { top: 0.5, bottom: 0.5, left: 0, right: 0 };
          data.cell.styles.lineWidth = 0;
          data.cell.styles.minCellHeight = 1.5;
          return;
        }
        if (data.column.index === 0) return;
        const person = staffToShow[row.staffIndex];
        const day = weekDays[data.column.index - 1];
        const dateStr = format(day, "yyyy-MM-dd");
        const ds = displayShifts.filter((s) => s.staff_id === person.id && s.shift_date === dateStr && !s.is_leave);
        if (ds.length > 0) {
          const col = getExportPropColor(ds[0].property_id, properties);
          const [r, g, b] = hexToRgb(col.bg);
          const [tr, tg, tb] = hexToRgb(col.text);
          data.cell.styles.fillColor = [r, g, b];
          data.cell.styles.textColor = [tr, tg, tb];
        }
      },
    });
    // @ts-expect-error jspdf-autotable injects lastAutoTable
    cursorY = (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

    // If the next week would overflow this page, force a new page
    const pageHeight = 297;
    const estimateNextHeight = 5 + 6 + (staffToShow.length + 1) * 8;
    if (wi < weeks.length - 1 && cursorY + estimateNextHeight > pageHeight - 8) {
      doc.addPage("a4", "portrait");
      drawHeader(doc, "Staff Schedule — Weekly", rangeLabel, marginL);
      cursorY = 19;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY OVERVIEW (landscape, ~4 months/page)
// ─────────────────────────────────────────────────────────────────────────────
function renderMonthlyOverview(
  doc: jsPDF,
  ctx: {
    staffToShow: Profile[];
    displayShifts: DisplayShift[];
    properties: Property[];
    rangeStart: Date;
    rangeEnd: Date;
    rangeLabel: string;
    addPage: boolean;
  },
) {
  const { staffToShow, displayShifts, properties, rangeStart, rangeEnd, rangeLabel, addPage } = ctx;
  if (addPage) doc.addPage("a4", "landscape");

  const pageWidth = 297;
  const pageHeight = 210;
  const marginL = 8;
  const marginR = 8;
  const usableWidth = pageWidth - marginL - marginR;
  const staffColW = 32;

  drawHeader(doc, "Staff Schedule — Monthly Overview", rangeLabel, marginL);

  // Build the list of months that intersect the range
  const months: Date[] = [];
  let cursor = startOfMonth(rangeStart);
  const lastMonth = startOfMonth(rangeEnd);
  while (cursor <= lastMonth) {
    months.push(cursor);
    cursor = startOfMonth(addMonths(cursor, 1));
  }

  let cursorY = 19;
  const minMonthBlockH = 8 + (staffToShow.length + 1) * 4; // header + rows estimate

  for (let mi = 0; mi < months.length; mi++) {
    const mStart = months[mi];
    const mEnd = endOfMonth(mStart);
    const monthDays = eachDayOfInterval({ start: mStart, end: mEnd });
    const dayCount = monthDays.length;
    const dayColW = (usableWidth - staffColW) / 31; // fixed width so months align visually
    const monthGridW = staffColW + dayCount * dayColW;

    // Page break if needed
    if (cursorY + minMonthBlockH > pageHeight - 6) {
      doc.addPage("a4", "landscape");
      drawHeader(doc, "Staff Schedule — Monthly Overview", rangeLabel, marginL);
      cursorY = 19;
    }

    // Month header bar
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setFillColor(28, 29, 32);
    doc.setTextColor(245, 240, 232);
    doc.rect(marginL, cursorY, monthGridW, 4.5, "F");
    doc.text(format(mStart, "MMMM yyyy"), marginL + 2, cursorY + 3.2);
    doc.setTextColor(0, 0, 0);
    cursorY += 4.5;

    // Day-number header row
    type Row = { cells: string[]; staffIndex: number; isSep: boolean };
    const dayHeaders = monthDays.map((d) => format(d, "d"));
    const rows: Row[] = [];
    let lastDept: string | null | undefined = undefined;
    staffToShow.forEach((person, idx) => {
      const dept = person.department ?? null;
      if (idx > 0 && dept !== lastDept) rows.push({ cells: Array(1 + dayCount).fill(""), staffIndex: -1, isSep: true });
      lastDept = dept;
      const cells = [
        getDisplayName(person),
        ...monthDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const ds = displayShifts.filter((s) => s.staff_id === person.id && s.shift_date === dateStr);
          if (ds.length === 0) return "";
          if (ds[0].is_leave) return "L";
          const prop = properties.find((p) => p.id === ds[0].property_id);
          return propAbbrev(prop);
        }),
      ];
      rows.push({ cells, staffIndex: idx, isSep: false });
    });

    autoTable(doc, {
      startY: cursorY,
      head: [["Staff", ...dayHeaders]],
      body: rows.map((r) => r.cells),
      theme: "grid",
      tableWidth: monthGridW,
      headStyles: {
        fillColor: [55, 55, 60],
        textColor: [245, 240, 232],
        fontStyle: "bold",
        fontSize: 5.5,
        cellPadding: { top: 0.6, bottom: 0.6, left: 0.4, right: 0.4 },
        halign: "center",
        valign: "middle",
      },
      bodyStyles: {
        fontSize: 5.2,
        cellPadding: { top: 0.5, bottom: 0.5, left: 0.4, right: 0.4 },
        overflow: "hidden",
        lineWidth: 0.05,
        lineColor: [220, 220, 220],
        minCellHeight: 3.2,
        halign: "center",
        valign: "middle",
      },
      columnStyles: {
        0: { cellWidth: staffColW, fontStyle: "bold", halign: "left", fontSize: 6 },
        ...Object.fromEntries(dayHeaders.map((_, i) => [i + 1, { cellWidth: dayColW }])),
      },
      margin: { left: marginL, right: marginR, top: 18, bottom: 6 },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = rows[data.row.index];
        if (!row) return;
        if (row.isSep) {
          data.cell.styles.fillColor = [255, 255, 255];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontSize = 1;
          data.cell.styles.cellPadding = { top: 0.3, bottom: 0.3, left: 0, right: 0 };
          data.cell.styles.lineWidth = 0;
          data.cell.styles.minCellHeight = 1;
          return;
        }
        if (data.column.index === 0) return;
        const person = staffToShow[row.staffIndex];
        const day = monthDays[data.column.index - 1];
        const dateStr = format(day, "yyyy-MM-dd");
        const ds = displayShifts.filter((s) => s.staff_id === person.id && s.shift_date === dateStr);
        if (ds.length > 0) {
          if (ds[0].is_leave) {
            data.cell.styles.fillColor = [240, 240, 240];
            data.cell.styles.textColor = [100, 100, 100];
          } else {
            const col = getExportPropColor(ds[0].property_id, properties);
            const [r, g, b] = hexToRgb(col.bg);
            const [tr, tg, tb] = hexToRgb(col.text);
            data.cell.styles.fillColor = [r, g, b];
            data.cell.styles.textColor = [tr, tg, tb];
          }
        }
      },
    });
    // @ts-expect-error jspdf-autotable injects lastAutoTable
    cursorY = (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3.5;
  }

  // Property legend at the end
  const usedPropIds = new Set<string>();
  displayShifts.forEach((s) => { if (s.property_id) usedPropIds.add(s.property_id); });
  if (cursorY + 12 > pageHeight - 6) {
    doc.addPage("a4", "landscape");
    cursorY = 12;
  }
  drawPropertyLegend(doc, properties, usedPropIds, cursorY + 2, marginL, usableWidth);
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF HOURS TRACKING (compact)
// ─────────────────────────────────────────────────────────────────────────────
function renderTracking(
  doc: jsPDF,
  ctx: {
    staffToShow: Profile[];
    displayShifts: DisplayShift[];
    leaveRequests: StaffLeaveRequest[];
    rangeStart: Date;
    rangeEnd: Date;
    rangeLabel: string;
  },
  orientation: "portrait" | "landscape",
) {
  const { staffToShow, displayShifts, leaveRequests, rangeStart, rangeEnd, rangeLabel } = ctx;
  doc.addPage("a4", orientation);
  const pageWidth = orientation === "portrait" ? 210 : 297;
  const marginL = 8;

  drawHeader(doc, "Staff Hours Tracking", rangeLabel, marginL);

  const totalDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).length;
  const weeksInRange = totalDays / 7;
  const yearStart = `${rangeStart.getFullYear()}-01-01`;
  const yearEnd = `${rangeStart.getFullYear()}-12-31`;
  const startStr = format(rangeStart, "yyyy-MM-dd");
  const endStr = format(rangeEnd, "yyyy-MM-dd");

  const rows = staffToShow.map((person) => {
    const personShifts = displayShifts.filter(
      (s) =>
        s.staff_id === person.id &&
        !s.is_leave &&
        s.status === "scheduled" &&
        s.shift_date >= startStr &&
        s.shift_date <= endStr,
    );
    const daysWorked = new Set(personShifts.map((s) => s.shift_date)).size;
    const hoursWorked = personShifts.reduce((sum, s) => {
      if (!s.start_time || !s.end_time) return sum;
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      return sum + Math.max(0, (eh + em / 60) - (sh + sm / 60));
    }, 0);
    const dpw = person.contracted_days_per_week ?? 5;
    const hpw = person.contracted_hours_per_week ?? 40;
    const allowance = person.annual_leave_days ?? 25;
    const daysExpected = Math.round(dpw * weeksInRange);
    const hoursExpected = Math.round(hpw * weeksInRange);

    const leaveTakenYTD = leaveRequests
      .filter((lr) => lr.staff_id === person.id && lr.status === "approved")
      .reduce((sum, lr) => {
        const ls = lr.start_date > yearStart ? lr.start_date : yearStart;
        const le = lr.end_date < yearEnd ? lr.end_date : yearEnd;
        if (ls > le) return sum;
        return sum + differenceInCalendarDays(parseISO(le), parseISO(ls)) + 1;
      }, 0);
    const leaveLeft = Math.max(0, allowance - leaveTakenYTD);
    const daysDelta = daysWorked - daysExpected;
    const hoursDelta = hoursWorked - hoursExpected;

    return [
      getDisplayName(person),
      person.job_title ?? "—",
      `${daysWorked} / ${daysExpected}`,
      daysDelta === 0 ? "" : (daysDelta > 0 ? `+${daysDelta}d` : `${daysDelta}d`),
      `${hoursWorked.toFixed(1)} / ${hoursExpected}`,
      hoursDelta === 0 ? "" : (hoursDelta > 0 ? `+${Math.round(hoursDelta)}h` : `${Math.round(hoursDelta)}h`),
      `${leaveTakenYTD} / ${allowance}`,
      `${leaveLeft}`,
    ];
  });

  autoTable(doc, {
    startY: 19,
    head: [["Staff", "Role", "Days", "Δ", "Hours", "Δ", "Leave YTD", "Left"]],
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: [28, 29, 32],
      textColor: [245, 240, 232],
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 1.8, bottom: 1.8, left: 1.6, right: 1.6 },
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 },
      lineWidth: 0.08,
      lineColor: [210, 210, 210],
      minCellHeight: 5.5,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: orientation === "portrait" ? 42 : 50 },
      1: { textColor: [110, 110, 110], cellWidth: orientation === "portrait" ? 36 : 50 },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "center" },
      7: { halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      // Δ columns: colour positive/negative
      if (data.column.index === 3 || data.column.index === 5) {
        const v = String(data.cell.raw ?? "");
        if (v.startsWith("+")) data.cell.styles.textColor = [16, 130, 80];
        else if (v.startsWith("-")) data.cell.styles.textColor = [180, 90, 20];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: marginL, right: marginL, top: 18, bottom: 8 },
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(130, 130, 130);
  // @ts-expect-error jspdf-autotable injects lastAutoTable
  const finalY = (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.text(
    "Days / Hours = worked vs contracted for the selected range. Leave YTD = approved leave days taken this calendar year vs allowance. Δ shows over/under-time.",
    marginL,
    finalY + 4,
    { maxWidth: pageWidth - marginL * 2 },
  );
  doc.setTextColor(0, 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY
// ─────────────────────────────────────────────────────────────────────────────
export function exportSchedulePDFv2(opts: {
  staffToShow: Profile[];
  displayShifts: DisplayShift[];
  leaveRequests: StaffLeaveRequest[];
  properties: Property[];
  rangeStart: Date;
  rangeEnd: Date;
  layout: PdfExportLayout;
  includeTracking: boolean;
}) {
  const { staffToShow, displayShifts, leaveRequests, properties, rangeStart, rangeEnd, layout, includeTracking } = opts;

  if (staffToShow.length === 0) {
    toast.error("No staff to export");
    return;
  }

  const rangeLabel = `${format(rangeStart, "MMM d, yyyy")} – ${format(rangeEnd, "MMM d, yyyy")}`;

  // Use the first layout's orientation for the initial page so we don't end up with an empty default page.
  const firstOrientation: "portrait" | "landscape" =
    layout === "monthly" ? "landscape" : "portrait";

  const doc = new jsPDF({ orientation: firstOrientation, format: "a4" });

  if (layout === "weekly" || layout === "both") {
    renderWeeklyStacked(doc, {
      staffToShow, displayShifts, properties,
      rangeStart, rangeEnd, rangeLabel,
      addPage: false,
    });
  }

  if (layout === "monthly" || layout === "both") {
    renderMonthlyOverview(doc, {
      staffToShow, displayShifts, properties,
      rangeStart, rangeEnd, rangeLabel,
      addPage: layout === "both",
    });
  }

  if (includeTracking) {
    renderTracking(
      doc,
      { staffToShow, displayShifts, leaveRequests, rangeStart, rangeEnd, rangeLabel },
      layout === "monthly" ? "landscape" : "portrait",
    );
  }

  doc.save(`staff-schedule-${format(rangeStart, "yyyy-MM-dd")}_to_${format(rangeEnd, "yyyy-MM-dd")}.pdf`);
  toast.success("PDF downloaded");
}
