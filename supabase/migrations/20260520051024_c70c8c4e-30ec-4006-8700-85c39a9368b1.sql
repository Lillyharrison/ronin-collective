DROP FUNCTION IF EXISTS public.get_staff_schedule_profiles();

CREATE FUNCTION public.get_staff_schedule_profiles()
 RETURNS TABLE(
   id uuid,
   full_name text,
   avatar_url text,
   job_title text,
   department text,
   assigned_property_ids uuid[],
   is_draft boolean,
   contracted_days_per_week integer,
   contracted_hours_per_week numeric,
   annual_leave_days integer,
   start_date date
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.job_title,
    p.department,
    p.assigned_property_ids,
    p.is_draft,
    p.contracted_days_per_week,
    p.contracted_hours_per_week,
    p.annual_leave_days,
    p.start_date
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND COALESCE(p.level, 'staff') NOT IN ('principal', 'extended_family')
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'staff'::public.app_role)
    )
    AND (
      public.has_role(auth.uid(), 'master_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_section_permissions usp
        WHERE usp.user_id = auth.uid()
          AND usp.section = 'staff-schedule'
          AND usp.can_view = true
      )
    )
  ORDER BY p.full_name NULLS LAST, p.job_title NULLS LAST;
$function$;