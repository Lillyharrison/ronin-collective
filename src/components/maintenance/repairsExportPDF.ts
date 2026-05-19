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

const STATUS_LABELS: Record<IssueStatus, string> = {
  reported:    "Reported",
  approved:    "Approved",
  
  scheduled:   "Scheduled",
  in_progress: "In Progress",
  resolved:    "Resolved",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high:   "High",
  medium: "Medium",
  low:    "Low",
};

// Soft RGB pairs for status pills (background, text). Mirrors on-screen palette.
const STATUS_PILL: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
  reported:    { bg: [254, 226, 226], text: [153, 27, 27] },   // red
  approved:    { bg: [219, 234, 254], text: [30, 64, 175] },   // blue
  assigned:    { bg: [237, 233, 254], text: [91, 33, 182] },   // purple
  scheduled:   { bg: [254, 243, 199], text: [146, 64, 14] },   // amber
  in_progress: { bg: [255, 237, 213], text: [154, 52, 18] },   // orange
  resolved:    { bg: [209, 250, 229], text: [6, 95, 70] },     // emerald
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
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > THUMB_MAX_PX ? THUMB_MAX_PX / longest : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.78), width: w, height: h };
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
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(28, 29, 32);
  doc.text("Repairs", marginL, 14);

  const parts: string[] = [];
  parts.push(`${ctx.issues.length} ${ctx.issues.length === 1 ? "issue" : "issues"}`);
  parts.push(`Property: ${ctx.filters.propertyName ?? "All"}`);
  if (ctx.filters.category) parts.push(`Category: ${ctx.filters.category}`);
  if (ctx.filters.priority) parts.push(`Priority: ${PRIORITY_LABELS[ctx.filters.priority] ?? ctx.filters.priority}`);
  if (ctx.filters.search)   parts.push(`Search: "${ctx.filters.search}"`);

  doc.setFont("helvetica", "normal");
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
  doc.setFont("helvetica", "normal");
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

function buildListDoc(ctx: RepairsExportContext, scale: number): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 297
  const marginL = 10;
  const marginR = 10;
  const startY = drawHeader(doc, ctx, pageWidth, marginL);

  const head = [["Title", "Status", "Priority", "Category", "Property", "Location", "Reported", "Assigned", "Age"]];
  const body = ctx.issues.map((i) => [
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
      const issue = ctx.issues[data.row.index];
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
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210
  const marginL = 12;
  const marginR = 12;
  const startY = drawHeader(doc, ctx, pageWidth, marginL);

  // 3 columns: photo (square) | title+description (wide) | meta (mono)
  const usable = pageWidth - marginL - marginR; // 186
  const photoW = THUMB_MM;                       // 28
  const metaW  = 64;
  const titleW = usable - photoW - metaW;        // 94

  const body = ctx.issues.map((i) => {
    const left = ""; // image is drawn in didDrawCell
    const middle = i.description ? `${i.title}\n${i.description}` : i.title;
    const meta: string[] = [];
    meta.push(`Status:    ${STATUS_LABELS[i.status] ?? i.status}`);
    meta.push(`Priority:  ${PRIORITY_LABELS[i.priority] ?? i.priority}`);
    meta.push(`Category:  ${i.category ?? "—"}`);
    meta.push(`Property:  ${i.property_name ?? "—"}`);
    if (i.location_detail) meta.push(`Location:  ${i.location_detail}`);
    meta.push(`Reported:  ${format(parseISO(i.created_at), "dd MMM yyyy")}`);
    if (i.assignee_name) meta.push(`Assigned:  ${firstName(i.assignee_name)}`);
    if (i.status === "resolved" && i.resolved_at) {
      meta.push(`Resolved:  ${format(parseISO(i.resolved_at), "dd MMM yyyy")}`);
    } else {
      meta.push(`Age:       ${ageDays(i.created_at)} days`);
    }
    return [left, middle, meta.join("\n")];
  });

  // Row height needs to accommodate the photo thumbnail comfortably.
  const rowMin = THUMB_MM + 4; // 32mm

  autoTable(doc, {
    startY,
    head: [],
    body,
    theme: "plain",
    bodyStyles: {
      fontSize: 9 * scale,
      cellPadding: { top: 3 * scale, bottom: 3 * scale, left: 3 * scale, right: 3 * scale },
      overflow: "linebreak",
      valign: "top",
      lineWidth: 0.2,
      lineColor: [220, 220, 220],
      textColor: [40, 40, 40],
      fillColor: [255, 255, 255],
      minCellHeight: rowMin,
    },
    columnStyles: {
      0: { cellWidth: photoW, minCellHeight: rowMin },
      1: { cellWidth: titleW, fontStyle: "bold", fontSize: 10 * scale },
      2: { cellWidth: metaW, font: "courier", fontSize: 8 * scale, textColor: [70, 70, 70] },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (data.row.index % 2 === 1) {
        data.cell.styles.fillColor = [250, 249, 245];
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const issue = ctx.issues[data.row.index];
      if (!issue) return;
      const img = images.get(issue.id);
      const cx = data.cell.x;
      const cy = data.cell.y;
      const cw = data.cell.width;
      const ch = data.cell.height;
      // Draw centered square thumbnail (THUMB_MM mm, capped to cell)
      const box = Math.min(THUMB_MM, cw - 2, ch - 2);
      const ox = cx + (cw - box) / 2;
      const oy = cy + (ch - box) / 2;
      if (img) {
        // Cover-fit: scale to fill the square box, centered crop
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
        // Use a clipping path so the cover-cropped image stays within the box
        const internal = doc as unknown as {
          internal: { write: (s: string) => void };
          saveGraphicsState?: () => void;
          restoreGraphicsState?: () => void;
        };
        if (internal.saveGraphicsState) internal.saveGraphicsState();
        // Clip rectangle (mm → user units identity here; pdf uses mm)
        // Use jsPDF's rect+clip via the lower-level path API
        try {
          (doc as unknown as { rect: (x: number, y: number, w: number, h: number, style?: string) => void }).rect(ox, oy, box, box);
          // Apply clip
          (doc as unknown as { clip: () => void; discardPath?: () => void }).clip();
          (doc as unknown as { discardPath?: () => void }).discardPath?.();
        } catch {
          /* Fallback: no clipping — image may slightly overflow */
        }
        try {
          doc.addImage(img.dataUrl, "JPEG", sx, sy, drawW, drawH, undefined, "FAST");
        } catch {
          /* swallow image render errors so PDF still produces */
        }
        if (internal.restoreGraphicsState) internal.restoreGraphicsState();
        // Subtle border
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.rect(ox, oy, box, box);
      } else {
        // Placeholder square
        doc.setFillColor(245, 244, 240);
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.rect(ox, oy, box, box, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text("No photo", ox + box / 2, oy + box / 2 + 1, { align: "center" });
      }
    },
    margin: { left: marginL, right: marginR, bottom: 14 },
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
    let doc: jsPDF;
    if (ctx.viewMode === "list") {
      doc = autoFitDoc((scale) => buildListDoc(ctx, scale));
    } else {
      const images = await preloadImages(ctx.issues);
      doc = autoFitDoc((scale) => buildTileDoc(ctx, scale, images));
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
