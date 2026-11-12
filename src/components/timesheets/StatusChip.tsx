import { Check } from "lucide-react";

export function StatusChip({ status, count = 0, paidDate, es }: { status: "review" | "ready" | "issued" | "paid"; count?: number; paidDate?: string | null; es: boolean }) {
  const label = status === "review" ? `${count} ${es ? "por revisar" : "to review"}` : status === "ready" ? (es ? "Listo para emitir" : "Ready to issue") : status === "issued" ? (es ? "Emitido" : "Issued") : `${es ? "Pagado" : "Paid"}${paidDate ? ` ${paidDate}` : ""}`;
  return <span className={`timesheet-status timesheet-status-${status}`}>{status === "issued" && <Check size={14} aria-hidden="true" />}{label}</span>;
}