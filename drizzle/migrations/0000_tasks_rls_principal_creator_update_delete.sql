-- Allow task creators with the principal (family) role to update/delete their own sent tasks
ALTER POLICY "Assigned user or manager can update tasks"
  ON public.tasks
  USING (
    (auth.uid() = assigned_to)
    OR (auth.uid() = created_by AND has_role(auth.uid(), 'principal'::public.app_role))
    OR has_role(auth.uid(), 'master_admin'::public.app_role)
    OR has_role(auth.uid(), 'admin'::public.app_role)
    OR has_role(auth.uid(), 'manager'::public.app_role)
  );

ALTER POLICY "Manager and above can delete tasks"
  ON public.tasks
  USING (
    (auth.uid() = created_by AND has_role(auth.uid(), 'principal'::public.app_role))
    OR has_role(auth.uid(), 'master_admin'::public.app_role)
    OR has_role(auth.uid(), 'admin'::public.app_role)
    OR has_role(auth.uid(), 'manager'::public.app_role)
  );