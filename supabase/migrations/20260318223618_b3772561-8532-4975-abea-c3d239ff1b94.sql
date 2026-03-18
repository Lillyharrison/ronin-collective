
CREATE TABLE public.planned_maintenance (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT,
  vendor_id         UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  property_id       UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  assigned_to       UUID,
  date_type         TEXT NOT NULL DEFAULT 'specific' CHECK (date_type IN ('specific', 'month_only')),
  scheduled_date    DATE,
  scheduled_month   INTEGER,
  scheduled_year    INTEGER,
  reminder_days     INTEGER NOT NULL DEFAULT 90,
  recurrence_months INTEGER,
  status            TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed', 'confirmed', 'completed', 'cancelled')),
  calendar_event_id UUID,
  created_by        UUID,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.planned_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and above can manage planned maintenance"
  ON public.planned_maintenance
  FOR ALL
  TO authenticated
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

CREATE POLICY "Staff can view planned maintenance for assigned properties"
  ON public.planned_maintenance
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR property_id IN (
      SELECT unnest(assigned_property_ids)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

CREATE INDEX idx_planned_maintenance_property_id ON public.planned_maintenance(property_id);
CREATE INDEX idx_planned_maintenance_status ON public.planned_maintenance(status);
CREATE INDEX idx_planned_maintenance_scheduled_date ON public.planned_maintenance(scheduled_date);
CREATE INDEX idx_planned_maintenance_vendor_id ON public.planned_maintenance(vendor_id);

CREATE TRIGGER update_planned_maintenance_updated_at
  BEFORE UPDATE ON public.planned_maintenance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
