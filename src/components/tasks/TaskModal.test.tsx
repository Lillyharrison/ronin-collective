import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), properties: [] as string[] }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "tester", isAdmin: true, assignedPropertyIds: mocks.properties }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
vi.mock("@/hooks/useAssignableProfileIds", () => ({ useAssignableProfileIds: () => null }));
vi.mock("@/lib/notifySection", () => ({ notifyUsers: vi.fn(), notifySection: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const chain = {
      select: () => chain, order: () => chain, eq: () => chain, limit: () => chain,
      update: (payload: unknown) => { mocks.update(payload); return chain; },
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  },
} }));
import { TaskModal } from "./TaskModal";

const originalTZ = process.env.TZ;
afterEach(() => { cleanup(); vi.clearAllMocks(); process.env.TZ = originalTZ; });
it.each(["America/Los_Angeles", "America/New_York", "Europe/Rome", "Pacific/Auckland"])("task date load/save preserves originals and writes UTC-midnight changes in %s", async tz => {
  process.env.TZ = tz;
  for (const stamp of ["2026-11-23T00:00:00.000Z", "2026-11-23T00:00:00+00:00", "2026-11-10T22:28:44Z"]) {
    const { unmount } = render(<TaskModal task={{ id: "task", title_en: "Repair task", status: "pending", priority: 2, due_date: stamp }} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const input = document.querySelector('input[type="date"]');
    if (!input) throw new Error("Missing task date input");
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ due_date: stamp })));
    fireEvent.change(input, { target: { value: "2026-11-24" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ due_date: "2026-11-24T00:00:00.000Z" })));
    unmount();
  }
});