-- Scope wash requests to their author, an enabled screen and visible vehicle/house.
ALTER POLICY "Authenticated users can create bookings"
ON public.car_wash_bookings TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND requested_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'master_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_see_section(auth.uid(), 'car-wash')
  )
  AND (
    public.has_role(auth.uid(), 'master_admin'::public.app_role)
    OR location_property_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND NOT p.is_archived
        AND location_property_id = ANY(COALESCE(p.assigned_property_ids, '{}'::uuid[]))
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id
      AND (
        public.has_role(auth.uid(), 'master_admin'::public.app_role)
        OR v.owner_profile_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND NOT p.is_archived
            AND v.property_id = ANY(COALESCE(p.assigned_property_ids, '{}'::uuid[]))
        )
        OR (v.property_id IS NULL AND public.is_team_member(auth.uid()))
      )
  )
);

-- Shared links continue through the existing token-scoped edge functions.
-- Direct table access must not let arbitrary accounts enumerate share tokens.
ALTER POLICY "Authenticated users can view gantt boards"
ON public.gantt_shared_boards TO authenticated
USING (
  public.has_role(auth.uid(), 'master_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

ALTER POLICY "Authenticated users can create gantt boards"
ON public.gantt_shared_boards TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'master_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);