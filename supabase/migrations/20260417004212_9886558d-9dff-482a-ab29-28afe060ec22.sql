ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contracted_days_per_week  integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS contracted_hours_per_week numeric DEFAULT 40,
  ADD COLUMN IF NOT EXISTS annual_leave_days         integer DEFAULT 25;