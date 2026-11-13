import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { clockTileState, runningTime, showClockTile } from "./clockTile";

const m = vi.hoisted(() => ({ status: null as unknown, requested: false, setRequested: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/contexts/NavigationContext", () => ({ useNavigation: () => ({ clockSheetRequested: m.requested, setClockSheetRequested: m.setRequested, registerBackHandler: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: () => Promise.resolve({ data: m.status, error: null }) } }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("./ClockCard", () => ({ ClockCard: () => <div data-testid="clock-flow" /> }));
import { ClockQuickAction } from "./ClockQuickAction";

const base = { enabled: true, open: null, visits: [], properties: [], now: new Date().toISOString() };
function show(qa: string[] | null, path = "/") {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><ClockQuickAction quickActions={qa} es={false} /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { m.status = base; m.requested = false; m.setRequested.mockClear(); });

describe("clock tile", () => {
  it("only shows with 'clock' and clocking enabled", () => {
    expect(showClockTile(["clock"], base)).toBe(true);
    expect(showClockTile(["tasks"], base)).toBe(false);
    expect(showClockTile(["clock"], { ...base, enabled: false })).toBe(false);
    expect(showClockTile(null, base)).toBe(false);
  });
  it("three states", () => {
    expect(clockTileState(base)).toBe("idle");
    expect(clockTileState({ ...base, open: { entry_id: "e", clock_in: "2026-01-01T08:00:00Z", property_id: "p", property_name: "P", visit_date: "2026-01-01" } })).toBe("open");
    expect(clockTileState({ ...base, visits: [{ property_id: "p", property_name: "P", start_time: "08:00", end_time: "12:00", visit_date: "2026-01-01", done: true }] })).toBe("done");
    expect(runningTime("2026-01-01T08:00:00Z", new Date("2026-01-01T10:15:00Z"), false)).toBe("2h 15m");
    expect(runningTime("2026-01-01T08:00:00Z", new Date("2026-01-01T10:15:00Z"), true)).toBe("2 h 15 min");
  });
  it("renders nothing without the shortcut", async () => {
    show(["tasks"]);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByTestId("clock-tile")).toBeNull();
  });
  it("tap opens the clock sheet", async () => {
    show(["clock"]);
    fireEvent.click(await screen.findByTestId("clock-tile"));
    expect(await screen.findByTestId("clock-flow")).toBeTruthy();
  });
  it("a clock reminder opens the sheet automatically", async () => {
    m.requested = true;
    show(["clock"]);
    expect(await screen.findByTestId("clock-flow")).toBeTruthy();
    await waitFor(() => expect(m.setRequested).toHaveBeenCalledWith(false));
  });
  it("the push link ?clock=1 opens the sheet", async () => {
    show(["clock"], "/?clock=1");
    expect(await screen.findByTestId("clock-flow")).toBeTruthy();
  });
});
