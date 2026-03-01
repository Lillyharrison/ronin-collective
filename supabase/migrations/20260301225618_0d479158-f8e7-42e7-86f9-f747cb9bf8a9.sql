
-- Trigger: auto-assign master_admin to the very first user who signs up,
-- and regular 'staff' role to everyone else.
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  
  IF user_count = 0 THEN
    -- First ever user → master_admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'master_admin');
  ELSE
    -- Everyone else → staff by default (admins can upgrade later)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to profiles table (fires after profile is created)
CREATE TRIGGER on_profile_created_assign_role
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_role();

-- Also create the handle_new_user trigger for auth if not already present
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
