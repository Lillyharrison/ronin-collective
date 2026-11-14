import { describe, expect, it } from "vitest";
import config from "../../tailwind.config";
import { buttonVariants } from "@/components/ui/button";
import { readFileSync } from "node:fs";

describe("baseline readability tokens", () => {
  it("sets 13px xs and 15px sm without changing headings", () => {
    expect(config.theme.extend.fontSize.xs).toEqual(["0.8125rem", { lineHeight: "1.2rem" }]);
    expect(config.theme.extend.fontSize.sm).toEqual(["0.9375rem", { lineHeight: "1.4rem" }]);
  });
  it.each([["default", "h-11"], ["sm", "h-10"], ["lg", "h-12"], ["icon", "h-11 w-11"]] as const)("gives %s buttons the approved size", (size, token) => {
    expect(buttonVariants({ size })).toContain(token);
    expect(buttonVariants({ size })).toContain("size-[1.125rem]");
  });
  it.each(["input", "textarea", "select"])("keeps %s at least 2.75rem tall", name => {
    expect(readFileSync(`src/components/ui/${name}.tsx`, "utf8")).toContain("min-h-11");
  });
  it("secondary text meets contrast requirements in both themes", () => {
    const css = readFileSync("src/index.css", "utf8");
    const rgb = (h: number, s: number, l: number) => {
      const a = s * Math.min(l, 1 - l);
      return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
    };
    const lum = (values: number[]) => values.reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const matches = [...css.matchAll(/--muted-foreground:\s*(\d+)\s+([\d.]+)%\s+([\d.]+)%/g)];
    const colors = matches.map(m => rgb(+m[1], +m[2] / 100, +m[3] / 100));
    expect(contrast(colors[0], rgb(38, .35, .94))).toBeGreaterThanOrEqual(6);
    expect(contrast(colors[0], rgb(0, 0, 1))).toBeGreaterThanOrEqual(6);
    expect(contrast(colors[1], rgb(220, .13, .10))).toBeGreaterThanOrEqual(4.5);
  });
});