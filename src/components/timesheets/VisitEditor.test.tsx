import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  rpc: vi.fn(() => Promise.resolve({ data: "entry", error: null })),
}));
vi.mock("./api", () => ({
  db: { rpc: m.rpc },
  result: async (
    p: Promise<{ data: unknown; error: { message: string } | null }>,
  ) => {
    const r = await p;
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
}));
import { VisitEditor } from "./VisitEditor";
import type { Property } from "./logic";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("requires a reason and sends property-local instants before reporting success", async () => {
  const saved = vi.fn();
  render(
    <VisitEditor
      seed={{
        property_id: "park",
        date: "2026-10-01",
        start: "08:07",
        end: "16:20",
      }}
      staff="mercy"
      properties={[
        {
          id: "park",
          name: "502 Park",
          timezone: "America/New_York",
        } as Property,
      ]}
      es={false}
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for this change (required)"), {
    target: { value: "Forgot phone" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(m.rpc).toHaveBeenCalledWith(
    "add_manual_time_entry",
    expect.objectContaining({
      _staff: "mercy",
      _property: "park",
      _in: "2026-10-01T12:07:00.000Z",
      _out: "2026-10-01T20:20:00.000Z",
      _why: "Forgot phone",
    }),
  );
});
