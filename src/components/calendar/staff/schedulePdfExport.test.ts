import { describe, it, expect } from "vitest";
import { leaveLabel } from "./schedulePdfExport";
import type { DisplayShift } from "./types";

const base = {
  id: "s1",
  staff_id: "p1",
  shift_date: "2026-11-26",
  property_id: null,
  start_time: null,
  end_time: null,
  notes: null,
  status: "scheduled",
  is_leave: true,
} as unknown as DisplayShift;

describe("leaveLabel (PDF export)", () => {
  it("shows the specific leave type, not a generic 'Leave'", () => {
    expect(leaveLabel({ ...base, leave_type: "public_holiday" })).toBe("Public Holiday");
    expect(leaveLabel({ ...base, leave_type: "vacation" })).toBe("Vacation");
    expect(leaveLabel({ ...base, leave_type: "sick" })).toBe("Sick Leave");
  });

  it("falls back to 'Other' for unknown or missing leave types", () => {
    expect(leaveLabel({ ...base, leave_type: undefined })).toBe("Other");
    expect(leaveLabel({ ...base, leave_type: "nonsense" })).toBe("Other");
  });
});
