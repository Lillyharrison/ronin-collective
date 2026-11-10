import { afterEach, describe, expect, it } from "vitest";
import {
  isDateOnlyStamp, stampToDisplayDate, stampToDateInputValue, dateInputToStamp,
  dateInputToSavedStamp, compareStampCalendarDate, localDateKey, eventDayKeys,
} from "./calendarTime";
import { formatStampDate, previousDateStamp } from "../../supabase/functions/_shared/eventTime";

const originalTZ = process.env.TZ;
afterEach(() => { process.env.TZ = originalTZ; });
const zones = ["America/Los_Angeles", "America/New_York", "Europe/Rome", "Pacific/Auckland"];
const dateStamp = "2026-11-23T00:00:00.000Z";
const realStamp = "2026-11-10T22:28:44Z";

describe("mixed task and repair stamps", () => {
  it.each([dateStamp, "2026-11-23T00:00:00Z", "2026-11-23T00:00:00+00:00"])("recognizes UTC midnight %s", stamp => {
    expect(isDateOnlyStamp(stamp)).toBe(true);
  });
  it.each([realStamp, "2026-11-23T00:00:00.001Z", "2026-11-23T00:00:01Z", "2026-11-23T00:01:00Z", "2026-11-23T00:00:00-08:00", "2026-11-23", "invalid"])("does not misclassify %s", stamp => {
    expect(isDateOnlyStamp(stamp)).toBe(false);
  });
  it.each(zones)("task and repair stay on 23 Nov in %s", tz => {
    process.env.TZ = tz;
    for (const stamp of [dateStamp, "2026-11-23T00:00:00+00:00"]) {
      const displayed = stampToDisplayDate(stamp);
      expect(localDateKey(displayed)).toBe("2026-11-23");
      expect(displayed.getHours()).toBe(0);
      expect(stampToDateInputValue(stamp)).toBe("2026-11-23");
      expect(eventDayKeys({ start_date: stamp, all_day: isDateOnlyStamp(stamp) })).toEqual({ start: "2026-11-23", end: "2026-11-23" });
    }
  });
  it.each(zones)("overdue and due-today compare local calendar dates in %s", tz => {
    process.env.TZ = tz;
    expect(compareStampCalendarDate(dateStamp, new Date(2026, 10, 22, 23, 59))).toBeGreaterThan(0);
    expect(compareStampCalendarDate(dateStamp, new Date(2026, 10, 23, 0, 0))).toBe(0);
    expect(compareStampCalendarDate(dateStamp, new Date(2026, 10, 23, 23, 59))).toBe(0);
    expect(compareStampCalendarDate(dateStamp, new Date(2026, 10, 24, 0, 0))).toBeLessThan(0);
  });
  it.each(zones)("date picker saves preserve both original dates and genuine moments in %s", tz => {
    process.env.TZ = tz;
    for (const stamp of [dateStamp, "2026-11-23T00:00:00+00:00", realStamp]) {
      expect(dateInputToSavedStamp(stampToDateInputValue(stamp), stamp)).toBe(stamp);
    }
    expect(dateInputToStamp("2026-11-23")).toBe(dateStamp);
    expect(dateInputToSavedStamp("2026-11-23", realStamp)).toBe(dateStamp);
    expect(dateInputToSavedStamp("", realStamp)).toBeNull();
  });
  it.each([
    ["America/Los_Angeles", "2026-11-10", 14], ["America/New_York", "2026-11-10", 17],
    ["Europe/Rome", "2026-11-10", 23], ["Pacific/Auckland", "2026-11-11", 11],
  ] as const)("real repair time stays a true moment in %s", (tz, key, hour) => {
    process.env.TZ = tz;
    const displayed = stampToDisplayDate(realStamp);
    expect(displayed.getTime()).toBe(Date.parse(realStamp));
    expect(localDateKey(displayed)).toBe(key);
    expect(displayed.getHours()).toBe(hour);
    expect(displayed.getMinutes()).toBe(28);
    expect(stampToDateInputValue(realStamp)).toBe(key);
  });
  it.each(zones)("server date text and automated task writes are zone-independent in %s", tz => {
    process.env.TZ = tz;
    expect(formatStampDate(dateStamp)).toBe("Nov 23");
    expect(previousDateStamp(dateStamp, "America/Los_Angeles")).toBe("2026-11-22T00:00:00.000Z");
    expect(previousDateStamp(realStamp, "Pacific/Auckland")).toBe("2026-11-10T00:00:00.000Z");
  });
});