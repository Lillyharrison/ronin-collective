import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

// PDF APIs take points, not CSS pixels. Never convert their numerical font sizes.
const pointFiles = /(?:ExportPDF|exportUtils|schedulePdfExport)\.ts$/;
export function pixelTextViolations(path: string, text: string) {
  return text.split("\n").flatMap((line, index) => {
    if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return [];
    const pixel = /(?:text|leading)-\[[\d.]+px\]|font-size\s*:\s*[\d.]+px|fontSize\s*:\s*["'][\d.]+px["']|lineHeight\s*:\s*["'][\d.]+px["']/;
    const numeric = /fontSize\s*:\s*[\d.]+(?=\s*[,}])/;
    return pixel.test(line) || (!pointFiles.test(path) && numeric.test(line)) ? [`${path}:${index + 1}: use rem for text sizes`] : [];
  });
}
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(tsx?|css)$/.test(path) && !/\.(test|spec)\./.test(path) ? [path] : [];
  });
}
describe("scalable text guard", () => {
  it("no app pixel font sizes, except the explicit 16px input minimum", () => {
    const errors = sources(resolve("src")).flatMap(path => pixelTextViolations(relative(process.cwd(), path), readFileSync(path, "utf8")));
    expect(errors, errors.join("\n")).toEqual([]);
  });
  it.each(['text-[11px]', 'fontSize: 12,', 'font-size: 15px;', 'leading-[18px]'])("reports file and line for %s", code => {
    expect(pixelTextViolations("src/example.tsx", `\n${code}`)).toEqual(["src/example.tsx:2: use rem for text sizes"]);
  });
  it("enforces an effective 13px floor on all arbitrary text sizes", () => {
    const css = readFileSync("src/index.css", "utf8");
    const errors = sources(resolve("src")).flatMap(path => readFileSync(path, "utf8").split("\n").flatMap((line, i) => {
      const styles = [...line.matchAll(/text-\[([\d.]+)rem\]|font-size\s*:\s*([\d.]+)rem|fontSize\s*:\s*["']([\d.]+)rem/g)];
      return styles.flatMap(m => {
        const n = m[1] ?? m[2] ?? m[3];
        // Baseline-owned floor aliases retain behavior-preserving rem conversion and separate rollback.
        return +n >= .8125 || css.includes(`font-size: ${n}rem"] { font-size: 0.8125rem`) || css.includes(`font-size:${n}rem"] { font-size: 0.8125rem`) ? [] : [`${relative(process.cwd(), path)}:${i + 1}: below 13px without a shared floor`];
      });
    }));
    expect(errors, errors.join("\n")).toEqual([]);
  });
});