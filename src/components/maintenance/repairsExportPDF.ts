// PDF export for the Repairs (Maintenance Issues) section.
//
// Mirrors the Planned Maintenance export pattern:
//  - List/table view → landscape A4 spreadsheet (no images)
//  - Tile view (board / list)  → portrait A4 cards with a consistently sized
//    photo thumbnail per row when one exists
//  - Auto-fit: if the last page is sparse (<25% full), gently shrink the
//    body until we reclaim a page (or hit the legibility floor).
//  - Honours current filter set (property, category, priority, search,
//    status when relevant) — caller passes the already-filtered list.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";
import type { MaintenanceIssue, IssueStatus } from "@/hooks/useMaintenanceIssues";
import interRegularUrl from "@/assets/fonts/Inter-Regular.ttf?url";
import interSemiBoldUrl from "@/assets/fonts/Inter-SemiBold.ttf?url";
import { PROPERTY_COLOR_OVERRIDES } from "@/components/calendar/staff/constants";

// Property colour palette — mirrors staff schedule export so colour coding is
// consistent across the app. (bg, text) as RGB.
const PROPERTY_PALETTE: Array<{ bg: [number, number, number]; text: [number, number, number] }> = [
  { bg: [219, 234, 254], text: [29, 78, 216] },   // blue
  { bg: [209, 250, 229], text: [6, 95, 70] },     // emerald
  { bg: [237, 233, 254], text: [91, 33, 182] },   // purple
  { bg: [255, 237, 213], text: [154, 52, 18] },   // orange
  { bg: [252, 231, 243], text: [157, 23, 77] },   // pink
  { bg: [207, 250, 254], text: [22, 78, 99] },    // cyan
  { bg: [254, 243, 199], text: [146, 64, 14] },   // amber
  { bg: [255, 228, 230], text: [159, 18, 57] },   // rose
  { bg: [204, 251, 241], text: [19, 78, 74] },    // teal
  { bg: [224, 231, 255], text: [55, 48, 163] },   // indigo
  { bg: [229, 231, 235], text: [55, 65, 81] },    // slate
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getPropertyPalette(name?: string | null) {
  if (!name) return PROPERTY_PALETTE[PROPERTY_PALETTE.length - 1];
  const lower = name.toLowerCase();
  for (const [key, idx] of Object.entries(PROPERTY_COLOR_OVERRIDES)) {
    if (lower.includes(key)) return PROPERTY_PALETTE[idx % PROPERTY_PALETTE.length];
  }
  return PROPERTY_PALETTE[hashStr(lower) % PROPERTY_PALETTE.length];
}

const PDF_FONT = "InterPdf";
const PDF_FONT_REGULAR_FILE = "Inter-Regular.ttf";
const PDF_FONT_SEMIBOLD_FILE = "Inter-SemiBold.ttf";

interface PdfFontData {
  regular: string;
  semibold: string;
}

let pdfFontDataPromise: Promise<PdfFontData> | null = null;

async function fontUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load PDF font: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function loadPdfFontData(): Promise<PdfFontData> {
  pdfFontDataPromise ??= Promise.all([
    fontUrlToBase64(interRegularUrl),
    fontUrlToBase64(interSemiBoldUrl),
  ]).then(([regular, semibold]) => ({ regular, semibold }));
  return pdfFontDataPromise;
}

function installPdfFonts(doc: jsPDF, fonts: PdfFontData) {
  doc.addFileToVFS(PDF_FONT_REGULAR_FILE, fonts.regular);
  doc.addFont(PDF_FONT_REGULAR_FILE, PDF_FONT, "normal");
  doc.addFileToVFS(PDF_FONT_SEMIBOLD_FILE, fonts.semibold);
  doc.addFont(PDF_FONT_SEMIBOLD_FILE, PDF_FONT, "bold");
  doc.setFont(PDF_FONT, "normal");
}

const STATUS_LABELS: Record<IssueStatus, string> = {
  reported:            "Reported",
  under_investigation: "Under Investigation",
  approved:            "Approved",
  scheduled:           "Scheduled/In Progress",
  in_progress:         "Scheduled/In Progress",
  resolved:            "Resolved",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high:   "High",
  medium: "Medium",
  low:    "Low",
};

// Soft RGB pairs for status pills (background, text). Mirrors on-screen palette.
const STATUS_PILL: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
  reported:            { bg: [254, 226, 226], text: [153, 27, 27] },   // red
  under_investigation: { bg: [254, 243, 199], text: [146, 64, 14] },   // amber
  approved:            { bg: [219, 234, 254], text: [30, 64, 175] },   // blue
  assigned:            { bg: [237, 233, 254], text: [91, 33, 182] },   // purple
  scheduled:           { bg: [237, 233, 254], text: [91, 33, 182] },   // purple
  in_progress:         { bg: [237, 233, 254], text: [91, 33, 182] },   // purple
  resolved:            { bg: [209, 250, 229], text: [6, 95, 70] },     // emerald
};

const PRIORITY_PILL: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
  urgent: { bg: [254, 226, 226], text: [153, 27, 27] },
  high:   { bg: [255, 237, 213], text: [154, 52, 18] },
  medium: { bg: [254, 243, 199], text: [146, 64, 14] },
  low:    { bg: [243, 244, 246], text: [75, 85, 99] },
};

function firstName(name?: string | null): string {
  if (!name) return "—";
  return name.split(" ")[0];
}

function ageDays(iso: string): number {
  return Math.max(0, differenceInDays(new Date(), parseISO(iso)));
}

export interface RepairsExportContext {
  issues: MaintenanceIssue[];          // already filtered + sorted (the list the user sees)
  viewMode: "tile" | "list";           // "tile" = cards w/ photos, "list" = compact table
  includeNotes?: boolean;              // when true, render notes/description in the PDF
  filters: {
    propertyName?: string | null;
    category?: string | null;
    priority?: string | null;
    search?: string | null;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Image helpers — fetch + downscale photos so the PDF stays small and the
// thumbnails are visually consistent regardless of source resolution.
// ──────────────────────────────────────────────────────────────────────────────

interface PreparedImage {
  dataUrl: string;
  width: number;   // px
  height: number;  // px
}

const THUMB_MAX_PX = 400; // downscale longest edge to this — plenty for A4 thumbs

async function fetchImageAsThumb(url: string): Promise<PreparedImage | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    // Always produce a SQUARE cover-cropped thumbnail so every photo in the
    // PDF renders with identical framing regardless of the source aspect.
    const size = THUMB_MAX_PX;
    const srcSize = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - srcSize) / 2;
    const sy = (bitmap.height - srcSize) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, sx, sy, srcSize, srcSize, 0, 0, size, size);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.82), width: size, height: size };
  } catch {
    return null;
  }
}

async function preloadImages(issues: MaintenanceIssue[]): Promise<Map<string, PreparedImage>> {
  const map = new Map<string, PreparedImage>();
  // Limit concurrency a little — 6 at a time is plenty
  const queue = [...issues];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length > 0) {
      const issue = queue.shift();
      if (!issue) return;
      const url = issue.photo_url;
      if (!url) continue;
      const img = await fetchImageAsThumb(url);
      if (img) map.set(issue.id, img);
    }
  });
  await Promise.all(workers);
  return map;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared header / footer
// ──────────────────────────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, ctx: RepairsExportContext, pageWidth: number, marginL: number): number {
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(14);
  doc.setTextColor(28, 29, 32);
  doc.text("Repairs", marginL, 14);

  const parts: string[] = [];
  parts.push(`${ctx.issues.length} ${ctx.issues.length === 1 ? "issue" : "issues"}`);
  parts.push(`Property: ${ctx.filters.propertyName ?? "All"}`);
  if (ctx.filters.category) parts.push(`Category: ${ctx.filters.category}`);
  if (ctx.filters.priority) parts.push(`Priority: ${PRIORITY_LABELS[ctx.filters.priority] ?? ctx.filters.priority}`);
  if (ctx.filters.search)   parts.push(`Search: "${ctx.filters.search}"`);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text(parts.join("  ·  "), marginL, 19.5);

  const stamp = `Generated ${format(new Date(), "dd MMM yyyy, HH:mm")}`;
  const stampW = doc.getTextWidth(stamp);
  doc.text(stamp, pageWidth - marginL - stampW, 19.5);

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(marginL, 22, pageWidth - marginL, 22);

  return 26;
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const pageCount = doc.getNumberOfPages();
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const text = `Page ${i} of ${pageCount}`;
    const w = doc.getTextWidth(text);
    doc.text(text, pageWidth - 10 - w, pageHeight - 6);
    doc.text("Ronin · Repairs", 10, pageHeight - 6);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// LIST / TABLE export — landscape A4, no images
// ──────────────────────────────────────────────────────────────────────────────

function buildListDoc(ctx: RepairsExportContext, scale: number, fonts: PdfFontData): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  installPdfFonts(doc, fonts);
  const pageWidth = doc.internal.pageSize.getWidth();   // 297
  const marginL = 10;
  const marginR = 10;
  const startY = drawHeader(doc, ctx, pageWidth, marginL);

  const head = [["Title", "Status", "Priority", "Category", "Property", "Location", "Reported", "Assigned", "Age"]];
  // Row builder — when includeNotes is set, follow each issue row with a
  // full-width sub-row containing the issue's description (if any).
  type Row = (string | { content: string; colSpan: number; styles: Record<string, unknown> })[];
  const body: Row[] = [];
  // Parallel array: for each body row, store the index in ctx.issues it belongs
  // to (issue row), or -1 for a notes/sub-row. autoTable's didParseCell uses
  // data.row.index against `body`, so we need this to recover the source issue.
  const issueIndexByRow: number[] = [];
  ctx.issues.forEach((i, srcIdx) => {
    body.push([
      i.title,
      STATUS_LABELS[i.status] ?? i.status,
      PRIORITY_LABELS[i.priority] ?? i.priority,
      i.category ?? "—",
      i.property_name ?? "—",
      i.location_detail ?? "—",
      format(parseISO(i.created_at), "dd MMM yyyy"),
      firstName(i.assignee_name),
      i.status === "resolved" && i.resolved_at
        ? `Resolved ${format(parseISO(i.resolved_at), "dd MMM")}`
        : `${ageDays(i.created_at)}d`,
    ]);
    issueIndexByRow.push(srcIdx);
    if (ctx.includeNotes && i.description && i.description.trim()) {
      body.push([
        {
          content: `Notes: ${i.description.trim()}`,
          colSpan: 9,
          styles: {
            fontStyle: "normal",
            fontSize: 7.5 * scale,
            textColor: [75, 75, 75],
            fillColor: [252, 251, 247],
            cellPadding: { top: 1.5 * scale, bottom: 2.5 * scale, left: 4 * scale, right: 4 * scale },
          },
        },
      ]);
      issueIndexByRow.push(-1);
    }
  });

  // 9 cols on landscape A4 (usable 277mm). Tuned so Status/Priority fit one line.
  const colWidths = [60, 28, 22, 28, 32, 36, 26, 24, 21]; // sum = 277

  const baseFont = 8;
  const baseHeadFont = 8;
  const basePadV = 2.5;
  const basePadH = 2.5;

  autoTable(doc, {
    startY,
    head,
    body,
    headStyles: {
      font: PDF_FONT,
      fillColor: [28, 29, 32],
      textColor: [245, 240, 232],
      fontStyle: "bold",
      fontSize: baseHeadFont * scale,
      cellPadding: { top: 3 * scale, bottom: 3 * scale, left: basePadH * scale, right: basePadH * scale },
      halign: "left",
    },
    bodyStyles: {
      font: PDF_FONT,
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
      const srcIdx = issueIndexByRow[data.row.index];
      if (srcIdx == null || srcIdx < 0) return; // skip notes sub-rows
      const issue = ctx.issues[srcIdx];
      if (!issue) return;

      // Title bold
      if (data.column.index === 0) {
        data.cell.styles.fontStyle = "bold";
      }

      // Status pill
      if (data.column.index === 1) {
        const palette = STATUS_PILL[issue.status] ?? STATUS_PILL.reported;
        data.cell.styles.fillColor = palette.bg;
        data.cell.styles.textColor = palette.text;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.halign = "center";
      }

      // Priority pill
      if (data.column.index === 2) {
        const palette = PRIORITY_PILL[issue.priority] ?? PRIORITY_PILL.medium;
        data.cell.styles.fillColor = palette.bg;
        data.cell.styles.textColor = palette.text;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.halign = "center";
      }

      // Age column urgency for unresolved
      if (data.column.index === 8 && issue.status !== "resolved") {
        const days = ageDays(issue.created_at);
        if (days >= 30) {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        } else if (days >= 14) {
          data.cell.styles.textColor = [194, 65, 12];
          data.cell.styles.fontStyle = "bold";
        }
      }

      // Property cell — colour-code by property to match on-screen / schedule
      if (data.column.index === 4 && issue.property_name) {
        const palette = getPropertyPalette(issue.property_name);
        data.cell.styles.fillColor = palette.bg;
        data.cell.styles.textColor = palette.text;
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: marginL, right: marginR, bottom: 14 },
  });

  return doc;
}

// ──────────────────────────────────────────────────────────────────────────────
// TILE / CARD export — portrait A4, with photo thumbnails
// ──────────────────────────────────────────────────────────────────────────────

const THUMB_MM = 28; // displayed thumbnail box size (square) on the page

function buildTileDoc(
  ctx: RepairsExportContext,
  scale: number,
  images: Map<string, PreparedImage>,
  fonts: PdfFontData,
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });
  installPdfFonts(doc, fonts);
  const pageWidth = doc.internal.pageSize.getWidth();   // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const marginL = 12;
  const marginR = 12;
  const marginB = 14;
  let y = drawHeader(doc, ctx, pageWidth, marginL);

  const usableW = pageWidth - marginL - marginR;        // 186
  const cardPad = 3;
  const photoBox = THUMB_MM;                            // 28
  const gapAfterPhoto = 4;
  const cardH = photoBox + cardPad * 2;                 // 34

  const metaW = 58;
  const metaColX = marginL + usableW - metaW;
  const titleX = marginL + cardPad + photoBox + gapAfterPhoto;
  const titleW = metaColX - titleX - 3;

  const titleSize = Math.max(8.5, 10 * scale);
  const descSize = Math.max(7.5, 8.8 * scale);
  const metaSize = Math.max(7, 8 * scale);

  const drawPhoto = (issue: MaintenanceIssue, ox: number, oy: number) => {
    const img = images.get(issue.id);
    if (img) {
      // Image is pre-cropped to a square by fetchImageAsThumb, so we can draw
      // it straight into the photo box with no clipping math required.
      try {
        doc.addImage(img.dataUrl, "JPEG", ox, oy, photoBox, photoBox, undefined, "FAST");
      } catch { /* noop */ }
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.rect(ox, oy, photoBox, photoBox);
    } else {
      doc.setFillColor(245, 244, 240);
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.rect(ox, oy, photoBox, photoBox, "FD");
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text("No photo", ox + photoBox / 2, oy + photoBox / 2 + 1, { align: "center" });
    }
  };

  // Coloured pill (used for status + priority on each card).
  const drawPill = (
    text: string,
    x: number,
    yy: number,
    palette: { bg: [number, number, number]; text: [number, number, number] },
  ): number => {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(7.2);
    const padX = 2;
    const w = doc.getTextWidth(text) + padX * 2;
    const h = 3.6;
    doc.setFillColor(...palette.bg);
    doc.setDrawColor(...palette.bg);
    (doc as unknown as { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void })
      .roundedRect(x, yy - h + 1, w, h, 0.8, 0.8, "F");
    doc.setTextColor(...palette.text);
    doc.text(text, x + padX, yy - 0.4);
    return w;
  };

  // Group the issues by status so the tile/board export reads like a kanban —
  // each status becomes a labelled section, matching the on-screen grouping.
  const STATUS_ORDER: IssueStatus[] = [
    "reported",
    "under_investigation",
    "approved",
    "scheduled",
    "in_progress",
    "resolved",
  ];
  const groups = new Map<IssueStatus, MaintenanceIssue[]>();
  ctx.issues.forEach((i) => {
    const key = (i.status === "in_progress" ? "scheduled" : i.status) as IssueStatus;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });

  const drawSectionHeader = (status: IssueStatus, count: number) => {
    const palette = STATUS_PILL[status] ?? STATUS_PILL.reported;
    const barH = 7;
    if (y + barH + cardH > pageHeight - marginB) {
      doc.addPage();
      y = drawHeader(doc, ctx, pageWidth, marginL);
    }
    doc.setFillColor(...palette.bg);
    doc.setDrawColor(...palette.bg);
    (doc as unknown as { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void })
      .roundedRect(marginL, y, usableW, barH, 1.2, 1.2, "F");
    // Status accent bar on the left edge
    doc.setFillColor(...palette.text);
    doc.rect(marginL, y, 1.4, barH, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...palette.text);
    doc.text(STATUS_LABELS[status] ?? status, marginL + 4, y + barH - 2);
    const countText = `${count} ${count === 1 ? "issue" : "issues"}`;
    const cw = doc.getTextWidth(countText);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    doc.text(countText, marginL + usableW - cw - 3, y + barH - 2);
    y += barH + 2;
  };

  let cardIdx = 0;
  STATUS_ORDER.forEach((status) => {
    const list = groups.get(status);
    if (!list || list.length === 0) return;
    drawSectionHeader(status, list.length);

    list.forEach((issue) => {
      // When "Include notes" is on, expand the card vertically so the full
      // description fits inside the tile (rather than as a block beneath it).
      const descLineH = descSize * 0.42;
      // Description wrap width — leave a safety gutter before the meta column
      // so wrapped lines never bleed into Category/Property/etc.
      const descWrapW = titleW - 2;
      let descLines: string[] = [];
      if (issue.description) {
        // IMPORTANT: set the exact font + size we'll render with BEFORE we
        // measure, otherwise splitTextToSize uses stale state from the
        // previous card (bold/metaSize) and lines overflow.
        doc.setFont(PDF_FONT, "normal");
        doc.setFontSize(descSize);
        descLines = doc.splitTextToSize(issue.description, descWrapW);
        if (!ctx.includeNotes) {
          // Cap to whatever fits in the standard card so layout stays compact.
          const headerOffset = titleSize * 0.42 * 2 + 1.5 + 7; // title + pills
          const room = cardH - cardPad * 2 - headerOffset;
          descLines = descLines.slice(0, Math.max(0, Math.floor(room / descLineH)));
        }
      }
      const headerStack = titleSize * 0.42 * 2 + 1.5 + 7;
      const neededInner = headerStack + descLines.length * descLineH;
      const dynamicCardH = Math.max(cardH, neededInner + cardPad * 2);

      // Page break
      if (y + dynamicCardH > pageHeight - marginB) {
        doc.addPage();
        y = drawHeader(doc, ctx, pageWidth, marginL);
        drawSectionHeader(status, list.length);
      }

      // Row background (alternating) + border
      if (cardIdx % 2 === 1) {
        doc.setFillColor(250, 249, 245);
        doc.rect(marginL, y, usableW, dynamicCardH, "F");
      }
      doc.setDrawColor(225, 223, 217);
      doc.setLineWidth(0.2);
      doc.rect(marginL, y, usableW, dynamicCardH);

      // Status accent stripe (matches list-view colour coding)
      const accent = STATUS_PILL[issue.status] ?? STATUS_PILL.reported;
      doc.setFillColor(...accent.text);
      doc.rect(marginL, y, 1.2, dynamicCardH, "F");

      // Photo
      drawPhoto(issue, marginL + cardPad, y + cardPad);

      // Title + pills (middle column)
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(titleSize);
      doc.setTextColor(28, 29, 32);
      const titleLines = doc.splitTextToSize(issue.title, descWrapW).slice(0, 2);
      let ty = y + cardPad + titleSize * 0.35 + 1;
      const titleLineH = titleSize * 0.42;
      doc.text(titleLines, titleX, ty);
      ty += titleLines.length * titleLineH + 1.5;

      // Pills row: status + priority
      const statusPill = STATUS_PILL[issue.status] ?? STATUS_PILL.reported;
      const priorityPill = PRIORITY_PILL[issue.priority] ?? PRIORITY_PILL.medium;
      const sw = drawPill(STATUS_LABELS[issue.status] ?? issue.status, titleX, ty + 2, statusPill);
      drawPill(PRIORITY_LABELS[issue.priority] ?? issue.priority, titleX + sw + 1.5, ty + 2, priorityPill);
      ty += 7;

      if (descLines.length > 0) {
        doc.setFont(PDF_FONT, "normal");
        doc.setFontSize(descSize);
        doc.setTextColor(95, 95, 95);
        doc.text(descLines, titleX, ty);
      }

      // Meta column (label/value pairs) — status/priority removed since they're now pills
      const metaPairs: Array<[string, string]> = [
        ["Category", issue.category ?? "—"],
        ["Property", issue.property_name ?? "—"],
      ];
      if (issue.location_detail) metaPairs.push(["Location", issue.location_detail]);
      metaPairs.push(["Reported", format(parseISO(issue.created_at), "dd MMM yyyy")]);
      if (issue.assignee_name) metaPairs.push(["Assigned", firstName(issue.assignee_name)]);
      if (issue.status === "resolved" && issue.resolved_at) {
        metaPairs.push(["Resolved", format(parseISO(issue.resolved_at), "dd MMM yyyy")]);
      } else {
        metaPairs.push(["Age", `${ageDays(issue.created_at)}d`]);
      }

      const metaLineH = metaSize * 0.45;
      const maxMetaLines = Math.floor((dynamicCardH - cardPad * 2) / metaLineH);
      const visiblePairs = metaPairs.slice(0, maxMetaLines);
      const labelX = metaColX;
      const valueX = metaColX + 16;
      const valueW = metaW - 16;
      let my = y + cardPad + metaSize * 0.35 + 1;
      doc.setFontSize(metaSize);
      visiblePairs.forEach(([label, value]) => {
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(135, 135, 135);
        doc.text(label, labelX, my);
        doc.setFont(PDF_FONT, "bold");
        const v = doc.splitTextToSize(value, valueW)[0] ?? value;
        if (label === "Property" && issue.property_name) {
          const palette = getPropertyPalette(issue.property_name);
          const padX = 1.5;
          const w = Math.min(valueW, doc.getTextWidth(v) + padX * 2);
          const h = metaSize * 0.5;
          doc.setFillColor(...palette.bg);
          (doc as unknown as { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void })
            .roundedRect(valueX - padX, my - h + 0.8, w, h, 0.6, 0.6, "F");
          doc.setTextColor(...palette.text);
        } else {
          doc.setTextColor(40, 40, 40);
        }
        doc.text(v, valueX, my);
        my += metaLineH;
      });

      y += dynamicCardH + 2;
      cardIdx += 1;
    });

    y += 2; // breathing room between status groups
  });

  return doc;
}

// ──────────────────────────────────────────────────────────────────────────────
// Auto-fit (mirrors planned export)
// ──────────────────────────────────────────────────────────────────────────────

function lastPageFillRatio(doc: jsPDF): number {
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableTop = 26;
  const bottomPad = 14;
  const usable = pageHeight - usableTop - bottomPad;
  const used = Math.max(0, finalY - usableTop);
  return Math.min(1, used / usable);
}

function autoFitDoc(builder: (scale: number) => jsPDF): jsPDF {
  const SPARSE_THRESHOLD = 0.25;
  const SCALES = [1.0, 0.95, 0.9, 0.85, 0.8];

  let doc = builder(SCALES[0]);
  let pages = doc.getNumberOfPages();
  if (pages <= 1) return doc;

  let fill = lastPageFillRatio(doc);
  if (fill >= SPARSE_THRESHOLD) return doc;

  for (let i = 1; i < SCALES.length; i++) {
    const candidate = builder(SCALES[i]);
    const candidatePages = candidate.getNumberOfPages();
    if (candidatePages < pages) {
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

export async function exportRepairsPDF(ctx: RepairsExportContext): Promise<void> {
  if (ctx.issues.length === 0) {
    toast.error("Nothing to export — no issues match the current filters");
    return;
  }

  const toastId = toast.loading(
    ctx.viewMode === "tile" ? "Preparing PDF (loading photos)…" : "Preparing PDF…",
  );

  try {
    const fonts = await loadPdfFontData();
    let doc: jsPDF;
    if (ctx.viewMode === "list") {
      doc = autoFitDoc((scale) => buildListDoc(ctx, scale, fonts));
    } else {
      const images = await preloadImages(ctx.issues);
      doc = autoFitDoc((scale) => buildTileDoc(ctx, scale, images, fonts));
    }
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    drawFooter(doc, pageWidth, pageHeight);
    doc.save(`Repairs Report (${format(new Date(), "dd MMM yyyy")}).pdf`);
    toast.success("PDF downloaded", { id: toastId });
  } catch (err) {
    console.error("Repairs PDF export failed", err);
    toast.error("Failed to generate PDF", { id: toastId });
  }
}
