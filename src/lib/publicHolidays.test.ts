import { describe, it, expect } from "vitest";
import { withPublicHolidays } from "./publicHolidays";

const base = { reason: null, reviewed_by: null, reviewed_at: null, created_by: null };
const carmenThanksgiving = { ...base, id: "x", staff_id: "carmen", start_date: "2026-11-26", end_date: "2026-11-26", leave_type: "public_holiday", status: "approved" };
const week: [string, string] = ["2026-11-23", "2026-11-29"];

describe("public holidays from the schedule", () => {
  it("a holiday logged for one person is given to everyone, without duplicating it", () => {
    const r = withPublicHolidays([carmenThanksgiving], [{ id: "carmen" }, { id: "ana" }], ...week);
    expect(r.filter(l => l.staff_id === "carmen")).toHaveLength(1);
    expect(r.filter(l => l.staff_id === "ana" && l.start_date === "2026-11-26" && l.leave_type === "public_holiday")).toHaveLength(1);
  });
  it("other leave types and unapproved holidays are not shared", () => {
    const vac = { ...carmenThanksgiving, leave_type: "vacation" };
    const pending = { ...carmenThanksgiving, status: "pending" };
    expect(withPublicHolidays([vac, pending], [{ id: "carmen" }, { id: "ana" }], ...week)).toHaveLength(2);
  });
  it("skips people who start after the holiday", () => {
    expect(withPublicHolidays([carmenThanksgiving], [{ id: "carmen" }, { id: "new", start_date: "2026-12-01" }], ...week)).toHaveLength(1);
  });
});
