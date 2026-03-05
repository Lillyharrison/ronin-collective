
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read system settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Master admins can upsert system settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));
