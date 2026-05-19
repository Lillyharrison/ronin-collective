ALTER TABLE public.staff_shifts REPLICA IDENTITY FULL;
ALTER TABLE public.staff_schedules REPLICA IDENTITY FULL;
ALTER TABLE public.staff_leave_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_leave_requests;