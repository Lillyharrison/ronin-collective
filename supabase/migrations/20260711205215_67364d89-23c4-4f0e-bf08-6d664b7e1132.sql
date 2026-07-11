ALTER TABLE public.staff_schedule_shares ADD COLUMN IF NOT EXISTS week_end date;
UPDATE public.staff_schedule_shares SET week_end = week_start + 6 WHERE week_end IS NULL;