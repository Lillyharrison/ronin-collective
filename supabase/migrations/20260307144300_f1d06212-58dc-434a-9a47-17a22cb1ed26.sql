
CREATE TABLE public.property_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.property_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view rooms"
  ON public.property_rooms FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage rooms"
  ON public.property_rooms FOR ALL
  USING (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "Admins can manage categories" ON public.maintenance_categories;

CREATE POLICY "Admins and managers can manage categories"
  ON public.maintenance_categories FOR ALL
  USING (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );
