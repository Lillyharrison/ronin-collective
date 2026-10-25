import { describe, expect, it } from "vitest";
import { selectAssignableProfiles } from "./assignableProfiles";
import { filterAssignableStaff } from "./assignableStaff";

describe("assignee options", () => {
  const profiles = [{ id: "allowed", level: "staff" }, { id: "current", level: "staff" }, { id: "other", level: "staff" }];
  it("keeps an ineligible current assignee during editing while removing other ineligible people", () => {
    const options = selectAssignableProfiles(profiles, new Set(["allowed"]), "current");
    expect(options.profiles.map(p => p.id)).toEqual(["allowed", "current"]);
    expect(options.unavailableCurrent).toBe(true);
    expect(options.filteredOut).toBe(true);
  });
  it("does not offer the same ineligible person for a new task", () => {
    expect(selectAssignableProfiles(profiles, new Set(["allowed"])).profiles.map(p => p.id)).toEqual(["allowed"]);
  });
  it("retains family exclusion even if the RPC permits their screen access", () => {
    const staff = filterAssignableStaff([...profiles, { id: "family", level: "principal" }]);
    expect(selectAssignableProfiles(staff, new Set(["allowed", "family"])).profiles.map(p => p.id)).toEqual(["allowed"]);
  });
  it("provides a missing-current flag so the editor can represent an assignee absent from its profile feed", () => {
    expect(selectAssignableProfiles(profiles, new Set(["allowed"]), "missing")).toMatchObject({ missingCurrent: true, unavailableCurrent: true });
  });
});