import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ allowed: new Set(["allowed"]) as ReadonlySet<string> | null }));
vi.mock("@/hooks/useAssignableProfileIds", () => ({ useAssignableProfileIds: () => mocks.allowed }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "tester", isAdmin: true, canEdit: () => false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", t: (key: string) => key }) }));
import { IssueModal } from "./IssueModal";
afterEach(cleanup);
const originalTZ = process.env.TZ;
afterEach(() => { process.env.TZ = originalTZ; });
describe("repair date saves", () => {
  it.each(["America/Los_Angeles", "America/New_York", "Europe/Rome", "Pacific/Auckland"])("tolerates old stamps and saves plain DATE values in %s", async tz => {
    process.env.TZ = tz;
    for (const stamp of ["2026-11-23T00:00:00.000Z", "2026-11-10T22:28:44Z"]) {
      const save = vi.fn().mockResolvedValue(true);
      const { unmount } = render(<IssueModal open mode="edit" onClose={vi.fn()} onSave={save}
        initial={{ title: "Repair", status: "scheduled", scheduled_date: stamp }} categories={[]} properties={[]} profiles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: "save" }));
      await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ scheduled_date: stamp.slice(0, 10) })));
      const dateInput = document.querySelector('input[type="date"]');
      if (!dateInput) throw new Error("Missing repair date input");
      fireEvent.change(dateInput, { target: { value: "2026-11-24" } });
      fireEvent.click(screen.getByRole("button", { name: "save" }));
      await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ scheduled_date: "2026-11-24" })));
      unmount();
    }
  });
});
describe("repair assignee editor", () => {
  it("shows an ineligible current assignee and keeps its ID when saved", async () => {
    mocks.allowed = new Set(["allowed"]);
    const save = vi.fn().mockResolvedValue(true);
    render(<IssueModal open mode="edit" onClose={vi.fn()} onSave={save} initial={{ title: "Repair", assigned_to: "current" }}
      categories={[]} properties={[]} profiles={[{ id: "allowed", name: "Available person", avatar: null }, { id: "current", name: "Current person", avatar: null }, { id: "other", name: "Other person", avatar: null }]} />);
    const option = screen.getByRole("option", { name: /Current person/ });
    const select = option.closest("select");
    expect(select).toHaveValue("current");
    expect(screen.queryByRole("option", { name: "Other person" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ assigned_to: "current" })));
  });
  it("represents a current assignee even when missing from the profile feed", () => {
    render(<IssueModal open mode="edit" onClose={vi.fn()} onSave={vi.fn()} initial={{ title: "Repair", assigned_to: "missing", assignee_name: "Previous person" }}
      categories={[]} properties={[]} profiles={[]} />);
    const option = screen.getByRole("option", { name: /Previous person/ });
    expect(option.closest("select")).toHaveValue("missing");
  });
});