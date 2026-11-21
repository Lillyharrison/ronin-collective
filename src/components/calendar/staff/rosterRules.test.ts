import { describe, expect, it } from "vitest";
import { eachDayOfInterval, parseISO } from "date-fns";
import { rosterPeople, schedulablePeople, scheduleDateVisible } from "./utils";
import { withPublicHolidays } from "@/lib/publicHolidays";
import { buildDisplayShifts } from "./utils";
import type { Profile } from "./types";
import type { StaffSchedule, StaffShift, StaffLeaveRequest } from "@/hooks/useStaffSchedules";

const days = eachDayOfInterval({ start: parseISO("2026-11-23"), end: parseISO("2026-11-29") });
const person = (id: string, is_schedulable = true): Profile => ({ id, is_schedulable, full_name: id, avatar_url: null, job_title: null, department: null });
const shift = (id: string, date = "2026-11-26"): StaffShift => ({ id, staff_id: id, shift_date: date, property_id: null, schedule_id: null, start_time: "09:00", end_time: "17:00", status: "scheduled", notes: null, created_by: null });
const pattern = (id: string): StaffSchedule => ({ id, staff_id: id, property_id: null, day_of_week: 4, effective_from: "2026-11-01", effective_to: null, is_active: true, start_time: "09:00", end_time: "17:00", notes: null, created_by: null });

describe("explicit roster membership", () => {
  it("requires schedulable plus a real shift in the displayed week", () => {
    expect(rosterPeople([person("working"), person("off", false), person("other-week"), person("empty")], days, [], [shift("working"), shift("off"), shift("other-week", "2026-11-30")]).map(p => p.id)).toEqual(["working"]);
  });
  it("an active weekly pattern qualifies even when its work day has a public holiday", () => {
    const profiles = [person("working"), person("manager"), person("bridget")];
    const holiday: StaffLeaveRequest = { id: "holiday", staff_id: "working", start_date: "2026-11-26", end_date: "2026-11-26", leave_type: "public_holiday", status: "approved", reason: "Thanksgiving", reviewed_by: null, reviewed_at: null, created_by: null };
    const leave = withPublicHolidays([holiday], profiles, "2026-11-23", "2026-11-29");
    const display = buildDisplayShifts(days, [pattern("working")], [], leave, profiles);
    expect(display.filter(s => s.is_leave)).toHaveLength(3);
    expect(rosterPeople(profiles, days, [pattern("working")], []).map(p => p.id)).toEqual(["working"]);
    expect(rosterPeople(profiles, days, [], [])).toEqual([]);
  });
  it("inactive, future or expired patterns do not qualify", () => {
    for (const patch of [{ is_active: false }, { effective_from: "2026-11-30" }, { effective_to: "2026-11-22" }]) {
      expect(rosterPeople([person("p")], days, [{ ...pattern("p"), ...patch }], [])).toEqual([]);
    }
  });
  it("picker includes only explicitly schedulable people, with or without shifts", () => {
    expect(schedulablePeople([person("yes"), person("no", false), { ...person("unset"), is_schedulable: undefined }]).map(p => p.id)).toEqual(["yes"]);
  });
  it("current/future unpublished weeks require the draft flag, past weeks do not", () => {
    const now = parseISO("2026-11-21");
    expect(scheduleDateVisible("2026-11-26", false, () => false, now)).toBe(false);
    expect(scheduleDateVisible("2026-11-26", true, () => false, now)).toBe(true);
    expect(scheduleDateVisible("2026-11-26", false, () => true, now)).toBe(true);
    expect(scheduleDateVisible("2026-11-19", false, () => false, now)).toBe(false);
    expect(scheduleDateVisible("2026-11-12", false, () => false, now)).toBe(true);
  });
});