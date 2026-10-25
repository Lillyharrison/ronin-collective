import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ allowed: new Set(["allowed"]) as ReadonlySet<string> | null }));
vi.mock("@/hooks/useAssignableProfileIds", () => ({ useAssignableProfileIds: () => mocks.allowed }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "tester", canEdit: () => false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", t: (key: string) => key }) }));
import { IssueModal } from "./IssueModal";
afterEach(cleanup);
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