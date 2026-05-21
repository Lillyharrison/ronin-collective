DROP POLICY IF EXISTS "Authenticated users can create gantt boards" ON public.gantt_shared_boards;
DROP POLICY IF EXISTS "Authenticated users can update gantt boards" ON public.gantt_shared_boards;
DROP POLICY IF EXISTS "Authenticated users can delete gantt boards" ON public.gantt_shared_boards;

CREATE POLICY "Authenticated users can create gantt boards"
ON public.gantt_shared_boards
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update gantt boards"
ON public.gantt_shared_boards
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete gantt boards"
ON public.gantt_shared_boards
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'master_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);