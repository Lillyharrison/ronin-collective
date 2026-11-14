import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEarlyTextSize, applyTextSize, cachedTextSize, detectDeviceTextScale, normalizeTextSize, textSizeScale, TEXT_SIZE_CACHE } from "./textSize";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe("device text detection", () => {
  it("returns 1 without probing non-iOS", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
    const style = vi.spyOn(window, "getComputedStyle");
    expect(detectDeviceTextScale()).toBe(1); expect(style).not.toHaveBeenCalled();
  });
  it.each([[17, 1], [20.4, 1.2], [10, 1], [40, 1.5], [NaN, 1]])("reads iOS %s and clamps to %s", (font, expected) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
    vi.spyOn(window, "getComputedStyle").mockImplementation(element => {
      expect(element.getAttribute("aria-hidden")).toBe("true");
      return { fontSize: `${font}px` } as CSSStyleDeclaration;
    });
    expect(detectDeviceTextScale()).toBeCloseTo(expected);
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });
  it("detects iPadOS desktop user agent", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari Macintosh");
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 5 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ fontSize: "23.8px" } as CSSStyleDeclaration);
    expect(detectDeviceTextScale()).toBeCloseTo(1.4);
    Reflect.deleteProperty(navigator, "maxTouchPoints");
  });
});
describe("text size mapping and immediate cache", () => {
  it.each([["normal", 1], ["large", 1.2], ["xlarge", 1.4], ["auto", 1.3]] as const)("maps %s", (size, scale) => expect(textSizeScale(size, 1.3)).toBe(scale));
  it("applies persisted cache before profiles load", () => {
    localStorage.setItem(TEXT_SIZE_CACHE, "xlarge"); applyEarlyTextSize();
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.4");
  });
  it("keeps user caches separate", () => {
    applyTextSize("large", "person-a"); applyTextSize("normal", "person-b");
    expect(cachedTextSize("person-a")).toBe("large"); expect(cachedTextSize("person-b")).toBe("normal");
  });
  it("ignores invalid settings and tolerates blocked cache", () => {
    expect(normalizeTextSize("bad")).toBe("auto");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => applyTextSize("large")).not.toThrow();
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.2");
  });
});