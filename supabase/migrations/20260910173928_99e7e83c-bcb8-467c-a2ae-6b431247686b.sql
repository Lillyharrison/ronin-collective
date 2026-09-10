DROP POLICY IF EXISTS "Admins can manage checklist items" ON public.checklist_items;

CREATE POLICY "Authorized users can manage checklist items"
ON public.checklist_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'master_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.user_section_permissions usp
    WHERE usp.user_id = auth.uid()
      AND usp.section = 'checklists'
      AND usp.can_edit = true
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'master_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.user_section_permissions usp
    WHERE usp.user_id = auth.uid()
      AND usp.section = 'checklists'
      AND usp.can_edit = true
  )
);