REVOKE ALL ON FUNCTION public.can_edit_maintenance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_maintenance(uuid) TO authenticated;