/**
 * libraryExportPDF — multi-item PDF for the Order Library.
 *
 * Produces a portrait A4 document with a 2-column card grid. Each card
 * has a square image area (object-contain to preserve packaging) and a
 * structured text block listing every field on the item.
 *
 * True PDF — not a print stylesheet. Uses jsPDF + embedded Inter font so
 * the output looks identical across devices.
 */
import jsPDF from "jspdf";
import { format } from "date-fns";
import { toast } from "sonner";
import type { OrderLibraryItem } from "@/hooks/useOrderLibrary";
import interRegularUrl from "@/assets/fonts/Inter-Regular.ttf?url";
import interSemiBoldUrl from "@/assets/fonts/Inter-SemiBold.ttf?url";

// ── Font embedding ──────────────────────────────────────────────────────────
const PDF_FONT = "InterPdf";
let fontDataPromise: Promise<{ regular: string; semibold: string }> | null = null;

async function fontToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font load failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function loadFonts() {
  fontDataPromise ??= Promise.all([
    fontToBase64(interRegularUrl),
    fontToBase64(interSemiBoldUrl),
  ]).then(([regular, semibold]) => ({ regular, semibold }));
  return fontDataPromise;
}

function installFonts(doc: jsPDF, fonts: { regular: string; semibold: string }) {
  doc.addFileToVFS("Inter-Regular.ttf", fonts.regular);
  doc.addFont("Inter-Regular.ttf", PDF_FONT, "normal");
  doc.addFileToVFS("Inter-SemiBold.ttf", fonts.semibold);
  doc.addFont("Inter-SemiBold.ttf", PDF_FONT, "bold");
  doc.setFont(PDF_FONT, "normal");
}

// ── Image preload (object-contain, square canvas) ───────────────────────────
interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
}

const IMG_PX = 600;

async function fetchImageAsContainThumb(url: string): Promise<PreparedImage | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = IMG_PX;
    canvas.height = IMG_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // White background so the JPEG (no alpha) shows a clean card.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, IMG_PX, IMG_PX);
    // object-contain: scale to fit inside square, centered.
    const scale = Math.min(IMG_PX / bitmap.width, IMG_PX / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    const dx = (IMG_PX - w) / 2;
    const dy = (IMG_PX - h) / 2;
    ctx.drawImage(bitmap, dx, dy, w, h);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: IMG_PX, height: IMG_PX };
  } catch {
    return null;
  }
}

async function preloadImages(items: OrderLibraryItem[]): Promise<Map<string, PreparedImage>> {
  const map = new Map<string, PreparedImage>();
  const queue = [...items];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length > 0) {
      const it = queue.shift();
      if (!it || !it.image_url) continue;
      const img = await fetchImageAsContainThumb(it.image_url);
      if (img) map.set(it.id, img);
    }
  });
  await Promise.all(workers);
  return map;
}

// ── Category labels ─────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  food: "Food & Drink",
  cleaning: "Cleaning",
  supplies: "Supplies",
  personal: "Personal Care",
  laundry: "Laundry",
  tech: "Tech & Electronics",
  other: "Other",
};

// Soft RGB pairs for category accent strip + chip.
const CATEGORY_COLOR: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
  food:     { bg: [254, 226, 226], text: [153, 27, 27] },
  cleaning: { bg: [219, 234, 254], text: [30, 64, 175] },
  supplies: { bg: [254, 243, 199], text: [146, 64, 14] },
  personal: { bg: [252, 231, 243], text: [157, 23, 77] },
  laundry:  { bg: [207, 250, 254], text: [22, 78, 99] },
  tech:     { bg: [237, 233, 254], text: [91, 33, 182] },
  other:    { bg: [229, 231, 235], text: [55, 65, 81] },
};

// ── Layout constants ────────────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 12;
const MARGIN_R = 12;
const MARGIN_TOP = 26;
const MARGIN_BOTTOM = 14;
const COL_GAP = 8;
const ROW_GAP = 8;

const COLS = 2;
const CARD_W = (PAGE_W - MARGIN_L - MARGIN_R - COL_GAP * (COLS - 1)) / COLS; // 89
const IMG_BOX = 60;   // mm — image area height
const TEXT_BOX = 58;  // mm — text area height
const CARD_H = IMG_BOX + TEXT_BOX; // 118
const ROWS = Math.floor((PAGE_H - MARGIN_TOP - MARGIN_BOTTOM + ROW_GAP) / (CARD_H + ROW_GAP)); // 2

// ── Header / footer ─────────────────────────────────────────────────────────
function drawHeader(doc: jsPDF, count: number) {
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(15);
  doc.setTextColor(28, 29, 32);
  doc.text("Order Library", MARGIN_L, 14);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`${count} ${count === 1 ? "item" : "items"}`, MARGIN_L, 19.5);

  const stamp = `Generated ${format(new Date(), "dd MMM yyyy, HH:mm")}`;
  const w = doc.getTextWidth(stamp);
  doc.text(stamp, PAGE_W - MARGIN_R - w, 19.5);

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_L, 22, PAGE_W - MARGIN_R, 22);
}

function drawFooter(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const text = `Page ${i} of ${total}`;
    const w = doc.getTextWidth(text);
    doc.text(text, PAGE_W - MARGIN_R - w, PAGE_H - 6);
    doc.text("Ronin · Order Library", MARGIN_L, PAGE_H - 6);
  }
}

// ── Card rendering ──────────────────────────────────────────────────────────
function drawCard(
  doc: jsPDF,
  item: OrderLibraryItem,
  img: PreparedImage | undefined,
  x: number,
  y: number,
) {
  // Card frame
  doc.setDrawColor(225, 220, 210);
  doc.setLineWidth(0.25);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, CARD_W, CARD_H, 2.5, 2.5, "FD");

  // Image area background
  doc.setFillColor(248, 246, 240);
  doc.roundedRect(x, y, CARD_W, IMG_BOX, 2.5, 2.5, "F");
  // square off the bottom of the image area
  doc.setFillColor(248, 246, 240);
  doc.rect(x, y + IMG_BOX - 2.5, CARD_W, 2.5, "F");

  // Image — square, centered, contained
  const imgSide = IMG_BOX - 8;
  const imgX = x + (CARD_W - imgSide) / 2;
  const imgY = y + 4;
  if (img) {
    try {
      doc.addImage(img.dataUrl, "JPEG", imgX, imgY, imgSide, imgSide, undefined, "FAST");
    } catch {
      // ignore — leave blank
    }
  } else {
    // Placeholder: muted box with light label
    doc.setFillColor(238, 234, 224);
    doc.roundedRect(imgX, imgY, imgSide, imgSide, 2, 2, "F");
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 150, 130);
    const label = "No image";
    const w = doc.getTextWidth(label);
    doc.text(label, imgX + imgSide / 2 - w / 2, imgY + imgSide / 2);
  }

  // Divider between image and text area
  doc.setDrawColor(225, 220, 210);
  doc.setLineWidth(0.2);
  doc.line(x, y + IMG_BOX, x + CARD_W, y + IMG_BOX);

  // ── Text area ──
  const pad = 4;
  const tx = x + pad;
  const tw = CARD_W - pad * 2;
  let ty = y + IMG_BOX + 5;

  // Name (bold) — wrapped to 2 lines
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(10);
  doc.setTextColor(28, 29, 32);
  const nameLines = doc.splitTextToSize(item.name, tw) as string[];
  const shownName = nameLines.slice(0, 2);
  doc.text(shownName, tx, ty);
  ty += shownName.length * 4.2 + 1;

  // Category chip + status chip + sub policy chip
  const chips: Array<{ label: string; bg: [number, number, number]; text: [number, number, number] }> = [];
  chips.push({
    label: CATEGORY_LABELS[item.category] ?? item.category,
    bg: (CATEGORY_COLOR[item.category] ?? CATEGORY_COLOR.other).bg,
    text: (CATEGORY_COLOR[item.category] ?? CATEGORY_COLOR.other).text,
  });
  if (item.status === "no_longer_preferred") {
    chips.push({ label: "Deprecated", bg: [235, 232, 226], text: [110, 100, 85] });
  } else {
    chips.push({ label: "Preferred", bg: [209, 250, 229], text: [6, 95, 70] });
  }
  chips.push(
    item.substitutions_allowed
      ? { label: "Sub OK", bg: [219, 234, 254], text: [30, 64, 175] }
      : { label: "No sub", bg: [254, 243, 199], text: [146, 64, 14] },
  );

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(6.5);
  let cx = tx;
  const chipPadH = 1.6;
  const chipH = 3.6;
  for (const chip of chips) {
    const w = doc.getTextWidth(chip.label) + chipPadH * 2;
    if (cx + w > tx + tw) break; // skip overflow
    doc.setFillColor(...chip.bg);
    doc.roundedRect(cx, ty, w, chipH, 1, 1, "F");
    doc.setTextColor(...chip.text);
    doc.text(chip.label, cx + chipPadH, ty + chipH - 1.1);
    cx += w + 1.5;
  }
  ty += chipH + 2.8;

  // Field rows
  const fields: Array<[string, string]> = [];
  if (item.default_quantity) fields.push(["Qty", item.default_quantity]);
  if (item.size) fields.push(["Size", item.size]);
  if (item.purchase) fields.push(["Where", item.purchase]);
  if (item.search_aliases?.length) fields.push(["Also", item.search_aliases.join(", ")]);
  if (item.website_url) fields.push(["Link", item.website_url]);
  if (item.notes) fields.push(["Notes", item.notes]);

  const labelW = 12;
  const valueW = tw - labelW - 1;
  const maxBottom = y + CARD_H - pad;

  for (const [label, value] of fields) {
    if (ty > maxBottom - 3) break;
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(140, 130, 110);
    doc.text(label.toUpperCase(), tx, ty);

    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(value, valueW) as string[];
    // Cap per-field lines so notes can't push other fields off the card.
    const cap = label === "Notes" ? 4 : label === "Link" ? 2 : 2;
    const shown = lines.slice(0, cap);
    doc.text(shown, tx + labelW, ty);
    ty += shown.length * 3.2 + 1.6;
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────
export async function exportLibraryItemsPDF(items: OrderLibraryItem[]): Promise<void> {
  if (items.length === 0) {
    toast.error("Select at least one item to export.");
    return;
  }
  const toastId = toast.loading(
    `Preparing PDF (${items.length} ${items.length === 1 ? "item" : "items"})…`,
  );
  try {
    const [fonts, images] = await Promise.all([loadFonts(), preloadImages(items)]);
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    installFonts(doc, fonts);

    const perPage = COLS * ROWS;
    for (let i = 0; i < items.length; i++) {
      const pageIdx = Math.floor(i / perPage);
      const posOnPage = i % perPage;
      if (posOnPage === 0) {
        if (pageIdx > 0) doc.addPage();
        drawHeader(doc, items.length);
      }
      const col = posOnPage % COLS;
      const row = Math.floor(posOnPage / COLS);
      const x = MARGIN_L + col * (CARD_W + COL_GAP);
      const y = MARGIN_TOP + row * (CARD_H + ROW_GAP);
      drawCard(doc, items[i], images.get(items[i].id), x, y);
    }
    drawFooter(doc);

    const filename = `order-library-${format(new Date(), "yyyy-MM-dd-HHmm")}.pdf`;
    doc.save(filename);
    toast.success("PDF downloaded.", { id: toastId });
  } catch (err) {
    console.error("[libraryExportPDF] failed", err);
    toast.error("Could not generate PDF.", { id: toastId });
  }
}
