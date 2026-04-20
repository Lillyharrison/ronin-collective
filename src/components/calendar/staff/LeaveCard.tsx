import { differenceInCalendarDays, parseISO } from "date-fns";
import { Check, Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StaffLeaveRequest } from "@/hooks/useStaffSchedules";
import { LEAVE_TYPE_CONFIG } from "./constants";
import { calcWorkdays, getDisplayName } from "./utils";
import type { Profile } from "./types";

export function LeaveCard({
  req,
  profiles,
  userId,
  canEdit,
  onReview,
  onDelete,
}: {
  req: StaffLeaveRequest;
  profiles: Profile[];
  userId: string | null;
  canEdit: boolean;
  onReview: (id: string, status: "approved" | "rejected", reviewerId: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const person = profiles.find((p) => p.id === req.staff_id);
  const typeConfig = LEAVE_TYPE_CONFIG[req.leave_type] ?? LEAVE_TYPE_CONFIG.other;
  const workdays = calcWorkdays(req.start_date, req.end_date);
  const totalDays = differenceInCalendarDays(parseISO(req.end_date), parseISO(req.start_date)) + 1;

  const statusStyle = {
    pending:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
    approved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    rejected: "text-red-400 bg-red-500/10 border-red-500/20",
  }[req.status] ?? "";

  const statusIcon = {
    pending:  <Clock size={10} />,
    approved: <Check size={10} />,
    rejected: <X size={10} />,
  }[req.status];

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-start gap-2.5 justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl flex-shrink-0">{typeConfig.emoji}</span>
          <div className="min-w-0">
            {canEdit && (
              <p className="text-xs font-semibold truncate text-foreground">{getDisplayName(person, "Staff")}</p>
            )}
            <p className={cn("text-sm font-medium capitalize", typeConfig.color)}>{typeConfig.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {req.start_date === req.end_date
                ? req.start_date
                : `${req.start_date} – ${req.end_date}`}
              {" · "}
              {totalDays === 1 ? "1 day" : `${workdays} working days`}
            </p>
            {req.reason && (
              <p className="text-xs text-muted-foreground italic mt-0.5">"{req.reason}"</p>
            )}
          </div>
        </div>
        <span className={cn("flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize flex-shrink-0", statusStyle)}>
          {statusIcon}
          {req.status}
        </span>
      </div>

      {canEdit && req.status === "pending" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
            onClick={() => userId && onReview(req.id, "approved", userId)}
          >
            <Check size={12} /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={() => userId && onReview(req.id, "rejected", userId)}
          >
            <X size={12} /> Reject
          </Button>
        </div>
      )}

      {(req.staff_id === userId || canEdit) && req.status !== "approved" && (
        <button
          onClick={() => onDelete(req.id)}
          className="text-xs text-destructive/70 hover:text-destructive transition-colors flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-destructive/10 min-h-[36px]"
        >
          <Trash2 size={13} /> Withdraw request
        </button>
      )}
    </div>
  );
}
