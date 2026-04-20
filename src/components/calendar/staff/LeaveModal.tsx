import { useEffect, useState } from "react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { AlertCircle, Clock, PlaneTakeoff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StaffLeaveRequest } from "@/hooks/useStaffSchedules";
import { LEAVE_TYPES, LEAVE_TYPE_CONFIG } from "./constants";
import { calcWorkdays, getDisplayName } from "./utils";
import type { Profile } from "./types";

export function LeaveModal({
  open,
  onClose,
  onSave,
  profiles,
  userId,
  canEdit,
  prefillStart,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<StaffLeaveRequest, "id" | "created_at" | "updated_at">) => Promise<boolean>;
  profiles: Profile[];
  userId: string | null;
  canEdit: boolean;
  prefillStart?: string;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({
    staff_id: userId ?? "",
    start_date: prefillStart ?? today,
    end_date: prefillStart ?? today,
    leave_type: "vacation",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        staff_id: userId ?? "",
        start_date: prefillStart ?? today,
        end_date: prefillStart ?? today,
        leave_type: "vacation",
        reason: "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, prefillStart]);

  if (!open) return null;

  const workdays = calcWorkdays(form.start_date, form.end_date);
  const totalDays = form.start_date && form.end_date
    ? differenceInCalendarDays(parseISO(form.end_date), parseISO(form.start_date)) + 1
    : 0;
  const typeConfig = LEAVE_TYPE_CONFIG[form.leave_type] ?? LEAVE_TYPE_CONFIG.other;
  const endMin = form.start_date;
  const isValid = !!form.staff_id && !!form.start_date && !!form.end_date && form.end_date >= form.start_date;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    const ok = await onSave({
      staff_id: form.staff_id,
      start_date: form.start_date,
      end_date: form.end_date,
      leave_type: form.leave_type,
      reason: form.reason.trim() || null,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      created_by: userId,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-base">
              <PlaneTakeoff size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-none">Request Time Off</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Submit a leave request for review</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Admin: staff picker */}
          {canEdit && (
            <div className="space-y-1.5">
              <Label>Staff Member</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm((f) => ({ ...f, staff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{getDisplayName(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Leave type grid */}
          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {LEAVE_TYPES.map((t) => {
                const cfg = LEAVE_TYPE_CONFIG[t];
                return (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, leave_type: t }))}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all text-left",
                      form.leave_type === t
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50"
                    )}
                  >
                    <span className="text-base">{cfg.emoji}</span>
                    <span className="truncate">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div className="space-y-1.5">
            <Label>Date Range</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">From</p>
                <Input
                  type="date"
                  value={form.start_date}
                  min={today}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      start_date: v,
                      end_date: f.end_date < v ? v : f.end_date,
                    }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">To</p>
                <Input
                  type="date"
                  value={form.end_date}
                  min={endMin}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Duration summary */}
          {totalDays > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted-foreground" />
                <span className="text-sm text-foreground font-medium">
                  {totalDays === 1 ? "1 day" : `${totalDays} days`}
                </span>
                {workdays !== totalDays && (
                  <span className="text-xs text-muted-foreground">({workdays} working)</span>
                )}
              </div>
              <span className={cn("text-sm", typeConfig.color)}>
                {typeConfig.emoji} {typeConfig.label}
              </span>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>
              Reason <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              rows={3}
              className="resize-none"
              placeholder="Any details you'd like to share with your manager…"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>

          {/* Info notice */}
          <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <AlertCircle size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Your request will be sent to management for review. You'll see the status update in the leave panel below the schedule.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 gap-2" disabled={saving || !isValid} onClick={handleSave}>
            {saving ? "Submitting…" : (
              <>
                <PlaneTakeoff size={14} />
                Submit Request
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
