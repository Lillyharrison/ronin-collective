CREATE TABLE public.staff_schedule_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text NOT NULL UNIQUE,
  week_start date NOT NULL,
  label text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_schedule_shares_token ON public.staff_schedule_shares(share_token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_schedule_shares TO authenticated;
GRANT ALL ON public.staff_schedule_shares TO service_role;

ALTER TABLE public.staff_schedule_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Schedule editors can view share links"
  ON public.staff_schedule_shares FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_section_permissions
      WHERE user_id = auth.uid()
        AND section = 'staff-schedule'
        AND can_edit = true
    )
  );

CREATE POLICY "Schedule editors can create share links"
  ON public.staff_schedule_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      public.has_role(auth.uid(), 'master_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_section_permissions
        WHERE user_id = auth.uid()
          AND section = 'staff-schedule'
          AND can_edit = true
      )
    )
  );

CREATE POLICY "Schedule editors can update share links"
  ON public.staff_schedule_shares FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_section_permissions
      WHERE user_id = auth.uid()
        AND section = 'staff-schedule'
        AND can_edit = true
    )
  );

CREATE POLICY "Master admins can delete share links"
  ON public.staff_schedule_shares FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER set_staff_schedule_shares_updated_at
  BEFORE UPDATE ON public.staff_schedule_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();