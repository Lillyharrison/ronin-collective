import { format } from "date-fns";

/** Company public holidays — staff are entitled to the day off or a day in lieu. */
export const PUBLIC_HOLIDAYS: Record<string, string> = {
  "2026-11-26": "Thanksgiving Day",
  "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King, Jr. Day",
  "2027-02-15": "Presidents' Day",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth (Observed)",
  "2027-07-05": "Independence Day (Observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving Day",
  "2027-12-24": "Christmas Day (Observed)",
};

export const getPublicHoliday = (day: Date) => PUBLIC_HOLIDAYS[format(day, "yyyy-MM-dd")] ?? null;

export const HOLIDAY_HINT = "Public holiday — day off or day in lieu";
