import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ add: false, manage: false }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ userId: "tester", isAdmin: false, isMasterAdmin: false, isManager: true, isFamily: false, assignedPropertyIds: [], loading: false, canAdd: () => m.add, canEdit: () => m.manage }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", t: (key: string) => key }) }));
vi.mock("@/contexts/NavigationContext", () => ({ useNavigation: () => ({ pendingTaskIdRef: { current: null }, pendingMaintenanceIssueIdRef: { current: null }, pendingPlannedMaintenanceEntryIdRef: { current: null }, setPendingTaskId: vi.fn(), registerBackHandler: vi.fn() }) }));
vi.mock("@/hooks/useAssignableProfileIds", () => ({ useAssignableProfileIds: () => null }));
vi.mock("@/hooks/useMaintenanceIssues", () => ({ useMaintenanceIssues: () => ({ issues: [], categories: [], loading: false, fetchIssues: vi.fn() }) }));
vi.mock("@/hooks/usePlannedMaintenance", () => ({ usePlannedMaintenance: () => ({ entries: [], loading: false, refetch: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => {
  const q: any = new Proxy(function () {}, { get: (_t, k) => k === "then" ? (resolve: any) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve) : () => q, apply: () => q });
  return { supabase: { from: () => q, channel: () => q, removeChannel: vi.fn() } };
});
import { MaintenanceSection } from "./MaintenanceSection";
import { TasksSection } from "./TasksSection";
import { FamilyTasksView } from "@/components/tasks/FamilyTasksView";
afterEach(() => { cleanup(); m.add = false; m.manage = false; localStorage.clear(); });
it("manager without Add cannot report from Maintenance; Add makes reporting available", () => {
  const view = render(<MaintenanceSection />);
  expect(screen.queryByRole("button", { name: "reportButton" })).toBeNull();
  m.add = true; view.rerender(<MaintenanceSection />);
  expect(screen.getByRole("button", { name: "reportButton" })).toBeTruthy();
});
it("manager without Add has no New task; Add offers it without Manage", () => {
  const view = render(<TasksSection />);
  expect(screen.queryByRole("button", { name: "New" })).toBeNull();
  m.add = true; view.rerender(<TasksSection />);
  expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
});
it("family sending requires Add, independent of Manage", () => {
  const view = render(<FamilyTasksView />);
  expect(screen.queryByRole("button", { name: "Send task" })).toBeNull();
  m.add = true; view.rerender(<FamilyTasksView />);
  expect(screen.getByRole("button", { name: "Send task" })).toBeTruthy();
});