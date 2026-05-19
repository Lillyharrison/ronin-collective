import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { PROPERTY_COLOR_OVERRIDES } from "./constants";
import { getDisplayName, formatTime } from "./utils";
import type { DisplayShift, Profile, Property } from "./types";

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

function buildExportRows(
  staffToShow: Profile[],
  weekDays: Date[],
  displayShifts: DisplayShift[],
  properties: Property[],
) {
  return staffToShow.map((person) => {
    const row: Record<string, string> = { Staff: getDisplayName(person) };
    weekDays.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayShifts = displayShifts.filter((s) => s.staff_id === person.id && s.shift_date === dateStr);
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

export function exportScheduleExcel(opts: {
  staffToShow: Profile[];
  weekDays: Date[];
  weekStart: Date;
  displayShifts: DisplayShift[];
  properties: Property[];
}) {
  const { staffToShow, weekDays, weekStart, displayShifts, properties } = opts;
  const rows = buildExportRows(staffToShow, weekDays, displayShifts, properties);
  const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));
  const excelRows = rows.map((row) => {
    const r: Record<string, string> = { Staff: row["Staff"].replace(/\n/g, " – ") };
    dayHeaders.forEach((h) => { r[h] = (row[h] ?? "").replace(/\n/g, " "); });
    return r;
  });
  const ws = XLSX.utils.json_to_sheet(excelRows, { header: ["Staff", ...dayHeaders] });

  ["A1", ...dayHeaders.map((_, i) => `${String.fromCharCode(66 + i)}1`)].forEach((cell) => {
    if (ws[cell]) ws[cell].s = { font: { bold: true, color: { rgb: "F5F0E8" } }, fill: { patternType: "solid", fgColor: { rgb: "1C1D20" } } };
  });

  staffToShow.forEach((person, ri) => {
    weekDays.forEach((day, ci) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayShifts = displayShifts.filter(
        (s) => s.staff_id === person.id && s.shift_date === dateStr && !s.is_leave
      );
      const cellAddr = `${String.fromCharCode(66 + ci)}${ri + 2}`;
      if (ws[cellAddr] && dayShifts.length > 0) {
        const col = getExportPropColor(dayShifts[0].property_id, properties);
        ws[cellAddr].s = { fill: { patternType: "solid", fgColor: { rgb: col.bg } }, font: { color: { rgb: col.text } } };
      }
    });
  });

  ws["!cols"] = [{ wch: 22 }, ...dayHeaders.map(() => ({ wch: 18 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");
  XLSX.writeFile(wb, `staff-schedule-${format(weekStart, "yyyy-MM-dd")}.xlsx`);
  toast.success("Excel file downloaded");
}

export function exportSchedulePDF(opts: {
  staffToShow: Profile[];
  weekDays: Date[];
  weekStart: Date;
  weekLabel: string;
  displayShifts: DisplayShift[];
  properties: Property[];
}) {
  const { staffToShow, weekDays, weekStart, weekLabel, displayShifts, properties } = opts;
  const pageWidth = 297;
  const marginL = 10;
  const marginR = 10;
  const usableWidth = pageWidth - marginL - marginR;
  const staffColW = 36;
  const dayColW = (usableWidth - staffColW) / 7;

  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Staff Schedule — ${weekLabel}`, marginL, 13);

  const dayHeaders = weekDays.map((d) => format(d, "EEE d/M"));

  type PdfBodyRow = { cells: string[]; isSeparator: boolean; staffIndex: number };
  const pdfRows: PdfBodyRow[] = [];
  let lastDept: string | null | undefined = undefined;

  const exportRows = buildExportRows(staffToShow, weekDays, displayShifts, properties);

  staffToShow.forEach((person, idx) => {
    const dept = person.department ?? null;
    if (idx > 0 && dept !== lastDept) {
      pdfRows.push({ cells: Array(8).fill(""), isSeparator: true, staffIndex: -1 });
    }
    lastDept = dept;

    const nameOnly = getDisplayName(person);
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

      if (pdfRow.isSeparator) {
        data.cell.styles.fillColor = [255, 255, 255];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontSize = 1;
        data.cell.styles.cellPadding = { top: 1, bottom: 1, left: 0, right: 0 };
        data.cell.styles.lineWidth = 0;
        data.cell.styles.minCellHeight = 3;
        return;
      }

      if (data.column.index === 0) {
        data.cell.styles.fontStyle = "bold";
        return;
      }

      const person = staffToShow[pdfRow.staffIndex];
      if (!person) return;
      const day = weekDays[data.column.index - 1];
      const dateStr = format(day, "yyyy-MM-dd");
      const dayShifts = displayShifts.filter(
        (s) => s.staff_id === person.id && s.shift_date === dateStr && !s.is_leave
      );
      if (dayShifts.length > 0) {
        const col = getExportPropColor(dayShifts[0].property_id, properties);
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
      if (data.section !== "body" || data.column.index !== 0) return;
      const pdfRow = pdfRows[data.row.index];
      if (!pdfRow || pdfRow.isSeparator) return;
      const person = staffToShow[pdfRow.staffIndex];
      if (!person?.job_title) return;

      const nameBaselineY = data.cell.y + 2.5 + 2.6;
      const titleY = nameBaselineY + 3.5;
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(110, 110, 110);
      doc.text(person.job_title, data.cell.x + 2, titleY, { maxWidth: staffColW - 4 });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(7.5);
    },
    margin: { left: marginL, right: marginR },
  });

  doc.save(`staff-schedule-${format(weekStart, "yyyy-MM-dd")}.pdf`);
  toast.success("PDF downloaded");
}
