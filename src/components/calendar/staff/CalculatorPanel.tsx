import type { RosterStats } from "./types";

export function CalculatorPanel({
  personName,
  stats,
}: {
  personName: string;
  stats: RosterStats;
}) {
  const leaveRemaining = Math.max(0, stats.leaveAllowance - stats.leaveTakenYTD);
  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="flex-1 min-w-[120px] rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-muted/10 px-3 py-2.5 mb-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
        {personName} · This month
      </p>
      <div className="flex flex-wrap gap-2">
        <Stat
          label="Days worked"
          value={`${stats.daysWorked} / ${stats.daysExpected}`}
          sub={stats.daysExpected > 0 ? `${Math.round((stats.daysWorked / stats.daysExpected) * 100)}%` : undefined}
        />
        <Stat
          label="Hours worked"
          value={`${stats.hoursWorked.toFixed(1)} / ${stats.hoursExpected.toFixed(0)}`}
        />
        <Stat
          label="Annual leave"
          value={`${leaveRemaining} left`}
          sub={`${stats.leaveTakenYTD} taken of ${stats.leaveAllowance}`}
        />
      </div>
    </div>
  );
}
