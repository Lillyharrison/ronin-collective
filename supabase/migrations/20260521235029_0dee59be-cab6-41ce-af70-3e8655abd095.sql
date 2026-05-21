ALTER TABLE public.gantt_shared_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view shared gantt boards" ON public.gantt_shared_boards;
DROP POLICY IF EXISTS "Authenticated users can create gantt boards" ON public.gantt_shared_boards;
DROP POLICY IF EXISTS "Authenticated users can update gantt boards" ON public.gantt_shared_boards;
DROP POLICY IF EXISTS "Authenticated users can delete gantt boards" ON public.gantt_shared_boards;

CREATE POLICY "Anyone can view shared gantt boards"
ON public.gantt_shared_boards
FOR SELECT
TO public
USING (true);

CREATE POLICY "Authenticated users can create gantt boards"
ON public.gantt_shared_boards
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update gantt boards"
ON public.gantt_shared_boards
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete gantt boards"
ON public.gantt_shared_boards
FOR DELETE
TO authenticated
USING (true);