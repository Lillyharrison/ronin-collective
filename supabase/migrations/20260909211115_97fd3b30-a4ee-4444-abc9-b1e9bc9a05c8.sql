CREATE OR REPLACE FUNCTION public.can_edit_contacts(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    public.has_role(_user_id, 'master_admin'::public.app_role)
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'manager'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_section_permissions usp
      WHERE usp.user_id = _user_id
        AND usp.section IN ('contacts','vendors')
        AND usp.can_edit = true
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_edit_contacts(uuid) FROM anon;

DROP POLICY IF EXISTS "Managers and above can manage vendors" ON public.vendors;
CREATE POLICY "Contacts editors can manage vendors" ON public.vendors
FOR ALL TO authenticated
USING (public.can_edit_contacts(auth.uid()))
WITH CHECK (public.can_edit_contacts(auth.uid()));

DROP POLICY IF EXISTS "Managers and above can manage vendor contacts" ON public.vendor_contacts;
CREATE POLICY "Contacts editors can manage vendor contacts" ON public.vendor_contacts
FOR ALL TO authenticated
USING (public.can_edit_contacts(auth.uid()))
WITH CHECK (public.can_edit_contacts(auth.uid()));