import { describe, expect, it } from "vitest";
import { ACCESS_REFRESH_COPY, newestAccessCheck, accessNotificationPath, reportIssues, wrongAlertReason, type AccessOverview, type AccessReport } from "./accessCheckLogic";
const report = { tables: { tasks: { can_see: 3, outside_their_houses: 2 } }, roster_outside_their_houses: { upcoming_shifts: 1, active_patterns: 2 }, houseless_entries_belonging_to_others: { tasks: 1 }, alerts_that_look_wrong: [{ when: "today", title: "Wrong", why: "unassigned house" }] } as unknown as AccessReport;
describe("access checks", () => {
  it("selects newest valid stored timestamp, not array order or refresh time", () => {
    const rows = ["2026-11-14T01:00:00Z", null, "2026-11-13T01:00:00Z", "invalid"].map(checked_at => ({ checked_at } as AccessOverview));
    expect(newestAccessCheck(rows)).toBe("2026-11-14T01:00:00Z"); expect(newestAccessCheck([])).toBeNull();
  });
  it("formats quiet sequential progress in Spanish", () => { expect(ACCESS_REFRESH_COPY.es.progress(3, 9)).toBe("Comprobando 3 de 9"); });
  it("routes access alerts only for master admins", () => { expect(accessNotificationPath("access_check", true)).toBe("/meet-team?view=access-check"); expect(accessNotificationPath("access_check", false)).toBeNull(); expect(accessNotificationPath("order", true)).toBeNull(); });
  it("extracts each concrete rule and its count", () => { expect(reportIssues(report).map(i => [i.rule, i.count])).toEqual([["other_house_data", 2], ["roster_outside_assigned_houses", 3], ["houseless_entries_of_others", 1], ["wrong_alert", 1]]); });
  it("matches wrong alerts by timestamp and title, not title alone", () => { expect(wrongAlertReason({ when: "today", title: "Wrong" }, report.alerts_that_look_wrong)).toBe("unassigned house"); expect(wrongAlertReason({ when: "yesterday", title: "Wrong" }, report.alerts_that_look_wrong)).toBeNull(); });
});