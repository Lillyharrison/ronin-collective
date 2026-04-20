// Shared local types for the Staff Calendar feature.
// Extracted from StaffCalendarTab.tsx (Step 1 refactor) — no behavior changes.

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  assigned_property_ids?: string[] | null;
  is_draft?: boolean;
  contracted_days_per_week?: number | null;
  contracted_hours_per_week?: number | null;
  annual_leave_days?: number | null;
}

export interface Property {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
}

export interface DisplayShift {
  key: string;
  staff_id: string;
  property_id: string | null;
  schedule_id: string | null;
  concrete_id: string | null;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
  is_virtual: boolean;
  is_leave: boolean;
}
