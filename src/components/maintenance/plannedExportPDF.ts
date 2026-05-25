// PDF export for the Planned Maintenance section.
//
// Produces a clean, print-ready A4 document that mirrors the on-screen view
// (list/table OR tile/card) with whatever filters the user has set. Uses the
// same jsPDF + jspdf-autotable stack already used by the Staff Schedule export
// so we stay consistent across the app.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";
import type { PlannedMaintenanceEntry } from "@/hooks/usePlannedMaintenance";

const MONTHS_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const STATUS_LABELS: Record<string, string> = {
  future:              "Future (Too Early)",
  to_be_booked:        "To Be Booked",
  booked:              "Booked",
  initiated_by_vendor: "Initiated by Vendor",
  completed:           "Completed",
  cancelled:           "Cancelled",
};

// Soft RGB pairs for status pills (background, text). Matches on-screen palette.
const STATUS_PILL: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
  future:              { bg: [226, 232, 240], text: [71, 85, 105] },    // slate
  to_be_booked:        { bg: [254, 243, 199], text: [146, 64, 14] },   // amber
  booked:              { bg: [255, 237, 213], text: [154, 52, 18] },   // orange
  initiated_by_vendor: { bg: [237, 233, 254], text: [91, 33, 182] },   // purple
  completed:           { bg: [209, 250, 229], text: [6, 95, 70] },     // emerald
  cancelled:           { bg: [243, 244, 246], text: [107, 114, 128] }, // muted
  overdue:             { bg: [254, 226, 226], text: [153, 27, 27] },   // red (urgency override)
};

function getTargetDate(entry: PlannedMaintenanceEntry): Date | null {
  if (entry.date_type === "specific" && entry.scheduled_date) return parseISO(entry.scheduled_date);
  if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year)
    return new Date(entry.scheduled_year, entry.scheduled_month - 1, 1);
  return null;
}

function formatEntryDate(entry: PlannedMaintenanceEntry): string {
  if (entry.recurrence_months === -1) return "Weekly";
  if (entry.recurrence_months === -2) return "Monthly";
  if (entry.date_type === "specific" && entry.scheduled_date) {
    return format(parseISO(entry.scheduled_date), "dd MMM yyyy");
  }
  if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year) {
    return `${MONTHS_SHORT[entry.scheduled_month - 1]} ${entry.scheduled_year} (est.)`;
  }
  return "—";
}

function formatRecurrence(entry: PlannedMaintenanceEntry): string {
  if (!entry.recurrence_months) return "—";
  if (entry.recurrence_months === -1) return "Weekly";
  if (entry.recurrence_months === -2) return "Monthly";
  return `Every ${entry.recurrence_months} mo`;
}

function firstName(name?: string | null): string {
  if (!name) return "—";
  return name.split(" ")[0];
}

// Determine if a row should be flagged as overdue (visual cue only).
function isOverdue(entry: PlannedMaintenanceEntry): boolean {
  if (entry.status !== "to_be_booked") return false;
  const target = getTargetDate(entry);
  if (!target) return false;
  return differenceInDays(target, new Date()) < 0;
}

export interface PlannedExportContext {
  entries: PlannedMaintenanceEntry[];        // already filtered + sorted (the list the user sees)
  viewMode: "tile" | "list";
  filters: {
    propertyName?: string | null;             // resolved property name for the active filter (or null = "All")
    status?: string | null;                   // raw status key (e.g. "to_be_booked") or null = "All"
    search?: string | null;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared header drawing
// ──────────────────────────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, ctx: PlannedExportContext, pageWidth: number, marginL: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(28, 29, 32);
  doc.text("Planned Maintenance", marginL, 14);

  // Sub-line: filters applied + count + generated date
  const parts: string[] = [];
  parts.push(`${ctx.entries.length} ${ctx.entries.length === 1 ? "entry" : "entries"}`);
  parts.push(`Property: ${ctx.filters.propertyName ?? "All"}`);
  parts.push(`Status: ${ctx.filters.status ? (STATUS_LABELS[ctx.filters.status] ?? ctx.filters.status) : "All"}`);
  if (ctx.filters.search) parts.push(`Search: "${ctx.filters.search}"`);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text(parts.join("  ·  "), marginL, 19.5);

  // Right-aligned generated stamp
  const stamp = `Generated ${format(new Date(), "dd MMM yyyy, HH:mm")}`;
  const stampW = doc.getTextWidth(stamp);
  doc.text(stamp, pageWidth - marginL - stampW, 19.5);

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(marginL, 22, pageWidth - marginL, 22);

  return 26; // y-position to start content
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const pageCount = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const text = `Page ${i} of ${pageCount}`;
    const w = doc.getTextWidth(text);
    doc.text(text, pageWidth - 10 - w, pageHeight - 6);
    doc.text("Ronin · Planned Maintenance", 10, pageHeight - 6);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// LIST / TABLE export — landscape A4
// ──────────────────────────────────────────────────────────────────────────────

function buildListDoc(ctx: PlannedExportContext, scale: number): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();    // 297
  const pageHeight = doc.internal.pageSize.getHeight();  // 210
  const marginL = 10;
  const marginR = 10;
  const startY = drawHeader(doc, ctx, pageWidth, marginL);

  const head = [["Title", "Status", "Last Service", "Date", "Contractor", "Property", "Assigned", "Reminder", "Recurrence"]];
  const body = ctx.entries.map((e) => [
    e.title + (e.description ? `\n${e.description}` : ""),
    STATUS_LABELS[e.status] ?? e.status,
    e.last_service_date ? format(parseISO(e.last_service_date), "dd MMM yyyy") : "—",
    formatEntryDate(e),
    e.vendor_name ?? "—",
    e.property_name ?? "—",
    firstName(e.assignee_name),
    e.reminder_days > 0 ? `${e.reminder_days}d` : "Off",
    formatRecurrence(e),
  ]);

  // Column widths tuned so 9 columns fit landscape A4 with no overflow.
  // usable = 297 - 20 = 277mm. Status widened so "Initiated by Vendor" fits
  // on a single line; title trimmed to reclaim wasted whitespace.
  const colWidths = [55, 38, 26, 30, 30, 32, 22, 16, 28]; // sum = 277

  const baseFont = 8;
  const baseHeadFont = 8;
  const basePadV = 2.5;
  const basePadH = 2.5;

  autoTable(doc, {
    startY,
    head,
    body,
    headStyles: {
      fillColor: [28, 29, 32],
      textColor: [245, 240, 232],
      fontStyle: "bold",
      fontSize: baseHeadFont * scale,
      cellPadding: { top: 3 * scale, bottom: 3 * scale, left: basePadH * scale, right: basePadH * scale },
      halign: "left",
    },
    bodyStyles: {
      fontSize: baseFont * scale,
      cellPadding: { top: basePadV * scale, bottom: basePadV * scale, left: basePadH * scale, right: basePadH * scale },
      overflow: "linebreak",
      valign: "middle",
      lineWidth: 0.1,
      lineColor: [220, 220, 220],
      textColor: [40, 40, 40],
    },
    alternateRowStyles: { fillColor: [250, 250, 248] },
    columnStyles: Object.fromEntries(colWidths.map((w, i) => [i, { cellWidth: w }])),
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const entry = ctx.entries[data.row.index];
      if (!entry) return;

      // Status pill colouring
      if (data.column.index === 1) {
        const overdue = isOverdue(entry);
        const palette = overdue ? STATUS_PILL.overdue : (STATUS_PILL[entry.status] ?? STATUS_PILL.to_be_booked);
        data.cell.styles.fillColor = palette.bg;
        data.cell.styles.textColor = palette.text;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.halign = "center";
      }

      // Date urgency
      if (data.column.index === 3) {
        const target = getTargetDate(entry);
        if (target && entry.status !== "completed" && entry.status !== "cancelled" &&
            entry.recurrence_months !== -1 && entry.recurrence_months !== -2) {
          const days = differenceInDays(target, new Date());
          if (days < 0) {
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fontStyle = "bold";
          } else if (days <= 14) {
            data.cell.styles.textColor = [194, 65, 12];
            data.cell.styles.fontStyle = "bold";
          } else if (days <= 30) {
            data.cell.styles.textColor = [146, 64, 14];
          }
        }
      }

      // Title in bold; description (after \n) stays default — autoTable handles wrapping.
      if (data.column.index === 0) {
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: marginL, right: marginR, bottom: 14 },
  });

  return doc;
}

function exportListPDF(ctx: PlannedExportContext) {
  const doc = autoFitDoc((scale) => buildListDoc(ctx, scale));
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  drawFooter(doc, pageWidth, pageHeight);
  doc.save(`planned-maintenance-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  toast.success("PDF downloaded");
}

// ──────────────────────────────────────────────────────────────────────────────
// TILE / CARD export — portrait A4
// ──────────────────────────────────────────────────────────────────────────────

function buildTileDoc(ctx: PlannedExportContext, scale: number): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();    // 210
  const marginL = 12;
  const marginR = 12;
  const startY = drawHeader(doc, ctx, pageWidth, marginL);

  // Two-column layout: left ~55%, right ~45%
  const usable = pageWidth - marginL - marginR; // 186
  const leftW = 100;
  const rightW = usable - leftW; // 86

  const body = ctx.entries.map((e) => {
    const left = e.description ? `${e.title}\n${e.description}` : e.title;
    const metaLines: string[] = [];
    metaLines.push(`Status:    ${STATUS_LABELS[e.status] ?? e.status}${isOverdue(e) ? "  (OVERDUE)" : ""}`);
    metaLines.push(`Date:      ${formatEntryDate(e)}`);
    if (e.last_service_date) {
      metaLines.push(`Last svc:  ${format(parseISO(e.last_service_date), "dd MMM yyyy")}`);
    }
    metaLines.push(`Property:  ${e.property_name ?? "—"}`);
    metaLines.push(`Contractor:${e.vendor_name ? " " + e.vendor_name : " —"}`);
    metaLines.push(`Assigned:  ${firstName(e.assignee_name)}`);
    metaLines.push(`Reminder:  ${e.reminder_days > 0 ? `${e.reminder_days} days` : "Off"}`);
    metaLines.push(`Recurs:    ${formatRecurrence(e)}`);
    return [left, metaLines.join("\n")];
  });

  autoTable(doc, {
    startY,
    head: [],
    body,
    theme: "plain",
    bodyStyles: {
      fontSize: 9 * scale,
      cellPadding: { top: 4 * scale, bottom: 4 * scale, left: 4 * scale, right: 4 * scale },
      overflow: "linebreak",
      valign: "top",
      lineWidth: 0.2,
      lineColor: [220, 220, 220],
      textColor: [40, 40, 40],
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: leftW, fontStyle: "normal" },
      1: { cellWidth: rightW, font: "courier", fontSize: 8.5 * scale, textColor: [70, 70, 70] },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const entry = ctx.entries[data.row.index];
      if (!entry) return;
      if (data.column.index === 0) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10 * scale;
      }
      if (data.row.index % 2 === 1) {
        data.cell.styles.fillColor = [250, 249, 245];
      }
    },
    margin: { left: marginL, right: marginR, bottom: 14 },
  });

  return doc;
}

function exportTilePDF(ctx: PlannedExportContext) {
  const doc = autoFitDoc((scale) => buildTileDoc(ctx, scale));
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  drawFooter(doc, pageWidth, pageHeight);
  doc.save(`planned-maintenance-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  toast.success("PDF downloaded");
}

// ──────────────────────────────────────────────────────────────────────────────
// Auto-fit: render → measure last-page fill → if sparse, shrink and re-render
// to claw back the page. Stops as soon as page count drops or scale floor hit.
// ──────────────────────────────────────────────────────────────────────────────

function lastPageFillRatio(doc: jsPDF): number {
  // jspdf-autotable stamps the last drawn finalY on the doc instance.
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableTop = 26;       // matches drawHeader return
  const bottomPad = 14;       // matches autoTable bottom margin
  const usable = pageHeight - usableTop - bottomPad;
  // finalY is in absolute page coords for the current (last) page.
  const used = Math.max(0, finalY - usableTop);
  return Math.min(1, used / usable);
}

function autoFitDoc(builder: (scale: number) => jsPDF): jsPDF {
  const SPARSE_THRESHOLD = 0.25; // last page <25% full → try to compress
  const SCALES = [1.0, 0.95, 0.9, 0.85, 0.8]; // gentle, capped to stay legible

  let doc = builder(SCALES[0]);
  let pages = doc.getNumberOfPages();
  if (pages <= 1) return doc;

  let fill = lastPageFillRatio(doc);
  if (fill >= SPARSE_THRESHOLD) return doc;

  for (let i = 1; i < SCALES.length; i++) {
    const candidate = builder(SCALES[i]);
    const candidatePages = candidate.getNumberOfPages();
    if (candidatePages < pages) {
      // Successfully removed a page — keep this one and check again if still sparse.
      doc = candidate;
      pages = candidatePages;
      if (pages <= 1) return doc;
      fill = lastPageFillRatio(doc);
      if (fill >= SPARSE_THRESHOLD) return doc;
    }
  }
  return doc;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────────────

export function exportPlannedMaintenancePDF(ctx: PlannedExportContext) {
  if (ctx.entries.length === 0) {
    toast.error("Nothing to export — no entries match the current filters");
    return;
  }
  if (ctx.viewMode === "list") exportListPDF(ctx);
  else exportTilePDF(ctx);
}
