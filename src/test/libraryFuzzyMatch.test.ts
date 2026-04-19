import { describe, it, expect } from "vitest";
import {
  findLibraryMatches,
  scoreCandidate,
  tierFor,
  type LibraryMatchCandidate,
} from "@/lib/libraryFuzzyMatch";

const lib: LibraryMatchCandidate[] = [
  { id: "1", name: "San Pellegrino Sparkling Water 750ml", search_aliases: ["pellegrino", "san pelle", "sparkling water"] },
  { id: "2", name: "Acqua Panna Still Water 1L", search_aliases: ["panna", "still water"] },
  { id: "3", name: "Method Hand Soap — Sea Minerals", search_aliases: ["hand soap", "method soap"] },
  { id: "4", name: "Bounty Paper Towels 12-pack", search_aliases: ["paper towels", "kitchen roll"] },
  { id: "5", name: "Maldon Sea Salt Flakes", search_aliases: ["maldon", "sea salt"] },
];

describe("scoreCandidate", () => {
  it("scores exact name match as 1.0", () => {
    expect(scoreCandidate("San Pellegrino Sparkling Water 750ml", lib[0]).score).toBe(1);
  });

  it("scores exact alias match very high", () => {
    expect(scoreCandidate("pellegrino", lib[0]).score).toBeGreaterThanOrEqual(0.95);
  });

  it("scores substring containment in auto-tier", () => {
    expect(scoreCandidate("hand soap", lib[2]).score).toBeGreaterThanOrEqual(0.8);
  });

  it("returns 0 for empty query", () => {
    expect(scoreCandidate("", lib[0]).score).toBe(0);
  });
});

describe("findLibraryMatches", () => {
  it("finds the right item for an exact alias", () => {
    const r = findLibraryMatches("panna", lib);
    expect(r[0]?.item.id).toBe("2");
    expect(tierFor(r[0].score)).toBe("auto");
  });

  it("returns a confirm-tier result for a fuzzy/typo query", () => {
    const r = findLibraryMatches("pellegrino water", lib);
    expect(r[0]?.item.id).toBe("1");
    expect(["auto", "confirm"]).toContain(tierFor(r[0].score));
  });

  it("orders results by score descending", () => {
    const r = findLibraryMatches("water", lib);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it("respects limit", () => {
    const r = findLibraryMatches("water", lib, { limit: 1 });
    expect(r.length).toBeLessThanOrEqual(1);
  });

  it("returns no matches below minScore threshold", () => {
    const r = findLibraryMatches("zzzzzzzzzzz nonsense xyz", lib, { minScore: 0.5 });
    expect(r.length).toBe(0);
  });
});

describe("tierFor", () => {
  it("classifies tiers correctly", () => {
    expect(tierFor(0.95)).toBe("auto");
    expect(tierFor(0.8)).toBe("auto");
    expect(tierFor(0.65)).toBe("confirm");
    expect(tierFor(0.5)).toBe("confirm");
    expect(tierFor(0.3)).toBe("none");
  });
});
