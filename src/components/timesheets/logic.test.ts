import { describe, it, expect } from "vitest";
import {
  classification,
  flagLabel,
  localInstant,
  localInput,
  canIssue,
  monthShift,
  type Entry,
} from "./logic";
const entry = {
  status: "approved",
  flags: [],
  clock_out: "2026-10-01T16:00:00Z",
} as unknown as Entry;
describe("visit review rules", () => {
  it("pending complete unflagged visits are green", () =>
    expect(classification({ ...entry, status: "pending" })).toBe("green"));
  it("flags require attention", () =>
    expect(
      classification({ ...entry, status: "pending", flags: ["outside_in"] }),
    ).toBe("attention"));
  it("open visits require attention", () =>
    expect(
      classification({ ...entry, status: "pending", clock_out: null }),
    ).toBe("attention"));
  it("approved lines are neutral and not worked are struck", () => {
    expect(classification(entry)).toBe("neutral");
    expect(classification({ ...entry, status: "not_worked" })).toBe(
      "not_worked",
    );
  });
  it("labels location and manager flags", () => {
    expect(flagLabel("outside_in")).toBe("Started away from the house");
    expect(flagLabel("ended_by_manager")).toBe("End added by you");
    expect(flagLabel("delayed_sync_out")).toBe("Sent after signal returned");
  });
  it("converts property time independently of the browser", () => {
    expect(localInstant("2026-10-01T08:07", "America/New_York")).toBe(
      "2026-10-01T12:07:00.000Z",
    );
    expect(localInput("2026-10-01T12:07:00Z", "America/New_York")).toBe(
      "2026-10-01T08:07",
    );
  });
  it("handles winter and invalid zones", () => {
    expect(localInstant("2026-11-09T08:07", "America/New_York")).toBe(
      "2026-11-09T13:07:00.000Z",
    );
    expect(localInstant("2026-10-01T08:07", "invalid")).toBe(
      "2026-10-01T08:07:00.000Z",
    );
  });
  it("rejects nonexistent daylight saving times", () =>
    expect(() =>
      localInstant("2026-03-08T02:30", "America/New_York"),
    ).toThrow());
  it("does not issue pending or open lines", () => {
    expect(
      canIssue(
        "2026-10-01",
        [{ ...entry, status: "pending" }],
        25,
        false,
        new Date("2026-11-09Z"),
      ),
    ).toBe(false);
    expect(
      canIssue(
        "2026-10-01",
        [{ ...entry, clock_out: null }],
        25,
        false,
        new Date("2026-11-09Z"),
      ),
    ).toBe(false);
  });
  it("does not issue before month end or without rate or twice", () => {
    expect(
      canIssue("2026-11-01", [entry], 25, false, new Date("2026-11-09Z")),
    ).toBe(false);
    expect(canIssue("2026-10-01", [entry], null, false)).toBe(false);
    expect(canIssue("2026-10-01", [entry], 25, true)).toBe(false);
  });
  it("issues reviewed finished months", () =>
    expect(
      canIssue("2026-10-01", [entry], 25, false, new Date("2026-11-01T00:00Z")),
    ).toBe(true));
  it("month selection crosses years", () =>
    expect(monthShift("2026-01-01", -1)).toBe("2025-12-01"));
});
