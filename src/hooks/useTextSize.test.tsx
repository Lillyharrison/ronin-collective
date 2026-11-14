import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const update = vi.fn(); const eq = vi.fn();
let stored = "normal"; let fail = false;
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "self" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { text_size: stored }, error: null }) }) }),
  update: (value: { text_size: string }) => { update(value); return { eq: async (...args: unknown[]) => { eq(...args); if (!fail) stored = value.text_size; return { error: fail ? new Error("offline") : null }; } }; },
}) } }));
import { TextSizeProvider, useTextSize } from "./useTextSize";
function Consumer() {
  const { size, ready, save } = useTextSize();
  return <button disabled={!ready} onClick={() => { void save("xlarge").catch(() => {}); }}>{size}</button>;
}
function show() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TextSizeProvider><Consumer /></TextSizeProvider></QueryClientProvider>); }
beforeEach(() => { stored = "normal"; fail = false; update.mockClear(); eq.mockClear(); localStorage.clear(); });
describe("persisted text size", () => {
  it("loads the profile, saves only own id, and reads back", async () => {
    show(); fireEvent.click(await screen.findByRole("button", { name: "normal" }));
    await screen.findByRole("button", { name: "xlarge" });
    expect(update).toHaveBeenCalledWith({ text_size: "xlarge" }); expect(eq).toHaveBeenCalledWith("id", "self");
    expect(localStorage.getItem("ronin:text-size:self")).toBe("xlarge");
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.4");
  });
  it("restores the confirmed setting on failure", async () => {
    fail = true; show(); fireEvent.click(await screen.findByRole("button", { name: "normal" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1"));
    expect(screen.getByRole("button")).toHaveTextContent("normal");
  });
  it("reapplies the scale on focus and visibility", async () => {
    stored = "large"; show(); await screen.findByRole("button", { name: "large" });
    document.documentElement.style.setProperty("--text-scale", "1"); fireEvent.focus(window);
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.2");
    document.documentElement.style.setProperty("--text-scale", "1"); fireEvent(document, new Event("visibilitychange"));
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.2");
  });
});