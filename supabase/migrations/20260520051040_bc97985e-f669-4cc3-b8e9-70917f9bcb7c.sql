REVOKE ALL ON FUNCTION public.get_staff_schedule_profiles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_schedule_profiles() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_staff_schedule_profiles() TO authenticated;