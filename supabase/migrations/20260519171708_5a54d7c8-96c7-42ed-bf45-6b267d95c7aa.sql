REVOKE ALL ON FUNCTION public.get_staff_schedule_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_schedule_profiles() TO authenticated;