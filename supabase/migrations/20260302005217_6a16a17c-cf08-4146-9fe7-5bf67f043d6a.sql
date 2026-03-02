
-- Add section_permissions JSONB column to profiles
-- Structure: { "tasks": { "view": true, "edit": false, "notifications": true }, ... }
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS section_permissions jsonb DEFAULT '{}'::jsonb;

-- Allow admins to update any profile (needed for master admin editing others)
CREATE POLICY "Admin can update any profile"
  ON public.profiles
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  );
