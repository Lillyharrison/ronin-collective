import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { AmazonCartView } from "./AmazonCartButton";

const lib = new Map([["a", { asin: "B000000001" }], ["b", { asin: null, website_url: "https://shop.example/b" }]]);
const lines = [{ library_item_id: "a", name: "Paper towels", quantity: "3" }, { library_item_id: "b", name: "Olive oil" }];

describe("Send to Amazon cart", () => {
  it("button shows how many items can go", () => {
    render(<AmazonCartView lines={lines} lib={lib} house={{ name: "Rockingham", address: "1 Main St" }} />);
    expect(screen.getByText("1 of 2 items have an Amazon code")).toBeTruthy();
  });
  it("dialog shows the house address, checklist, items and a safe Amazon link", () => {
    render(<AmazonCartView lines={lines} lib={lib} house={{ name: "Rockingham", address: "1 Main St" }} />);
    fireEvent.click(screen.getByText("Send to Amazon cart"));
    expect(screen.getByText("Rockingham, 1 Main St")).toBeTruthy();
    expect(screen.getByText("Use only this house's list in one go.")).toBeTruthy();
    expect(screen.getByText(/Empty your Amazon cart first/)).toBeTruthy();
    expect(screen.getByText("Choose the address above at checkout.")).toBeTruthy();
    const open = screen.getByText("Open Amazon with these items").closest("a")!;
    expect(open.getAttribute("href")).toBe("https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B000000001&Quantity.1=3");
    expect(open.getAttribute("rel")).toContain("noopener");
    expect(open.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Link").closest("a")!.getAttribute("href")).toBe("https://shop.example/b");
  });
  it("offers mark-as-placed only after opening Amazon", () => {
    const onMarkPlaced = vi.fn();
    render(<AmazonCartView lines={lines} lib={lib} house={{ name: "R", address: "x" }} onMarkPlaced={onMarkPlaced} />);
    fireEvent.click(screen.getByText("Send to Amazon cart"));
    expect(screen.queryByText(/mark as placed/)).toBeNull();
    fireEvent.click(screen.getByText("Open Amazon with these items"));
    fireEvent.click(screen.getByText(/mark as placed/));
    expect(onMarkPlaced).toHaveBeenCalled();
  });
});
