import { supabase } from "@/integrations/supabase/client";
import type { Entry, Timesheet } from "./logic";
// Owner-deployed RPCs/tables may precede the generated client types.
export const db = supabase as any;
export async function result<T>(
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const r = await query;
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
export async function allRows<T>(
  make: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[]; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 200) {
    const page = await result(make(from, from + 199));
    rows.push(...page);
    if (page.length < 200) return rows;
  }
}
export const sheetColumns =
  "id,staff_id,period_start,period_end,version,status,payee_name,hourly_rate,pay_basis,day_rate,days_paid,currency,rounding_minutes,total_hours,hours_amount,adjustments_amount,total_amount,lines,file_path,issued_at,issued_by,paid_on,supersedes_id,reopen_reason";
export const entryColumns =
  "id,staff_id,property_id,visit_date,scheduled_start,scheduled_end,clock_in,clock_out,adj_in,adj_out,adj_reason,flags,reason,note,status,rounded_hours,timesheet_id,property:properties(id,name,timezone,latitude,longitude,geofence_radius_m)";
export async function sheetById(id: string) {
  return result<Timesheet>(
    db.from("timesheets").select(sheetColumns).eq("id", id).single(),
  );
}
export async function monthEntries(staff: string, period: string, end: string) {
  return allRows<Entry>((a, b) =>
    db
      .from("time_entries")
      .select(entryColumns)
      .eq("staff_id", staff)
      .gte("visit_date", period)
      .lte("visit_date", end)
      .order("visit_date")
      .order("id")
      .range(a, b),
  );
}
