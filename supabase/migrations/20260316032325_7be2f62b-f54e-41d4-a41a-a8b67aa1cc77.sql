-- Add is_draft column to profiles table
-- Draft profiles are only visible to admins and are used for pre-hiring account setup
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- Update the SELECT policy so draft profiles are only visible to admins/master_admins
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_draft = false
  OR has_role(auth.uid(), 'master_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);