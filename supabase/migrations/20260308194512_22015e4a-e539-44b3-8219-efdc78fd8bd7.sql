
-- Create a relational section permissions table replacing the JSON blob
-- on profiles.section_permissions. Enables fast server-side queries like
-- "which users have access to section X?" without loading all profiles.

CREATE TABLE public.user_section_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section       text NOT NULL,
  can_view      boolean NOT NULL DEFAULT false,
  can_edit      boolean NOT NULL DEFAULT false,
  notifications boolean NOT NULL DEFAULT false,
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, section)
);

CREATE INDEX idx_usp_user_id ON public.user_section_permissions (user_id);
CREATE INDEX idx_usp_section  ON public.user_section_permissions (section);

CREATE TRIGGER update_user_section_permissions_updated_at
  BEFORE UPDATE ON public.user_section_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_section_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all section permissions"
  ON public.user_section_permissions FOR ALL
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own section permissions"
  ON public.user_section_permissions FOR SELECT
  USING (auth.uid() = user_id);

-- Migrate existing JSON blobs from profiles.section_permissions into rows
INSERT INTO public.user_section_permissions (user_id, section, can_view, can_edit, notifications)
SELECT
  p.id,
  kv.key,
  COALESCE((kv.value->>'view')::boolean,          false),
  COALESCE((kv.value->>'edit')::boolean,          false),
  COALESCE((kv.value->>'notifications')::boolean, false)
FROM public.profiles p,
     jsonb_each(
       CASE
         WHEN p.section_permissions IS NOT NULL
              AND jsonb_typeof(p.section_permissions) = 'object'
              AND p.section_permissions != '{}'::jsonb
         THEN p.section_permissions
         ELSE NULL
       END
     ) AS kv(key, value)
ON CONFLICT (user_id, section) DO NOTHING;
