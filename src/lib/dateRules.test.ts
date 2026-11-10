import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const rule = "Task due_date and repair scheduled_date are plain DATE keys; parse their parts and use local/house date keys for today, never UTC timestamp slicing.";
// These files' scheduled_date values belong ONLY to planned jobs, not repairs.
const plannedOnly = new Set([
  "src/components/maintenance/PlannedMaintenanceList.tsx",
  "src/components/maintenance/PlannedMaintenanceModal.tsx",
  "src/components/maintenance/plannedExportPDF.ts",
  "supabase/functions/planned-maintenance-reminder/index.ts",
  "src/lib/maintenanceNotifications.ts",
]);
// Explicit real-moment/UTC interval operations, not viewer-local "today".
const utcOperations: Record<string, string[]> = {
  "src/components/clock/ClockCard.tsx": ["new Date(now.getTime()-86400000).toISOString().slice(0,10)", "new Date(now.getTime()+86400000).toISOString().slice(0,10)"],
  "supabase/functions/time-tracking-reminders/index.ts": ["new Date(now.getTime()-86400000).toISOString().slice(0,10)", "new Date(now.getTime()+86400000).toISOString().slice(0,10)"],
  "supabase/functions/time-tracking-reminders/logic.ts": ["new Date(Date.parse(`${date}T12:00:00Z`)+86400000).toISOString().slice(0,10)", "new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,10)"],
  "supabase/functions/staff-schedule-share-get/index.ts": ["d.toISOString().slice(0, 10)"], // UTC date arithmetic
  "supabase/functions/staff-schedule-share-mutate/index.ts": ["d.toISOString().slice(0, 10)"],
  "src/components/timesheets/logic.ts": ["d.toISOString().slice(0, 10)", "now.toISOString().slice(0, 10)", "new Date(Date.parse(`${monthShift(period, 1)}T00:00:00Z`) - 86400000)\n    .toISOString()\n    .slice(0, 10)"], // UTC period arithmetic/issue cutoff, not task/repair today
};
function violations(path: string, text: string) {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const errors: string[] = [];
  const add = (node: ts.Node) => errors.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${rule}`);
  function visit(node: ts.Node) {
    if ((ts.isNewExpression(node) && node.expression.getText(file) === "Date") ||
        (ts.isCallExpression(node) && /(?:^|\.)parseISO$/.test(node.expression.getText(file)))) {
      if (node.arguments?.some(arg => /\bdue_date\b/.test(arg.getText(file)) || (!plannedOnly.has(path) && /\bscheduled_date\b/.test(arg.getText(file))))) add(node);
    }
    if (ts.isCallExpression(node) && /\.toISOString\(\)\s*\.slice\(0,\s*10\)$/.test(node.getText(file))) {
      if (!utcOperations[path]?.includes(node.getText(file))) add(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return errors;
}
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(path) && !/\.(test|spec)\./.test(path) ? [path] : [];
  });
}
describe("plain DATE source guard", () => {
  it("all app and edge source respects DATE parsing and today rules", () => {
    const errors = ["src", "supabase/functions"].flatMap(dir => sources(resolve(dir)))
      .flatMap(path => violations(relative(process.cwd(), path), readFileSync(path, "utf8")));
    expect(errors, errors.join("\n")).toEqual([]);
  });
  it.each(["new Date(task.due_date)", "parseISO(issue.scheduled_date)", "new Date().toISOString().slice(0, 10)"])("rejects %s with file and line", code => {
    expect(violations("src/example.ts", `\nconst value = ${code};`)[0]).toContain("src/example.ts:2:");
  });
  it("permits calendar real instants", () => {
    expect(violations("src/example.ts", "const value = new Date(event.start_date);")).toEqual([]);
  });
});
