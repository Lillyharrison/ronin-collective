
-- Add is_published column (all existing items are drafts by default)
ALTER TABLE public.checklist_templates
  ADD COLUMN is_published boolean NOT NULL DEFAULT false;

-- Drop the existing permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view checklist templates" ON public.checklist_templates;

-- New policy: published items visible to all, unpublished only to master_admin
CREATE POLICY "Published templates visible to all, drafts only to master admin"
  ON public.checklist_templates
  FOR SELECT
  USING (
    is_published = true
    OR has_role(auth.uid(), 'master_admin'::app_role)
  );
