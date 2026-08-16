CREATE TABLE public.staff_schedule_publications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start date NOT NULL UNIQUE,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.staff_schedule_publications TO authenticated;
GRANT INSERT, DELETE ON public.staff_schedule_publications TO authenticated;
GRANT ALL ON public.staff_schedule_publications TO service_role;

ALTER TABLE public.staff_schedule_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view published weeks"
ON public.staff_schedule_publications FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can publish weeks"
ON public.staff_schedule_publications FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'master_admin') OR
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'manager')
);

CREATE POLICY "Managers can unpublish weeks"
ON public.staff_schedule_publications FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'master_admin') OR
  public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'manager')
);