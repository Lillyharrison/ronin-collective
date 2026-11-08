import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ArchiveMemberDialog, describeBlockers } from "./ArchiveMember";
import { filterAssignableStaff } from "@/lib/assignableStaff";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function open() {
  const onArchived = vi.fn();
  render(<ArchiveMemberDialog member={{ id: "p1", full_name: "Leslie" }} isEN open onOpenChange={() => {}} onArchived={onArchived} />);
  return { onArchived };
}

it("blocks archiving while open work is assigned", async () => {
  mocks.rpc.mockResolvedValue({ data: { tasks: 2, repairs: 1, planned_maintenance: 0, orders: 0, total: 3 }, error: null });
  const { onArchived } = open();
  expect(await screen.findByText("2 open tasks")).toBeInTheDocument();
  expect(screen.getByText("1 open repair")).toBeInTheDocument();
  const btn = screen.getByRole("button", { name: "Archive" });
  expect(btn).toBeDisabled();
  fireEvent.click(btn);
  expect(mocks.rpc).not.toHaveBeenCalledWith("archive_profile", expect.anything());
  expect(onArchived).not.toHaveBeenCalled();
});

it("archives and reports the id so the person is removed from the list", async () => {
  mocks.rpc.mockImplementation(async (fn: string) =>
    fn === "archive_blockers" ? { data: { tasks: 0, repairs: 0, planned_maintenance: 0, orders: 0, total: 0 }, error: null } : { data: null, error: null });
  const { onArchived } = open();
  const btn = await screen.findByRole("button", { name: "Archive" });
  await waitFor(() => expect(btn).not.toBeDisabled());
  fireEvent.click(btn);
  await waitFor(() => expect(onArchived).toHaveBeenCalledWith("p1"));
  expect(mocks.rpc).toHaveBeenCalledWith("archive_profile", expect.objectContaining({ _profile_id: "p1", _note: null, _keep_until: null }));
  // what MeetTeamSection does with the id
  const list = [{ id: "p1" }, { id: "p2" }].filter(m => m.id !== onArchived.mock.calls[0][0]);
  expect(list).toEqual([{ id: "p2" }]);
});

it("shows the server error when archiving fails", async () => {
  mocks.rpc.mockImplementation(async (fn: string) =>
    fn === "archive_blockers" ? { data: { tasks: 0, repairs: 0, planned_maintenance: 0, orders: 0, total: 0 }, error: null } : { data: null, error: { message: "Cannot archive yourself" } });
  const { onArchived } = open();
  const btn = await screen.findByRole("button", { name: "Archive" });
  await waitFor(() => expect(btn).not.toBeDisabled());
  fireEvent.click(btn);
  expect(await screen.findByText("Cannot archive yourself")).toBeInTheDocument();
  expect(onArchived).not.toHaveBeenCalled();
});

it("excludes archived people from assignee pickers", () => {
  const people = [
    { id: "a", level: "staff", is_archived: false },
    { id: "b", level: "staff", is_archived: true },
    { id: "c", level: null },
  ];
  expect(filterAssignableStaff(people).map(p => p.id)).toEqual(["a", "c"]);
});

it("describes no blockers when nothing is open", () => {
  expect(describeBlockers({ tasks: 0, repairs: 0, planned_maintenance: 0, orders: 0, total: 0 }, true)).toEqual([]);
});
