import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const save = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/useTextSize", () => ({ useTextSize: () => ({ size: "large", saving: false, ready: true, save }) }));
let language = "en";
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language }) }));
import { TextSizeControl } from "./TextSizeControl";
describe("text size controls", () => {
  it("opens Aa options and persists chosen size", async () => {
    render(<TextSizeControl />);
    fireEvent.click(screen.getByRole("button", { name: "Text size" }));
    expect(screen.getByRole("button", { name: /Large$/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Extra large/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("xlarge"));
  });
  it("offers all four choices on own Profile in Spanish", () => {
    language = "es"; render(<TextSizeControl profile />);
    expect(screen.getByRole("group", { name: "Tamaño del texto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Automático \(igual que mi teléfono\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Muy grande/ })).toBeInTheDocument();
    language = "en";
  });
});