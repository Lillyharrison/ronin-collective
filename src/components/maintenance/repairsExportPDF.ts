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
      const box = photoBox;
      const imgRatio = img.width / img.height;
      let drawW = box, drawH = box, sx = ox, sy = oy;
      if (imgRatio > 1) {
        drawH = box;
        drawW = box * imgRatio;
        sx = ox - (drawW - box) / 2;
      } else {
        drawW = box;
        drawH = box / imgRatio;
        sy = oy - (drawH - box) / 2;
      }
      const internal = doc as unknown as {
        saveGraphicsState?: () => void;
        restoreGraphicsState?: () => void;
      };
      internal.saveGraphicsState?.();
      try {
        (doc as unknown as { rect: (x: number, y: number, w: number, h: number) => void }).rect(ox, oy, box, box);
        (doc as unknown as { clip: () => void; discardPath?: () => void }).clip();
        (doc as unknown as { discardPath?: () => void }).discardPath?.();
      } catch { /* noop */ }
      try {
        doc.addImage(img.dataUrl, "JPEG", sx, sy, drawW, drawH, undefined, "FAST");
      } catch { /* noop */ }
      internal.restoreGraphicsState?.();
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.rect(ox, oy, box, box);
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

  ctx.issues.forEach((issue, idx) => {
    // Page break
    if (y + cardH > pageHeight - marginB) {
      doc.addPage();
      y = drawHeader(doc, ctx, pageWidth, marginL);
    }

    // Row background (alternating) + border
    if (idx % 2 === 1) {
      doc.setFillColor(250, 249, 245);
      doc.rect(marginL, y, usableW, cardH, "F");
    }
    doc.setDrawColor(225, 223, 217);
    doc.setLineWidth(0.2);
    doc.rect(marginL, y, usableW, cardH);

    // Photo
    drawPhoto(issue, marginL + cardPad, y + cardPad);

    // Title + description (middle column)
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(titleSize);
    doc.setTextColor(28, 29, 32);
    const titleLines = doc.splitTextToSize(issue.title, titleW).slice(0, 2);
    let ty = y + cardPad + titleSize * 0.35 + 1;
    const titleLineH = titleSize * 0.42;
    doc.text(titleLines, titleX, ty);
    ty += titleLines.length * titleLineH + 0.5;

    if (issue.description) {
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(descSize);
      doc.setTextColor(95, 95, 95);
      const descLineH = descSize * 0.42;
      const remaining = (y + cardH - cardPad) - ty;
      const maxLines = Math.max(0, Math.floor(remaining / descLineH));
      if (maxLines > 0) {
        const descLines = doc.splitTextToSize(issue.description, titleW).slice(0, maxLines);
        doc.text(descLines, titleX, ty);
      }
    }

    // Meta column (label/value pairs, two columns of typography)
    const metaPairs: Array<[string, string]> = [
      ["Status", STATUS_LABELS[issue.status] ?? issue.status],
      ["Priority", PRIORITY_LABELS[issue.priority] ?? issue.priority],
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
    const maxMetaLines = Math.floor((cardH - cardPad * 2) / metaLineH);
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
      doc.setTextColor(40, 40, 40);
      const v = doc.splitTextToSize(value, valueW)[0] ?? value;
      doc.text(v, valueX, my);
      my += metaLineH;
    });

    y += cardH + 2;

    // Extended notes block (full width, beneath the card) when requested.
    if (ctx.includeNotes && issue.description && issue.description.trim()) {
      const noteSize = Math.max(7.2, 8.4 * scale);
      const noteLineH = noteSize * 0.45;
      const wrapW = usableW - 6;
      const noteLines = doc.splitTextToSize(`Notes: ${issue.description.trim()}`, wrapW);
      const blockH = noteLines.length * noteLineH + 4;

      // Page break if the notes block won't fit
      if (y + blockH > pageHeight - marginB) {
        doc.addPage();
        y = drawHeader(doc, ctx, pageWidth, marginL);
      }
      doc.setFillColor(252, 251, 247);
      doc.setDrawColor(225, 223, 217);
      doc.setLineWidth(0.2);
      doc.rect(marginL, y, usableW, blockH, "FD");
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(noteSize);
      doc.setTextColor(75, 75, 75);
      doc.text(noteLines, marginL + 3, y + noteLineH + 0.5);
      y += blockH + 2;
    }
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
    doc.save(`repairs-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF downloaded", { id: toastId });
  } catch (err) {
    console.error("Repairs PDF export failed", err);
    toast.error("Failed to generate PDF", { id: toastId });
  }
}
