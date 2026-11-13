import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ error: null as { message: string } | null, toast: vi.fn() }));
const people = [
  { id: "staff", full_name: "Eligible staff", level: "staff", is_archived: false },
  { id: "manager", full_name: "Manager", level: "staff", is_archived: false },
  { id: "admin", full_name: "Admin", level: "staff", is_archived: false },
  { id: "master", full_name: "Master admin", level: "staff", is_archived: false },
  { id: "family", full_name: "Principal", level: "principal", is_archived: false },
  { id: "extended", full_name: "Extended family", level: "extended_family", is_archived: false },
  { id: "archived", full_name: "Archived staff", level: "staff", is_archived: true },
  { id: "draft", full_name: "No login", level: "staff", is_archived: false },
];
vi.mock("sonner", () => ({ toast: { error: m.toast, success: vi.fn() } }));
vi.mock("./api", () => ({
  db: {
    functions: { invoke: async () => ({ data: { people: people.filter(p => p.id !== "draft") }, error: null }) },
    from: (table: string) => {
      const q: any = {
        select: () => q, eq: (_column: string, role: string) => {
          expect(role).toBe("staff"); return q;
        }, order: () => q,
        range: async () => ({ data: table === "user_roles"
          ? ["staff", "family", "extended", "archived", "draft"].map(user_id => ({ user_id })) : [], error: null }),
        upsert: () => q, single: async () => ({ data: { staff_id: "staff" }, error: m.error }),
      };
      return q;
    },
  },
  result: async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const r = await q; if (r.error) throw r.error; return r.data;
  },
  allRows: async (make: (a: number, b: number) => PromiseLike<{ data: unknown }>) => (await make(0, 199)).data,
}));
import { TimesheetSettings } from "./Settings";
afterEach(() => { cleanup(); vi.clearAllMocks(); m.error = null; });
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TimesheetSettings es={false} userId="admin" />
  </QueryClientProvider>);
}
it("settings only offer logged-in non-archived people with staff role AND staff level", async () => {
  show();
  await screen.findByText("Eligible staff");
  expect(screen.getAllByRole("combobox")).toHaveLength(3);
  for (const p of people.filter(p => p.id !== "staff")) expect(screen.queryByText(p.full_name)).not.toBeInTheDocument();
});
it("shows the database rejection message without claiming a save succeeded", async () => {
  m.error = { message: "Only staff can sign in and out with Ronin, not family, managers or admins" };
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  await vi.waitFor(() => expect(m.toast).toHaveBeenCalledWith(m.error?.message));
});