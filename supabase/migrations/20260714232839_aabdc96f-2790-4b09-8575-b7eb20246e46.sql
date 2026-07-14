
-- ============ properties ============
DROP POLICY IF EXISTS "Authenticated users can view properties" ON public.properties;
CREATE POLICY "Users can view accessible properties"
  ON public.properties FOR SELECT TO authenticated
  USING (public.user_can_access_property(auth.uid(), id));

-- ============ assets ============
DROP POLICY IF EXISTS "Authenticated users can view assets" ON public.assets;
CREATE POLICY "Users can view assets for accessible properties"
  ON public.assets FOR SELECT TO authenticated
  USING (current_property_id IS NULL OR public.user_can_access_property(auth.uid(), current_property_id));

-- ============ manuals ============
DROP POLICY IF EXISTS "Authenticated users can view manuals" ON public.manuals;
CREATE POLICY "Users can view manuals for accessible properties"
  ON public.manuals FOR SELECT TO authenticated
  USING (property_id IS NULL OR public.user_can_access_property(auth.uid(), property_id));

-- ============ tasks ============
DROP POLICY IF EXISTS "Authenticated users can view tasks" ON public.tasks;
CREATE POLICY "Users can view tasks for accessible properties"
  ON public.tasks FOR SELECT TO authenticated
  USING (property_id IS NULL OR public.user_can_access_property(auth.uid(), property_id));

-- ============ property_rooms ============
DROP POLICY IF EXISTS "Authenticated users can view rooms" ON public.property_rooms;
CREATE POLICY "Users can view rooms for accessible properties"
  ON public.property_rooms FOR SELECT TO authenticated
  USING (public.user_can_access_property(auth.uid(), property_id));

-- ============ checklist_comments ============
DROP POLICY IF EXISTS "Authenticated users can view checklist comments" ON public.checklist_comments;
CREATE POLICY "Users can view checklist comments for accessible properties"
  ON public.checklist_comments FOR SELECT TO authenticated
  USING (property_id IS NULL OR public.user_can_access_property(auth.uid(), property_id));

-- ============ checklist_sessions ============
DROP POLICY IF EXISTS "Authenticated users can view checklist sessions" ON public.checklist_sessions;
CREATE POLICY "Users can view checklist sessions for accessible properties"
  ON public.checklist_sessions FOR SELECT TO authenticated
  USING (
    property_id IS NULL
    OR public.user_can_access_property(auth.uid(), property_id)
  );

-- ============ shopping_list_items ============
DROP POLICY IF EXISTS "Authenticated users can view shopping list" ON public.shopping_list_items;
CREATE POLICY "Users can view shopping list for accessible properties"
  ON public.shopping_list_items FOR SELECT TO authenticated
  USING (property_id IS NULL OR public.user_can_access_property(auth.uid(), property_id));

DROP POLICY IF EXISTS "Authenticated users can update shopping items" ON public.shopping_list_items;
CREATE POLICY "Users can update shopping items for accessible properties"
  ON public.shopping_list_items FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR (property_id IS NOT NULL AND public.user_can_access_property(auth.uid(), property_id))
  );

-- ============ property_rules ============
DROP POLICY IF EXISTS "Authenticated users can view active rules" ON public.property_rules;
CREATE POLICY "Users can view active rules scoped by property and visibility"
  ON public.property_rules FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_active = true
      AND status = 'active'
      AND (
        is_universal = true
        OR property_id IS NULL
        OR public.user_can_access_property(auth.uid(), property_id)
      )
      AND (
        visible_to_user_ids IS NULL
        OR array_length(visible_to_user_ids, 1) IS NULL
        OR auth.uid() = ANY (visible_to_user_ids)
      )
    )
  );

-- ============ vendors ============
DROP POLICY IF EXISTS "Authenticated users can view vendors" ON public.vendors;
CREATE POLICY "Users can view vendors for accessible properties"
  ON public.vendors FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR property_ids IS NULL
    OR array_length(property_ids, 1) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.assigned_property_ids, '{}'::uuid[]) && vendors.property_ids
    )
  );

-- ============ vendor_contacts ============
DROP POLICY IF EXISTS "Authenticated users can view vendor contacts" ON public.vendor_contacts;
CREATE POLICY "Users can view vendor contacts scoped by vendor access"
  ON public.vendor_contacts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_contacts.vendor_id
        AND (
          v.property_ids IS NULL
          OR array_length(v.property_ids, 1) IS NULL
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND COALESCE(p.assigned_property_ids, '{}'::uuid[]) && v.property_ids
          )
        )
    )
  );

-- ============ checklist_public_sessions ============
-- Remove broad anon SELECT/UPDATE. Anon access now goes through edge functions
-- (checklist-public-get and checklist-public-update) using service role.
DROP POLICY IF EXISTS "Public can read checklist sessions" ON public.checklist_public_sessions;
DROP POLICY IF EXISTS "Public can update in-progress sessions" ON public.checklist_public_sessions;

CREATE POLICY "Admins can view public sessions"
  ON public.checklist_public_sessions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- ============ gantt_shared_boards ============
-- Remove anon read access. Public /share/timeline goes through edge functions.
DROP POLICY IF EXISTS "Anyone can view shared gantt boards" ON public.gantt_shared_boards;
DROP POLICY IF EXISTS "Authenticated users can update gantt boards" ON public.gantt_shared_boards;

CREATE POLICY "Authenticated users can view gantt boards"
  ON public.gantt_shared_boards FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update gantt boards"
  ON public.gantt_shared_boards FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ storage: remove broad public listing SELECT policies ============
DROP POLICY IF EXISTS "Anyone can view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view property images" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read order-library" ON storage.objects;
DROP POLICY IF EXISTS "Maintenance photos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Vehicle images are publicly accessible" ON storage.objects;

-- ============ storage: tighten maintenance & vehicles write policies ============
DROP POLICY IF EXISTS "Authenticated users can upload maintenance photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update maintenance photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete vehicle images" ON storage.objects;

CREATE POLICY "Managers and above can upload maintenance photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'maintenance'
    AND (
      public.has_role(auth.uid(), 'master_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'staff'::app_role)
    )
  );

CREATE POLICY "Managers and above can update maintenance photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'maintenance'
    AND (
      public.has_role(auth.uid(), 'master_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

CREATE POLICY "Managers and above can upload vehicle images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicles'
    AND (
      public.has_role(auth.uid(), 'master_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

CREATE POLICY "Managers and above can update vehicle images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vehicles'
    AND (
      public.has_role(auth.uid(), 'master_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

CREATE POLICY "Managers and above can delete vehicle images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vehicles'
    AND (
      public.has_role(auth.uid(), 'master_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

-- ============ SECURITY DEFINER functions: revoke EXECUTE from app roles ============
REVOKE EXECUTE ON FUNCTION public.prune_old_notifications() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_old_system_events() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_ronin_overdue_tasks() FROM anon, authenticated, PUBLIC;
