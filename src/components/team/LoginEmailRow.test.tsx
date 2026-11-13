import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginEmailRow, canChangeLoginEmail } from "./LoginEmailRow";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "admin" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
function show(isEN = true) { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LoginEmailRow userId="person" isEN={isEN} /></QueryClientProvider>); }
describe("login email editor", () => {
  it("is visible only for admin editing a non-draft non-master target", () => { expect(canChangeLoginEmail(true, false, "staff")).toBe(true); expect(canChangeLoginEmail(true, true, "staff")).toBe(false); expect(canChangeLoginEmail(true, false, "master_admin")).toBe(false); expect(canChangeLoginEmail(false, false, "staff")).toBe(false); });
  it("requires consent before changing and refreshes mask after success", async () => {
    invoke.mockImplementation((_name, { body }) => Promise.resolve({ data: body.action === "current" ? { masked_email: "h***o@x.com" } : { ok: true, emailSent: true }, error: null }));
    show(); fireEvent.click(await screen.findByRole("button", { name: "Change email" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New email" }), { target: { value: "new@x.com" } });
    const buttons = screen.getAllByRole("button", { name: "Change email" }); const submit = buttons[buttons.length - 1];
    expect(submit).toBeDisabled(); fireEvent.click(screen.getByRole("checkbox", { name: "I understand" })); expect(submit).toBeEnabled(); fireEvent.click(submit);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("admin-change-email", { body: { user_id: "person", new_email: "new@x.com" } }));
    await waitFor(() => expect(screen.queryByRole("checkbox")).not.toBeInTheDocument());
  });
  it("does not display controls for profiles without a login", async () => { invoke.mockResolvedValue({ data: null, error: { message: "This person has no login." } }); show(); await waitFor(() => expect(invoke).toHaveBeenCalled()); expect(screen.queryByRole("button", { name: "Change email" })).not.toBeInTheDocument(); });
  it("provides Spanish consent", async () => { invoke.mockResolvedValue({ data: { masked_email: "a***b@x.com" }, error: null }); show(false); fireEvent.click(await screen.findByRole("button", { name: "Cambiar correo" })); expect(screen.getByRole("checkbox", { name: "Entiendo" })).not.toBeChecked(); });
});