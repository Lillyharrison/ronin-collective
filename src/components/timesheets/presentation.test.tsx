import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flagSentence, mainStep, orderOverview, visitFlags, visitPresentation } from "./presentation";
import { VisitCard } from "./VisitCard";
import type { Entry, Overview } from "./logic";

const entry: Entry = { id: "visit", staff_id: "staff", property_id: "park", visit_date: "2026-10-26", scheduled_start: "18:00", scheduled_end: "19:30", clock_in: "2026-10-26T22:08:00Z", clock_out: "2026-10-26T23:34:00Z", adj_in: null, adj_out: null, adj_reason: null, flags: [], reason: "call_out", note: null, status: "pending", rounded_hours: 1.5, timesheet_id: null, property: { id: "park", name: "502 Park", timezone: "America/New_York", latitude: null, longitude: null, geofence_radius_m: 100 } };
const now = new Date("2026-11-12T00:43:00Z");
afterEach(cleanup);
describe("Timesheets visit presentation", () => {
  it("uses green for completed pending unflagged visits", () => expect(visitPresentation(entry).tone).toBe("green"));
  it("uses amber for flagged or open pending visits", () => {
    expect(visitPresentation({ ...entry, flags: ["unscheduled"] }).tone).toBe("amber");
    expect(visitPresentation({ ...entry, clock_out: null }).tone).toBe("amber");
  });
  it("uses grey for approved, issued and not-worked visits", () => {
    expect(visitPresentation({ ...entry, status: "approved" }).tone).toBe("grey");
    expect(visitPresentation(entry, true)).toEqual({ tone: "grey", actionable: false, struck: false });
    expect(visitPresentation({ ...entry, status: "not_worked" })).toEqual({ tone: "grey", actionable: false, struck: true });
  });
  it("prioritises open, roster, outside, location, late-entry, then other flags", () => {
    const e = { ...entry, clock_out: null, flags: ["over_12h", "late_entry", "no_location_out", "outside_out", "unscheduled"] };
    expect(visitFlags(e)).toEqual(["still_open", "unscheduled", "outside_out", "no_location_out", "late_entry", "over_12h"]);
    expect(flagSentence(e)).toBe("Still clocked in +5 more");
    expect(flagSentence({ ...e, clock_out: entry.clock_out })).toBe("Not on the roster +4 more");
    expect(flagSentence({ ...entry, flags: ["late_entry", "no_location_in", "outside_in"] })).toBe("Started away from the house +2 more");
    expect(flagSentence({ ...entry, flags: ["over_12h", "late_entry", "no_location_in"] })).toBe("No location at start +2 more");
    expect(flagSentence({ ...entry, flags: ["over_12h", "late_entry"] })).toBe("Start time entered afterwards +1 more");
    expect(flagSentence({ ...entry, flags: ["outside_out"] })).toBe("Ended away from the house");
    expect(flagSentence(entry)).toBe("");
  });
  it("issued visits cannot open an edit flow", () => {
    const open = vi.fn();
    render(<VisitCard entry={entry} issued rounding={15} es={false} onOpen={open} />);
    fireEvent.click(screen.getByRole("article"));
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("pending cards open their visit detail", () => {
    const open = vi.fn();
    render(<VisitCard entry={entry} issued={false} rounding={15} es={false} onOpen={open} />);
    fireEvent.click(screen.getByRole("button"));
    expect(open).toHaveBeenCalledOnce();
  });
});
describe("single next step", () => {
  it("fixes an open visit before approving others", () => expect(mainStep([entry, { ...entry, id: "open", clock_out: null }], "2026-10-01", undefined, now)).toMatchObject({ kind: "open", count: 1, entry: { id: "open" } }));
  it("approves all completed pending visits including flagged ones", () => expect(mainStep([entry, { ...entry, id: "flagged", flags: ["outside_in"] }, { ...entry, status: "approved" }], "2026-10-01", undefined, now)).toEqual({ kind: "pending", count: 2, ids: ["visit", "flagged"] }));
  it("offers issue for reviewed finished months", () => expect(mainStep([{ ...entry, status: "approved" }], "2026-10-01", undefined, now).kind).toBe("ready"));
  it("waits until the month has finished", () => expect(mainStep([{ ...entry, status: "approved" }], "2026-11-01", undefined, now).kind).toBe("unfinished"));
  it("issued overrides pending data", () => expect(mainStep([entry], "2026-10-01", "issued", now).kind).toBe("issued"));
  it("paid overrides pending data", () => expect(mainStep([entry], "2026-10-01", "paid", now).kind).toBe("paid"));
  it("orders people by review, ready, issued and paid", () => {
    const row = { staff_id: "staff", full_name: "Name", pending_count: 0, attention_count: 0 } as Overview;
    expect(orderOverview([{ ...row, timesheet_status: "paid" }, { ...row, timesheet_status: "issued" }, { ...row, pending_count: 2 }, row]).map(r => r.timesheet_status || r.pending_count)).toEqual([2, 0, "issued", "paid"]);
  });
});