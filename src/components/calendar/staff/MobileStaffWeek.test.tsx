import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileStaffWeek, type MobileStaffWeekProps } from "./MobileStaffWeek";

const props: MobileStaffWeekProps = {
  weekDays: [new Date(2026, 9, 5)],
  staffToShow: [{ id: "staff", full_name: "Carmen", job_title: "Housekeeper", avatar_url: null, department: null }],
  displayShifts: [{ key: "shift", staff_id: "staff", property_id: "property", schedule_id: null, concrete_id: "shift", shift_date: "2026-10-05", start_time: "07:00", end_time: "16:00", status: "scheduled", notes: "Main house", is_virtual: false, is_leave: false }],
  properties: [{ id: "property", name: "Rockingham" }], loading: false, canEdit: false,
  onCellClick: vi.fn(), onOpenStaffScheduleManager: vi.fn(), onShiftDoubleClick: vi.fn(),
};

describe("phone schedule editing access", () => {
  it("read-only staff can inspect shifts without editing them", () => {
    render(<MobileStaffWeek {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Rockingham/ }));
    expect(screen.queryByRole("button", { name: "Edit shift" })).toBeNull();
    expect(props.onShiftDoubleClick).not.toHaveBeenCalled();
  });
  it("full-access users can open the existing shift editor", () => {
    render(<MobileStaffWeek {...props} canEdit />);
    fireEvent.click(screen.getByTitle("Rockingham 7:00am–4:00pm"));
    fireEvent.click(screen.getByRole("button", { name: "Edit shift" }));
    expect(props.onShiftDoubleClick).toHaveBeenCalledWith(props.displayShifts[0]);
  });
});