import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyPlannedSaved, notifyRepairCreated, repairNoticeBody } from "./maintenanceNotifications";
import { repairNotificationBody } from "../../supabase/functions/_shared/repairNotificationBody";
import { notifySection, notifyUsers } from "./notifySection";
import { eligibleNotificationRecipients, reminderCandidates } from "../../supabase/functions/_shared/notificationAudience";

vi.mock("./notifySection", () => ({ notifySection: vi.fn(), notifyUsers: vi.fn() }));
const profiles = vi.hoisted(() => ({ name: "Julia Harris" as string | null, lookup: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: (_column: string, id: string) => {
    profiles.lookup(id);
    return { maybeSingle: async () => ({ data: { full_name: profiles.name }, error: null }) };
  } }) }),
} }));

const planned = {
  id: "job", title: "HVAC", assigned_to: "assignee", property_id: "property",
  date_type: "month_only", scheduled_date: null as string | null, scheduled_time: null as string | null,
  scheduled_month: 7, scheduled_year: 2027,
};

beforeEach(() => { vi.clearAllMocks(); profiles.name = "Julia Harris"; });

describe("repair notification reporter bodies", () => {
  it.each([
    ["en", "Reported by Julia Harris · Location: Outdoor light"],
    ["es", "Reportado por Julia Harris · Ubicación: Outdoor light"],
  ])("prefixes both new and assigned repair bodies in %s", async (language, expected) => {
    await notifyRepairCreated({ id: "repair", title: "Return glass for light fixture", reported_by: "julia", assigned_to: "assignee", location_detail: "Outdoor light" }, "actor", language);
    expect(vi.mocked(notifySection).mock.calls[0][1].body).toBe(expected);
    expect(vi.mocked(notifyUsers).mock.calls[0][1].body).toBe(expected);
    expect(profiles.lookup).toHaveBeenCalledWith("julia");
  });
  it("omits attribution when no profile name is found and preserves location", async () => {
    profiles.name = null;
    expect(await repairNoticeBody({ id: "repair", title: "Glass", reported_by: "missing", location_detail: "Outdoor light" })).toBe("Location: Outdoor light");
    expect(repairNotificationBody(undefined, "Location: Outdoor light", "es")).toBe("Ubicación: Outdoor light");
    expect(repairNotificationBody(null)).toBeUndefined();
  });
  it("uses the saved reporter rather than the person assigning on their behalf", async () => {
    expect(await repairNoticeBody({ id: "repair", title: "Glass", reported_by: "original-reporter" })).toBe("Reported by Julia Harris");
    expect(profiles.lookup).toHaveBeenCalledWith("original-reporter");
  });
});

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