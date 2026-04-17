import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, endOfWeek } from "date-fns";
import { toast } from "sonner";

export interface StaffSchedule {
  id: string;
  staff_id: string;
  property_id: string | null;
  day_of_week: number; // 0=Sun … 6=Sat
  start_time: string;  // "09:00:00"
  end_time: string;    // "17:00:00"
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
}

export interface StaffShift {
  id: string;
  staff_id: string;
  property_id: string | null;
  schedule_id: string | null;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string; // scheduled | cancelled | leave
  notes: string | null;
  created_by: string | null;
}

export interface StaffLeaveRequest {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string | null;
  status: string; // pending | approved | rejected
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string | null;
}

export function useStaffSchedules(
  weekStart: Date,
  currentUserId?: string | null,
  canEdit?: boolean,
  /** Optional explicit end date — pass endOfMonth for month view */
  endDateOverride?: Date
) {
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<StaffLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const weekEnd = endDateOverride ?? endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  // Staff (non-admin) only see their own shifts/schedules/leave
  const isAdmin = canEdit === true;

  const fetchData = useCallback(async () => {
    setLoading(true);

    let schedulesQuery = supabase
      .from("staff_schedules")
      .select("id, staff_id, property_id, day_of_week, start_time, end_time, effective_from, effective_to, is_active, notes")
      .eq("is_active", true)
      .lte("effective_from", weekEndStr)
      .or(`effective_to.is.null,effective_to.gte.${weekStartStr}`)
      .limit(500);

    let shiftsQuery = supabase
      .from("staff_shifts")
      .select("id, staff_id, schedule_id, property_id, shift_date, start_time, end_time, status, notes")
      .gte("shift_date", weekStartStr)
      .lte("shift_date", weekEndStr)
      .limit(500);

    let leaveQuery = supabase
      .from("staff_leave_requests")
      .select("id, staff_id, start_date, end_date, leave_type, status, reason, reviewed_at, reviewed_by, created_by, created_at")
      .lte("start_date", weekEndStr)
      .gte("end_date", weekStartStr)
      .limit(500);

    // Non-admins only see their own data
    if (!isAdmin && currentUserId) {
      schedulesQuery = schedulesQuery.eq("staff_id", currentUserId) as typeof schedulesQuery;
      shiftsQuery = shiftsQuery.eq("staff_id", currentUserId) as typeof shiftsQuery;
      leaveQuery = leaveQuery.eq("staff_id", currentUserId) as typeof leaveQuery;
    }

    const [schedulesRes, shiftsRes, leaveRes] = await Promise.all([
      schedulesQuery,
      shiftsQuery,
      leaveQuery,
    ]);
    setSchedules((schedulesRes.data as StaffSchedule[]) ?? []);
    setShifts((shiftsRes.data as StaffShift[]) ?? []);
    setLeaveRequests((leaveRes.data as StaffLeaveRequest[]) ?? []);
    setLoading(false);
  }, [weekStartStr, weekEndStr, isAdmin, currentUserId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Schedules ────────────────────────────────────────────────────────────────

  const createSchedule = async (
    data: Omit<StaffSchedule, "id" | "created_at" | "updated_at">
  ) => {
    const { error } = await supabase.from("staff_schedules").insert(data as never);
    if (error) { toast.error("Failed to create schedule"); return false; }
    toast.success("Recurring schedule created");
    await fetchData();
    return true;
  };

  /** Editing a recurring schedule: close the old one and create a new one
   *  so only future weeks are affected. */
  const editSchedule = async (
    oldId: string,
    newData: Omit<StaffSchedule, "id" | "created_at" | "updated_at">
  ) => {
    const yesterday = format(
      new Date(Date.now() - 86400000),
      "yyyy-MM-dd"
    );
    const { error: closeErr } = await supabase
      .from("staff_schedules")
      .update({ effective_to: yesterday, is_active: false })
      .eq("id", oldId);
    if (closeErr) { toast.error("Failed to update schedule"); return false; }
    const { error: createErr } = await supabase
      .from("staff_schedules")
      .insert({ ...newData, effective_from: format(new Date(), "yyyy-MM-dd") } as never);
    if (createErr) { toast.error("Failed to create updated schedule"); return false; }
    toast.success("Schedule updated — future shifts adjusted, past shifts unchanged");
    await fetchData();
    return true;
  };

  /** Update a recurring schedule in-place (affects all past + future occurrences). */
  const updateSchedule = async (id: string, data: Partial<StaffSchedule>) => {
    const { error } = await supabase.from("staff_schedules").update(data as never).eq("id", id);
    if (error) { toast.error("Failed to update schedule"); return false; }
    toast.success("Recurring schedule updated");
    await fetchData();
    return true;
  };


  const deactivateSchedule = async (id: string) => {
    const { error } = await supabase
      .from("staff_schedules")
      .update({ effective_to: format(new Date(), "yyyy-MM-dd"), is_active: false })
      .eq("id", id);
    if (error) { toast.error("Failed to deactivate schedule"); return false; }
    toast.success("Schedule deactivated — future shifts removed");
    await fetchData();
    return true;
  };

  // ── Shifts ───────────────────────────────────────────────────────────────────

  const createShift = async (
    data: Omit<StaffShift, "id" | "created_at" | "updated_at">
  ) => {
    const { error } = await supabase.from("staff_shifts").insert(data as never);
    if (error) { toast.error("Failed to add shift"); return false; }
    toast.success("Shift added");
    await fetchData();
    return true;
  };

  const updateShift = async (id: string, data: Partial<StaffShift>) => {
    const { error } = await supabase.from("staff_shifts").update(data as never).eq("id", id);
    if (error) { toast.error("Failed to update shift"); return false; }
    await fetchData();
    return true;
  };

  const deleteShift = async (id: string) => {
    const { error } = await supabase.from("staff_shifts").delete().eq("id", id);
    if (error) { toast.error("Failed to delete shift"); return false; }
    toast.success("Shift removed");
    await fetchData();
    return true;
  };

  // ── Leave Requests ───────────────────────────────────────────────────────────

  const submitLeaveRequest = async (
    data: Omit<StaffLeaveRequest, "id" | "created_at" | "updated_at">
  ) => {
    const { error } = await supabase.from("staff_leave_requests").insert(data as never);
    if (error) { toast.error("Failed to submit leave request"); return false; }
    toast.success("Leave request submitted");
    await fetchData();
    return true;
  };

  const reviewLeaveRequest = async (
    id: string,
    status: "approved" | "rejected",
    reviewerId: string
  ) => {
    const { error } = await supabase
      .from("staff_leave_requests")
      .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) { toast.error("Failed to review request"); return false; }
    toast.success(status === "approved" ? "Leave approved" : "Leave rejected");
    await fetchData();
    return true;
  };

  const deleteLeaveRequest = async (id: string) => {
    const { error } = await supabase.from("staff_leave_requests").delete().eq("id", id);
    if (error) { toast.error("Failed to delete leave request"); return false; }
    toast.success("Leave request removed");
    await fetchData();
    return true;
  };

  return {
    schedules,
    shifts,
    leaveRequests,
    loading,
    refetch: fetchData,
    createSchedule,
    editSchedule,
    updateSchedule,
    deactivateSchedule,
    createShift,
    updateShift,
    deleteShift,
    submitLeaveRequest,
    reviewLeaveRequest,
    deleteLeaveRequest,
  };
}
