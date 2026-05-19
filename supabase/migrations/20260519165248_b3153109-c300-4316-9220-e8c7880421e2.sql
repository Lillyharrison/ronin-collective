CREATE OR REPLACE FUNCTION public.can_user_see_checklist(_template_assigned_dept text, _template_assigned_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'principal'::app_role)
    OR (_template_assigned_dept IS NULL AND _template_assigned_role IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND department = _template_assigned_dept
        AND _template_assigned_dept IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role::text = _template_assigned_role
        AND _template_assigned_role IS NOT NULL
    )
$function$;