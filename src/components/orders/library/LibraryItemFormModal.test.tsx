import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
vi.mock("@/hooks/useScopedProperties", () => ({ useScopedProperties: () => ({ properties: [] }) }));
vi.mock("@/hooks/useOrderLibrary", () => ({ useOrderLibrary: () => ({ createItem: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn(), uploadImage: vi.fn() }) }));
import { LibraryItemFormModal } from "./LibraryItemFormModal";

describe("library editor Amazon code", () => {
  it("fills from a pasted Amazon link, and validates hand edits", () => {
    render(<LibraryItemFormModal open item={null} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("https://…"), { target: { value: "https://www.amazon.com/x/dp/B07XJ8C8F5?ref=a" } });
    const asin = screen.getByLabelText("Amazon code (ASIN)") as HTMLInputElement;
    expect(asin.value).toBe("B07XJ8C8F5");
    fireEvent.change(asin, { target: { value: "abc" } });
    expect(asin.value).toBe("ABC");
    expect(screen.getByText("Must be 10 letters or digits.")).toBeTruthy();
  });
});
