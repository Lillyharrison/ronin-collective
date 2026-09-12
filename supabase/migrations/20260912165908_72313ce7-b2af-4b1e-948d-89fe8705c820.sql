CREATE OR REPLACE FUNCTION public.can_edit_properties(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'master_admin'::public.app_role)
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'manager'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_section_permissions usp
      WHERE usp.user_id = _user_id
        AND usp.section = 'property'
        AND usp.can_edit = true
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.can_edit_properties(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_properties(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update property images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete property images" ON storage.objects;

CREATE POLICY "Property editors can upload property images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'property-images' AND public.can_edit_properties(auth.uid()));

CREATE POLICY "Property editors can update property images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'property-images' AND public.can_edit_properties(auth.uid()))
WITH CHECK (bucket_id = 'property-images' AND public.can_edit_properties(auth.uid()));

CREATE POLICY "Property editors can delete property images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'property-images' AND public.can_edit_properties(auth.uid()));