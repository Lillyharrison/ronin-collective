import { afterEach, describe, expect, it } from "vitest";
import { plainDateToLocal, plainDateKey, dateInputToPlainDate, comparePlainCalendarDate, localDateKey } from "./calendarTime";
import { formatPlainDate, previousEventDate } from "../../supabase/functions/_shared/eventTime";

const originalTZ = process.env.TZ;
afterEach(() => { process.env.TZ = originalTZ; });
const zones = ["America/Los_Angeles", "America/New_York", "Europe/Rome", "Pacific/Auckland"];
const date = "2026-11-23";

describe("task and repair DATE columns", () => {
  it.each(zones)("task and repair display 23 Nov in %s", tz => {
    process.env.TZ = tz;
    for (const value of [date, `${date}T00:00:00.000Z`, `${date}T22:28:44Z`]) {
      expect(localDateKey(plainDateToLocal(value))).toBe(date);
      expect(plainDateToLocal(value).getHours()).toBe(0);
    }
  });
  it.each(zones)("overdue/due-today use the viewer's calendar in %s", tz => {
    process.env.TZ = tz;
    expect(comparePlainCalendarDate(date, new Date(2026, 10, 22, 23, 59))).toBeGreaterThan(0);
    expect(comparePlainCalendarDate(date, new Date(2026, 10, 23, 0, 0))).toBe(0);
    expect(comparePlainCalendarDate(date, new Date(2026, 10, 23, 23, 59))).toBe(0);
    expect(comparePlainCalendarDate(date, new Date(2026, 10, 24, 0, 0))).toBeLessThan(0);
  });
  it.each(zones)("unchanged date picker saves the identical plain date in %s", tz => {
    process.env.TZ = tz;
    expect(dateInputToPlainDate(plainDateKey(date))).toBe(date);
    expect(dateInputToPlainDate(plainDateKey(`${date}T22:28:44Z`))).toBe(date);
    expect(dateInputToPlainDate("")).toBeNull();
  });
  it("server task descriptions and event prep use plain dates", () => {
    expect(formatPlainDate(date)).toBe("Nov 23");
    expect(previousEventDate("2026-11-23T00:00:00Z", "America/Los_Angeles", true)).toBe("2026-11-22");
    expect(previousEventDate("2026-11-23T00:00:00Z", "America/Los_Angeles", false)).toBe("2026-11-21");
    expect(previousEventDate("2026-11-10T22:28:44Z", "Pacific/Auckland")).toBe("2026-11-10");
  });
});
