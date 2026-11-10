import { afterEach, describe, expect, it } from "vitest";
import {
  allDayEndIso, allDayStartIso, birthdayInYear, eventDayKeys, eventToFormTimes, formTimesToEvent,
  formatEventWhen, houseTimeZone, isMultiDayEvent, localDateKey, utcToWallTime, toggleAllDay,
} from "./calendarTime";
import { describeEventWhen, icalToStored, parseICalDateProp } from "../../supabase/functions/_shared/eventTime";

const ORIGINAL_TZ = process.env.TZ;
const setTZ = (tz: string) => { process.env.TZ = tz; };
afterEach(() => { process.env.TZ = ORIGINAL_TZ; });

const ZONES = ["America/Los_Angeles", "America/New_York", "Europe/Rome", "Pacific/Auckland"];

const christmas = { start_date: "2026-12-25T00:00:00+00:00", end_date: "2026-12-25T23:59:00+00:00", all_day: true };
const newYear = { start_date: "2027-01-01T00:00:00+00:00", end_date: "2027-01-01T23:59:00+00:00", all_day: true };

describe("all-day holidays", () => {
  it.each(ZONES)("Christmas and New Year's Day sit on exactly one day under %s", (tz) => {
    setTZ(tz);
    expect(eventDayKeys(christmas)).toEqual({ start: "2026-12-25", end: "2026-12-25" });
    expect(isMultiDayEvent(christmas)).toBe(false);
    expect(eventDayKeys(newYear)).toEqual({ start: "2027-01-01", end: "2027-01-01" });
    expect(isMultiDayEvent(newYear)).toBe(false);
    expect(formatEventWhen(christmas)).toBe("Dec 25, 2026");
  });

  it("multi-day all-day entries keep their inclusive last day", () => {
    setTZ("America/Los_Angeles");
    const stay = { start_date: allDayStartIso("2026-12-24"), end_date: allDayEndIso("2026-12-26"), all_day: true };
    expect(eventDayKeys(stay)).toEqual({ start: "2026-12-24", end: "2026-12-26" });
  });
});

describe("timed entries use the viewer's zone", () => {
  // 13:00 in Los Angeles on 10 Nov 2026 (PST, UTC-8) = 21:00 UTC
  const booking = formTimesToEvent({ all_day: false, start: "2026-11-10T13:00", end: "" }, "America/Los_Angeles");

  it("stores the true moment from house time", () => {
    expect(booking.start_date).toBe("2026-11-10T21:00:00.000Z");
    expect(booking.all_day).toBe(false);
  });

  it("shows 22:00 in Rome and 13:00 in Los Angeles", () => {
    setTZ("Europe/Rome");
    expect(utcToWallTime(booking.start_date, null)).toBe("2026-11-10T22:00");
    expect(formatEventWhen(booking)).toContain("10:00");
    setTZ("America/Los_Angeles");
    expect(utcToWallTime(booking.start_date, null)).toBe("2026-11-10T13:00");
    expect(formatEventWhen(booking)).toContain("1:00");
  });

  it("buckets late-evening entries on the viewer's local date", () => {
    const late = { start_date: "2026-11-11T06:30:00Z", end_date: null, all_day: false };
    setTZ("America/Los_Angeles");
    expect(eventDayKeys(late).start).toBe("2026-11-10");
    setTZ("Europe/Rome");
    expect(eventDayKeys(late).start).toBe("2026-11-11");
  });
});

describe("event form", () => {
  it("All day saves date 00:00 UTC to end date 23:59 UTC", () => {
    expect(formTimesToEvent({ all_day: true, start: "2026-12-25", end: "" }, "America/Los_Angeles")).toEqual({
      all_day: true, start_date: "2026-12-25T00:00:00.000Z", end_date: "2026-12-25T23:59:00.000Z",
    });
    expect(formTimesToEvent({ all_day: true, start: "2026-12-24", end: "2026-12-26" }, null).end_date).toBe("2026-12-26T23:59:00.000Z");
  });

  it("house time is used regardless of the browser's zone", () => {
    setTZ("Europe/Rome");
    expect(formTimesToEvent({ all_day: false, start: "2026-07-04T13:00", end: "2026-07-04T15:30" }, "America/Los_Angeles")).toEqual({
      all_day: false, start_date: "2026-07-04T20:00:00.000Z", end_date: "2026-07-04T22:30:00.000Z",
    });
  });

  it("no house (or an invalid zone) uses the user's own zone", () => {
    setTZ("Europe/Rome");
    expect(houseTimeZone("Not/AZone")).toBeNull();
    expect(houseTimeZone(undefined)).toBeNull();
    expect(formTimesToEvent({ all_day: false, start: "2026-11-10T13:00", end: "" }, houseTimeZone("Bad/Zone")).start_date)
      .toBe("2026-11-10T12:00:00.000Z");
  });

  it("all-day entries load as dates; timed entries load in house time", () => {
    setTZ("Pacific/Auckland");
    expect(eventToFormTimes(christmas, "America/Los_Angeles")).toEqual({ all_day: true, start: "2026-12-25", end: "2026-12-25" });
    expect(eventToFormTimes({ start_date: "2026-11-10T21:00:00Z", end_date: null }, "America/Los_Angeles"))
      .toEqual({ all_day: false, start: "2026-11-10T13:00", end: "" });
  });

  it("toggling All day keeps the chosen dates", () => {
    const t = toggleAllDay({ all_day: false, start: "2026-11-10T13:00", end: "2026-11-12T10:00" }, true);
    expect(t).toEqual({ all_day: true, start: "2026-11-10", end: "2026-11-12" });
  });

  it.each(ZONES)("open and save without changes moves nothing (%s)", (tz) => {
    setTZ(tz);
    for (const house of ["America/Los_Angeles", null]) {
      const timed = { start_date: "2026-11-10T21:00:00.000Z", end_date: "2026-11-10T23:15:00.000Z", all_day: false };
      expect(formTimesToEvent(eventToFormTimes(timed, house), house)).toEqual(timed);
      const allDay = { start_date: allDayStartIso("2026-12-25"), end_date: allDayEndIso("2026-12-26"), all_day: true };
      expect(formTimesToEvent(eventToFormTimes(allDay, house), house)).toEqual(allDay);
    }
  });
});

describe("birthdays", () => {
  it("do not shift a day under Los Angeles", () => {
    setTZ("America/Los_Angeles");
    const d = birthdayInYear("1990-03-01", 2027)!;
    expect(localDateKey(d)).toBe("2027-03-01");
    expect(localDateKey(birthdayInYear("1985-12-31", 2026)!)).toBe("2026-12-31");
  });
  it("29 February falls on 28 February in other years", () => {
    expect(localDateKey(birthdayInYear("2000-02-29", 2027)!)).toBe("2027-02-28");
    expect(localDateKey(birthdayInYear("2000-02-29", 2028)!)).toBe("2028-02-29");
  });
});

describe("server helpers", () => {
  it("describes all-day entries by date only and timed entries in house time", () => {
    expect(describeEventWhen(christmas, "America/Los_Angeles")).toBe("Friday, December 25, 2026 (all day)");
    expect(describeEventWhen({ start_date: "2026-11-10T21:00:00Z", all_day: false }, "America/Los_Angeles"))
      .toBe("Tuesday, November 10, 2026 at 1:00 PM (America/Los_Angeles time)");
    expect(describeEventWhen({ start_date: "2026-11-10T21:00:00Z", all_day: false }, "Bad/Zone")).toContain("(UTC time)");
  });

  it("iCal all-day DTEND is exclusive", () => {
    const s = parseICalDateProp(";VALUE=DATE", "20261225")!;
    const e = parseICalDateProp(";VALUE=DATE", "20261226")!;
    expect(icalToStored(s, e)).toEqual({ all_day: true, start_date: "2026-12-25T00:00:00.000Z", end_date: "2026-12-25T23:59:00.000Z" });
  });

  it("iCal timed events honour TZID and Z", () => {
    const s = parseICalDateProp(";TZID=America/Los_Angeles", "20261110T130000")!;
    const e = parseICalDateProp("", "20261110T230000Z")!;
    expect(icalToStored(s, e)).toEqual({ all_day: false, start_date: "2026-11-10T21:00:00.000Z", end_date: "2026-11-10T23:00:00.000Z" });
  });
});
