
-- Add status and submission tracking fields to property_rules
ALTER TABLE public.property_rules
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_approval', 'rejected')),
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_source text NOT NULL DEFAULT 'manual'
    CHECK (submitted_source IN ('manual', 'chat', 'ronin_ai', 'staff', 'guest')),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Update existing pending selector policy
DROP POLICY IF EXISTS "Admins can manage property rules" ON public.property_rules;
CREATE POLICY "Admins can manage property rules"
  ON public.property_rules
  FOR ALL
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can submit pending rules (staff/guest suggestions)
DROP POLICY IF EXISTS "Authenticated users can submit pending rules" ON public.property_rules;
CREATE POLICY "Authenticated users can submit pending rules"
  ON public.property_rules
  FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by
    AND status = 'pending_approval'
  );

-- Active rules visible to all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view active rules" ON public.property_rules;
CREATE POLICY "Authenticated users can view active rules"
  ON public.property_rules
  FOR SELECT
  USING (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (is_active = true AND status = 'active')
  );

-- Index for quick pending queries
CREATE INDEX IF NOT EXISTS idx_property_rules_status ON public.property_rules(status);
