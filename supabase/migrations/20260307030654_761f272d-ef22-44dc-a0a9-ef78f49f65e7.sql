
-- ═══════════════════════════════════════════════════════════════
-- MAINTENANCE SYSTEM: Categories + Issues tables
-- ═══════════════════════════════════════════════════════════════

-- 1. Maintenance categories (admin-manageable, seeded with defaults)
CREATE TABLE public.maintenance_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  icon       text        NOT NULL DEFAULT '🔧',
  color      text        NOT NULL DEFAULT 'gray',
  sort_order integer     NOT NULL DEFAULT 0,
  is_custom  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view categories"
  ON public.maintenance_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.maintenance_categories FOR ALL
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. Maintenance issues (core table)
CREATE TABLE public.maintenance_issues (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text        NOT NULL,
  description          text,
  category             text        NOT NULL DEFAULT 'general',
  priority             text        NOT NULL DEFAULT 'medium',  -- urgent, high, medium, low
  status               text        NOT NULL DEFAULT 'reported', -- reported, approved, assigned, scheduled, in_progress, resolved
  property_id          uuid        REFERENCES public.properties(id) ON DELETE SET NULL,
  location_detail      text,                                    -- room/area within property
  reported_by          uuid        NOT NULL,                    -- profile id
  assigned_to          uuid,                                    -- profile id
  photo_url            text,
  close_out_photo_url  text,
  scheduled_date       timestamptz,
  resolved_at          timestamptz,
  source               text        NOT NULL DEFAULT 'manual',   -- manual, chat, ronin
  related_issue_id     uuid        REFERENCES public.maintenance_issues(id) ON DELETE SET NULL,
  is_draft             boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_issues ENABLE ROW LEVEL SECURITY;

-- Everyone can view issues
CREATE POLICY "Authenticated users can view maintenance issues"
  ON public.maintenance_issues FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Everyone can report an issue
CREATE POLICY "Authenticated users can report issues"
  ON public.maintenance_issues FOR INSERT
  WITH CHECK (auth.uid() = reported_by);

-- Managers and above can update issues
CREATE POLICY "Managers and above can update issues"
  ON public.maintenance_issues FOR UPDATE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    auth.uid() = reported_by
  );

-- Admins can delete issues
CREATE POLICY "Admins can delete issues"
  ON public.maintenance_issues FOR DELETE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Auto-updated timestamp trigger
CREATE TRIGGER update_maintenance_issues_updated_at
  BEFORE UPDATE ON public.maintenance_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add a storage bucket for maintenance photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance', 'maintenance', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Maintenance photos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'maintenance');

CREATE POLICY "Authenticated users can upload maintenance photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'maintenance' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update maintenance photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'maintenance' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete maintenance photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'maintenance' AND (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  ));

-- 4. Seed default categories
INSERT INTO public.maintenance_categories (name, icon, color, sort_order) VALUES
  ('Plumbing',          '🔵', 'blue',   1),
  ('Electrical / Tech', '⚡', 'yellow', 2),
  ('Climate / HVAC',    '❄️', 'cyan',   3),
  ('Outdoor / Grounds', '🌿', 'green',  4),
  ('Appliances',        '🏠', 'orange', 5),
  ('Structural',        '🧱', 'stone',  6),
  ('Security',          '🔒', 'red',    7),
  ('General',           '🔧', 'gray',   8);
