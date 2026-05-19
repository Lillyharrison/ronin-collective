ALTER TABLE public.user_section_permissions
ADD COLUMN IF NOT EXISTS scope text;

ALTER TABLE public.user_section_permissions
DROP CONSTRAINT IF EXISTS user_section_permissions_scope_check;

ALTER TABLE public.user_section_permissions
ADD CONSTRAINT user_section_permissions_scope_check
CHECK (scope IS NULL OR scope IN ('own', 'department', 'all'));

COMMENT ON COLUMN public.user_section_permissions.scope IS 'Optional visibility scope for scoped sections such as staff-schedule: own, department, or all.';