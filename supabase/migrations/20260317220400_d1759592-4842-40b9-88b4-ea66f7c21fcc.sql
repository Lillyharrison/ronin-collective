
-- ── Vehicles table ────────────────────────────────────────────────────────────
CREATE TABLE public.vehicles (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  make                TEXT NOT NULL,
  model               TEXT NOT NULL,
  colour              TEXT,
  year                INTEGER,
  owner_profile_id    UUID,
  property_id         UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  photo_url           TEXT,
  notes               TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_by          UUID,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vehicles"
  ON public.vehicles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage vehicles"
  ON public.vehicles FOR ALL
  USING (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- ── Car wash bookings table ───────────────────────────────────────────────────
CREATE TABLE public.car_wash_bookings (
  id                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id           UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  requested_date       DATE NOT NULL,
  requested_time       TIME,
  wash_type            TEXT NOT NULL DEFAULT 'quick_wash',
  location_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  assigned_staff_id    UUID,
  status               TEXT NOT NULL DEFAULT 'requested',
  notes                TEXT,
  completed_at         TIMESTAMP WITH TIME ZONE,
  requested_by         UUID,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.car_wash_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view car wash bookings"
  ON public.car_wash_bookings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create bookings"
  ON public.car_wash_bookings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and managers can update bookings"
  ON public.car_wash_bookings FOR UPDATE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admins can delete bookings"
  ON public.car_wash_bookings FOR DELETE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- ── Auto-update timestamps ────────────────────────────────────────────────────
CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_car_wash_bookings_updated_at
  BEFORE UPDATE ON public.car_wash_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Storage bucket for vehicle photos ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicles', 'vehicles', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Vehicle images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicles');

CREATE POLICY "Admins can upload vehicle images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vehicles' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update vehicle images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'vehicles' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete vehicle images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'vehicles' AND auth.uid() IS NOT NULL);
