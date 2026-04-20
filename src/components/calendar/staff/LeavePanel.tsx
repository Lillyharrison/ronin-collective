import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaveCard } from "./LeaveCard";
import type { Profile } from "./types";
import type { StaffLeaveRequest } from "@/hooks/useStaffSchedules";

export function LeavePanel({
  leaveRequests,
  profiles,
  onReview,
  onDelete,
  onNew,
  userId,
  canEdit,
}: {
  leaveRequests: StaffLeaveRequest[];
  profiles: Profile[];
  onReview: (id: string, status: "approved" | "rejected", reviewerId: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onNew: () => void;
  userId: string | null;
  canEdit: boolean;
}) {
  const pending = leaveRequests.filter((r) => r.status === "pending");
  const myRequests = leaveRequests.filter((r) => r.staff_id === userId);
  const adminList = canEdit ? leaveRequests : [];

  return (
    <div className="space-y-3">
      {myRequests.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My Leave Requests</p>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={onNew}>
              <Plus size={11} /> New
            </Button>
          </div>
          {myRequests.map((req) => (
            <LeaveCard
              key={req.id}
              req={req}
              profiles={profiles}
              userId={userId}
              canEdit={false}
              onReview={onReview}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {canEdit && adminList.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            All Leave Requests
            {pending.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px]">
                {pending.length} pending
              </span>
            )}
          </p>
          {adminList.map((req) => (
            <LeaveCard
              key={req.id}
              req={req}
              profiles={profiles}
              userId={userId}
              canEdit={canEdit}
              onReview={onReview}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
