import ExcelJS from "exceljs";
import { db, result } from "./api";
import { monthName, type Timesheet } from "./logic";
export function fileName(t: Timesheet, name: string) {
  return `${(t.payee_name || name).replace(/[\\/:*?"<>|]/g, "")} timesheet ${t.period_start.slice(0, 7)}${t.version > 1 ? ` v${t.version}` : ""}.xlsx`;
}
export function buildWorkbook(t: Timesheet, name: string) {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Time sheet");
  ws.columns = [
    { width: 11 },
    { width: 18 },
    { width: 8 },
    { width: 10 },
    { width: 12 },
    { width: 28 },
  ];
  ws.getCell("A1").value = t.payee_name || name;
  ws.getCell("A1").font = { bold: true };
  ws.getCell("A2").value =
    monthName(t.period_start) +
    (t.version > 1
      ? ` — Corrected version ${t.version} (replaces version ${t.version - 1})`
      : "");
  ws.addRow([]);
  ["Date", "Time", "Hours", "Per hour", "Amount", "Notes"].forEach((h, i) => {
    ws.getCell(3, i + 1).value = h;
    ws.getCell(3, i + 1).font = { bold: i > 0 };
  });
  const symbol = t.currency === "GBP" ? "£" : t.currency === "EUR" ? "€" : "$";
  const accounting = `_("${symbol}"* #,##0.00_);_("${symbol}"* \\(#,##0.00\\);_("${symbol}"* "-"??_);_(@_)`;
  t.lines.forEach((line, i) => {
    const r = i + 4;
    if (line.date) {
      ws.getCell(r, 1).value = new Date(`${line.date}T00:00:00Z`);
      ws.getCell(r, 1).numFmt = "mm-dd-yy";
    }
    if (line.kind === "visit") {
      ws.getCell(r, 2).value = line.time_text || "";
      ws.getCell(r, 3).value = Number(line.hours || 0);
      ws.getCell(r, 4).value = Number(line.rate ?? t.hourly_rate);
      ws.getCell(r, 5).value = {
        formula: `C${r}*D${r}`,
        result: Number(line.amount),
      };
      ws.getCell(r, 6).value = line.notes || "";
      ws.getCell(r, 4).numFmt = accounting;
    } else {
      ws.getCell(r, 2).value =
        `${line.kind === "expense" ? "Expense" : "Adjustment"}: ${line.description || ""}`;
      ws.getCell(r, 5).value = Number(line.amount);
    }
    ws.getCell(r, 5).numFmt = accounting;
  });
  const last = t.lines.length + 3,
    r = last + 1;
  ws.getCell(r, 2).value = "Total";
  ws.getCell(r, 3).value = {
    formula: `SUBTOTAL(109,C4:C${last})`,
    result: Number(t.total_hours),
  };
  ws.getCell(r, 5).value = {
    formula: `SUBTOTAL(109,E4:E${last})`,
    result: Number(t.total_amount),
  };
  ws.getRow(r).font = { bold: true };
  ws.getCell(r, 5).numFmt = accounting;
  ws.getCell(r + 1, 1).value =
    `Hours rounded to the nearest ${t.rounding_minutes} minutes.`;
  return book;
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadSheet(t: Timesheet, name: string) {
  if (t.file_path) {
    const { data, error } = await db.storage
      .from("timesheets")
      .download(t.file_path);
    if (!error && data) {
      download(data, fileName(t, name));
      return true;
    }
  }
  const buffer = await buildWorkbook(t, name).xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  download(blob, fileName(t, name));
  const path = `${t.staff_id}/${t.period_start}-v${t.version}.xlsx`;
  try {
    await result(
      db.storage
        .from("timesheets")
        .upload(path, blob, { upsert: true, contentType: blob.type }),
    );
    await result(
      db.rpc("set_timesheet_file", { _timesheet_id: t.id, _path: path }),
    );
    return true;
  } catch {
    return false;
  }
}
