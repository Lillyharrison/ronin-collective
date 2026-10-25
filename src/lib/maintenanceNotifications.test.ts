import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyPlannedSaved, notifyRepairCreated } from "./maintenanceNotifications";
import { notifySection, notifyUsers } from "./notifySection";
import { eligibleNotificationRecipients, reminderCandidates } from "../../supabase/functions/_shared/notificationAudience";

vi.mock("./notifySection", () => ({ notifySection: vi.fn(), notifyUsers: vi.fn() }));

const planned = {
  id: "job", title: "HVAC", assigned_to: "assignee", property_id: "property",
  date_type: "month_only", scheduled_date: null as string | null, scheduled_time: null as string | null,
  scheduled_month: 7, scheduled_year: 2027,
};

beforeEach(() => vi.clearAllMocks());

describe("maintenance notification audiences", () => {
  it("gives an opted-in repair assignee exactly one notification", async () => {
    await notifyRepairCreated({ id: "repair", title: "Leak", assigned_to: "assignee" }, "reporter");
    const broadcast = vi.mocked(notifySection).mock.calls[0];
    expect(broadcast[3]).toEqual({ excludeUserIds: ["assignee"] });
    const audience = eligibleNotificationRecipients(["reporter", "assignee", "admin"], ["reporter", "assignee", "admin"], broadcast[2], broadcast[3]?.excludeUserIds);
    const direct = vi.mocked(notifyUsers).mock.calls[0][0];
    expect([...audience, ...direct].filter(id => id === "assignee")).toHaveLength(1);
    expect(audience).toEqual(["admin"]);
  });

  it("never broadcasts a rough-month entry but still notifies its assignee", async () => {
    await notifyPlannedSaved(null, planned, "actor", "Rockingham");
    expect(notifySection).not.toHaveBeenCalled();
    expect(notifyUsers).toHaveBeenCalledTimes(1);
  });

  it("broadcasts an exact-date creation once and not unrelated edits or unchanged dates", async () => {
    const booked = { ...planned, date_type: "specific", scheduled_date: "2027-07-01", scheduled_time: "07:30:00" };
    await notifyPlannedSaved(null, booked, "actor", "Rockingham");
    await notifyPlannedSaved(booked, { ...booked, title: "HVAC revised" }, "actor", "Rockingham");
    await notifyPlannedSaved(booked, { ...booked }, "actor", "Rockingham");
    expect(notifySection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifySection).mock.calls[0][2]).toBe("actor");
    expect(vi.mocked(notifySection).mock.calls[0][3]).toEqual({ excludeUserIds: ["assignee"] });
    expect(vi.mocked(notifySection).mock.calls[0][1].body).toContain("1 Jul 2027 at 07:30");
    expect(vi.mocked(notifySection).mock.calls[0][1].body).toContain("Rockingham");
    expect(notifyUsers).toHaveBeenCalledTimes(1);
  });

  it("broadcasts when a date is newly set or changed", async () => {
    const booked = { ...planned, date_type: "specific", scheduled_date: "2027-07-01" };
    await notifyPlannedSaved(planned, booked, "actor");
    await notifyPlannedSaved(booked, { ...booked, scheduled_date: "2027-07-02" }, "actor");
    expect(notifySection).toHaveBeenCalledTimes(2);
    expect(notifyUsers).toHaveBeenCalledTimes(2);
  });

  it("filters no-login profiles and exclusions from admins and direct audiences", () => {
    expect(eligibleNotificationRecipients(["admin", "draft", "staff", "staff"], ["admin", "staff"], "admin", ["staff"])).toEqual([]);
    expect(eligibleNotificationRecipients(["admin", "draft", "staff"], ["admin", "staff"])).toEqual(["admin", "staff"]);
  });

  it("reminds only the assignee with a login regardless of opt-in", () => {
    expect(reminderCandidates("assignee", ["assignee", "master"], ["master"])).toEqual(["assignee"]);
  });

  it.each([null, "no-login"])("falls back to logged-in masters for missing/ineligible assignee %s", assignedTo => {
    const logins = ["master"];
    expect(eligibleNotificationRecipients(reminderCandidates(assignedTo, logins, ["master", "draft-master"]), logins)).toEqual(["master"]);
  });
});