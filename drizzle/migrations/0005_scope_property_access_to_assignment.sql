CREATE OR REPLACE FUNCTION public.user_can_access_property(_user_id uuid, _property_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _property_id IS NULL
    OR public.has_role(_user_id, 'master_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _user_id
        AND _property_id = ANY(COALESCE(assigned_property_ids, '{}'::uuid[]))
    );
$function$;