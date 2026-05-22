
-- 1. Add section column to checklist_items
ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS section text;

-- 2. Add ordered section list on the template
ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Public sessions table
CREATE TABLE IF NOT EXISTS public.checklist_public_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text NOT NULL UNIQUE,
  template_id uuid NOT NULL,
  property_id uuid,
  assignee_name text,
  checked_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  notes text,
  status text NOT NULL DEFAULT 'in_progress',
  created_by uuid,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cps_token ON public.checklist_public_sessions (share_token);
CREATE INDEX IF NOT EXISTS idx_cps_status_submitted ON public.checklist_public_sessions (status, submitted_at DESC);

ALTER TABLE public.checklist_public_sessions ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read a row — used by the public share page (token is the secret)
CREATE POLICY "Public can read checklist sessions"
  ON public.checklist_public_sessions
  FOR SELECT
  USING (true);

-- Anyone can update a row that is still in progress (helper saves checked items)
CREATE POLICY "Public can update in-progress sessions"
  ON public.checklist_public_sessions
  FOR UPDATE
  USING (status = 'in_progress')
  WITH CHECK (status IN ('in_progress', 'submitted'));

-- Authenticated managers/admins can create new public sessions (generate share link)
CREATE POLICY "Admins create public sessions"
  ON public.checklist_public_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- Admins can delete (manage archive)
CREATE POLICY "Admins delete public sessions"
  ON public.checklist_public_sessions
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER set_cps_updated_at
  BEFORE UPDATE ON public.checklist_public_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
