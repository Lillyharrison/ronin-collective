import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const invoke = vi.fn().mockResolvedValue({ data: { user_id: "new-id" }, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  },
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissionsControl: () => ({ enterPreview: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MemberEditDrawer } from "./MemberEditDrawer";

const draft = { id: "d1", full_name: "Muaz", job_title: null, avatar_url: null, level: "staff", department: null, start_date: null, birthday: null,
  phone: null, notes: null, assigned_property_ids: [], section_permissions: null, quick_actions: [], role: "staff" as const, is_draft: true };

function show() {
  render(<MemberEditDrawer member={draft} properties={[]} isEN canEdit isMasterAdmin onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />);
}

describe("member editor", () => {
  it("warns when nothing is switched on and confirms before inviting", async () => {
    show();
    expect(screen.getByTestId("member-status")).toHaveTextContent("Nothing switched on yet");
    const send = screen.getByRole("button", { name: /Send invitation/ });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("jane@example.com"), { target: { value: "muaz@example.com" } });
    fireEvent.click(send);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("This person will see nothing yet. Send invitation anyway?");
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    const body = invoke.mock.calls[0][1].body;
    expect(body.section_permissions_rows).toEqual([]);
    expect(body.quick_actions).toEqual([]);
    expect(body.assigned_property_ids).toEqual([]);
  });
  it("shows four tabs with counts", () => {
    show();
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["Details", "Houses(0)", "Access(0)", "Home screen(0)"]);
  });
});

describe("clock row in Schedule", () => {
  function openSchedule(member: typeof draft) {
    render(<MemberEditDrawer member={member} properties={[]} isEN canEdit isMasterAdmin onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Access/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Schedule/ }));
  }
  it("shows for staff and counts in the group", () => {
    openSchedule(draft);
    expect(screen.getByTestId("clock-row")).toHaveTextContent("Clock in and out on site");
    expect(screen.getByRole("button", { name: /^Schedule/ })).toHaveTextContent("0 of 2 on");
    fireEvent.click(screen.getByRole("switch", { name: "Clock in and out on site" }));
    expect(screen.getByRole("button", { name: /^Schedule/ })).toHaveTextContent("1 of 2 on");
    expect(screen.getByTestId("member-status")).toHaveTextContent("1 switch on");
    expect(screen.getByTestId("clock-no-rate")).toBeTruthy();
  });
  it("is hidden for managers", () => {
    openSchedule({ ...draft, level: "manager", role: "manager" as never });
    expect(screen.queryByTestId("clock-row")).toBeNull();
    expect(screen.getByRole("button", { name: /^Schedule/ })).toHaveTextContent("0 of 1 on");
  });
});
