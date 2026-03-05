
-- ============================================================
-- FIX: Checklist template visibility — enforce dept + role
-- ============================================================
-- 
-- Root cause: the old SELECT policy only checked is_published,
-- meaning ANY authenticated user could see ANY published
-- template regardless of which department or role it was
-- assigned to.
--
-- New logic (all conditions must pass):
--  1. Template is published  (drafts only to master_admin)
--  2. Visibility matches the viewer — any of:
--       a. No department + no role assigned  → visible to all
--       b. assigned_department matches viewer's profile.department
--       c. assigned_role matches viewer's user_role
--       d. Viewer is admin, manager, or master_admin (managers
--          must be able to see everything they supervise)
--       e. Viewer is master_admin (always bypass — handled in 1)
-- ============================================================

-- Step 1: Create a helper function that checks whether the
--         current user can see a given checklist template.
--         Uses SECURITY DEFINER to safely read profiles + roles
--         without triggering recursive RLS.

CREATE OR REPLACE FUNCTION public.can_user_see_checklist(
  _template_assigned_dept text,
  _template_assigned_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- master_admin / admin always can see everything
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    -- managers can see all published checklists they may supervise
    OR has_role(auth.uid(), 'manager'::app_role)
    -- no restrictions on this template → visible to everyone
    OR (_template_assigned_dept IS NULL AND _template_assigned_role IS NULL)
    -- department matches
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND department = _template_assigned_dept
        AND _template_assigned_dept IS NOT NULL
    )
    -- role matches
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role::text = _template_assigned_role
        AND _template_assigned_role IS NOT NULL
    )
$$;

-- Step 2: Drop the old overly-permissive SELECT policy
DROP POLICY IF EXISTS "Published templates visible to all, drafts only to master admin" ON public.checklist_templates;

-- Step 3: Create the new, properly scoped SELECT policy
CREATE POLICY "Checklist visibility by dept and role"
  ON public.checklist_templates
  FOR SELECT
  USING (
    -- master_admin can always see everything (including drafts)
    has_role(auth.uid(), 'master_admin'::app_role)
    OR (
      -- published templates only for everyone else
      is_published = true
      AND public.can_user_see_checklist(assigned_department, assigned_role)
    )
  );
