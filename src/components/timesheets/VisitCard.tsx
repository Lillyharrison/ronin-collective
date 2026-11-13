import { ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type DayLabel, hoursFor, reasonLabels, timeLabel, type Entry } from "./logic";
import { flagSentence, visitPresentation } from "./presentation";

export function visitDate(date: string, es: boolean, long = false) {
  return new Intl.DateTimeFormat(es ? "es" : "en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: long ? "long" : "short" }).format(new Date(`${date}T12:00:00Z`));
}
export function VisitCard({ entry, issued, rounding, es, onOpen, hours, dayLabel }: { entry: Entry; issued: boolean; rounding: number; es: boolean; onOpen: () => void; hours?: number; dayLabel?: DayLabel }) {
  const { tone, actionable, struck } = visitPresentation(entry, issued);
  const reason = reasonLabels.find(r => r[0] === entry.reason)?.[es ? 2 : 1] || entry.reason;
  const content = <>
    <div className={struck ? "min-w-0 flex-1 line-through" : "min-w-0 flex-1"}>
      <div className="flex items-baseline justify-between gap-3 font-medium"><span>{visitDate(entry.visit_date, es)}</span><span className="shrink-0 tabular-nums">{(hours ?? hoursFor(entry, rounding)).toFixed(2)} h</span></div>
      <p className="mt-1 text-sm text-muted-foreground break-words">{timeLabel(entry.clock_in, entry.property?.timezone)} {es ? "a" : "to"} {timeLabel(entry.clock_out, entry.property?.timezone)}, {entry.property?.name || "—"}{reason ? `, ${reason}` : ""}</p>
      {dayLabel && <p className="text-xs text-muted-foreground mt-1">{dayLabel === "full" ? (es ? "Día completo" : "Full day") : (es ? "Mismo día" : "Same day")}</p>}
      {tone === "amber" && <span className="timesheet-warning mt-2"><Info size={14} className="shrink-0" aria-hidden="true" />{flagSentence(entry, es)}</span>}
      {tone === "grey" && <p className="text-sm text-muted-foreground mt-1">{entry.status === "not_worked" ? (es ? "No trabajó" : "Didn't work") : issued ? (es ? "Emitido" : "Issued") : (es ? "Aprobado" : "Approved")}</p>}
    </div>
    {actionable && <ChevronRight size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />}
  </>;
  const className = `timesheet-visit timesheet-visit-${tone}`;
  return actionable ? <Button variant="ghost" className={className} onClick={onOpen} aria-label={`${es ? "Ver visita" : "View visit"}: ${visitDate(entry.visit_date, es)}`}>{content}</Button> : <article className={className}>{content}</article>;
}