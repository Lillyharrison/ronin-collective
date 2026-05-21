CREATE OR REPLACE FUNCTION public.can_edit_maintenance(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'master_admin'::public.app_role)
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_section_permissions usp
      WHERE usp.user_id = _user_id
        AND usp.section = 'maintenance'
        AND usp.can_edit = true
    );
$$;

DROP POLICY IF EXISTS "Managers and above can update issues" ON public.maintenance_issues;

CREATE POLICY "Maintenance editors can update issues"
ON public.maintenance_issues
FOR UPDATE
TO public
USING (
  public.can_edit_maintenance(auth.uid())
  OR auth.uid() = reported_by
)
WITH CHECK (
  public.can_edit_maintenance(auth.uid())
  OR auth.uid() = reported_by
);

CREATE POLICY "Maintenance editors can create planned maintenance"
ON public.planned_maintenance
FOR INSERT
TO authenticated
WITH CHECK (public.can_edit_maintenance(auth.uid()));

CREATE POLICY "Maintenance editors can update planned maintenance"
ON public.planned_maintenance
FOR UPDATE
TO authenticated
USING (public.can_edit_maintenance(auth.uid()))
WITH CHECK (public.can_edit_maintenance(auth.uid()));