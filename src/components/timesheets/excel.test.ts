import { describe, it, expect, vi } from "vitest";
vi.mock("./api", () => ({ db: {}, result: vi.fn() }));
import { buildWorkbook, fileName } from "./excel";
import type { Timesheet } from "./logic";
const sheet = {
  payee_name: "Mercy",
  period_start: "2026-10-01",
  version: 2,
  hourly_rate: 20,
  currency: "USD",
  rounding_minutes: 15,
  total_hours: 8.25,
  total_amount: 170,
  lines: [
    {
      kind: "visit",
      date: "2026-10-01",
      time_text: "8:07am - 4:20pm",
      hours: 8.25,
      rate: 20,
      amount: 165,
      notes: "Weekly visit",
    },
    { kind: "expense", date: "2026-10-02", description: "Taxi", amount: 10 },
    { kind: "adjustment", date: null, description: "Correction", amount: -5 },
  ],
  ssn: "DO NOT EXPORT",
  address: "DO NOT EXPORT",
} as unknown as Timesheet;
describe("Lilly timesheet Excel", () => {
  it("has exact headings, bold pattern and real dates", () => {
    const ws = buildWorkbook(sheet, "Profile name").getWorksheet("Time sheet");
    expect(ws?.getCell("A1").value).toBe("Mercy");
    expect(ws?.getCell("A1").font.bold).toBe(true);
    expect(ws?.getCell("A3").font.bold).toBe(false);
    expect(ws?.getCell("B3").font.bold).toBe(true);
    expect(ws?.getCell("F3").value).toBe("Notes");
    expect(ws?.getCell("A4").value).toBeInstanceOf(Date);
    expect(ws?.getCell("A4").numFmt).toBe("mm-dd-yy");
  });
  it("stores formulas and cached amounts and subtotal", () => {
    const ws = buildWorkbook(sheet, "Profile name").getWorksheet("Time sheet");
    expect(ws?.getCell("E4").value).toEqual({ formula: "C4*D4", result: 165 });
    expect(ws?.getCell("C7").value).toEqual({
      formula: "SUBTOTAL(109,C4:C6)",
      result: 8.25,
    });
    expect(ws?.getCell("E7").value).toEqual({
      formula: "SUBTOTAL(109,E4:E6)",
      result: 170,
    });
    expect(ws?.getCell("B5").value).toBe("Expense: Taxi");
    expect(ws?.getCell("C5").value).toBeNull();
    expect(ws?.getCell("E6").value).toBe(-5);
  });
  it("has correction, rounding, currency and safe name only", async () => {
    const book = buildWorkbook(sheet, "Profile name");
    const ws = book.getWorksheet("Time sheet");
    expect(ws?.getCell("A2").value).toContain(
      "Corrected version 2 (replaces version 1)",
    );
    expect(ws?.getCell("A8").value).toBe(
      "Hours rounded to the nearest 15 minutes.",
    );
    expect(ws?.getCell("E4").numFmt).toContain("$");
    expect(fileName(sheet, "Profile name")).toBe(
      "Mercy timesheet 2026-10 v2.xlsx",
    );
    expect(JSON.stringify(book.model)).not.toContain("DO NOT EXPORT");
    const bytes = await book.xlsx.writeBuffer();
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
  it.each([
    ["EUR", "€"],
    ["GBP", "£"],
  ])("uses %s accounting symbol", (currency, symbol) =>
    expect(
      buildWorkbook({ ...sheet, currency }, "name")
        .getWorksheet("Time sheet")
        ?.getCell("E4").numFmt,
    ).toContain(symbol),
  );
});
