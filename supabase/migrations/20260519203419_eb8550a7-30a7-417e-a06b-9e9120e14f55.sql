ALTER TABLE public.user_section_permissions
DROP CONSTRAINT IF EXISTS user_section_permissions_user_id_fkey;

ALTER TABLE public.user_section_permissions
ADD CONSTRAINT user_section_permissions_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;