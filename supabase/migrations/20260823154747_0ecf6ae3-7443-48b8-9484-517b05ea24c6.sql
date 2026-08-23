ALTER TABLE public.system_settings
  DROP CONSTRAINT IF EXISTS system_settings_updated_by_fkey;

ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_updated_by_fkey
  FOREIGN KEY (updated_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;