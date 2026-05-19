-- Helper: returns true if user can access the given property
-- (master_admin/admin/manager see all; others must have it in assigned_property_ids)
CREATE OR REPLACE FUNCTION public.user_can_access_property(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _property_id IS NULL
    OR public.has_role(_user_id, 'master_admin'::app_role)
    OR public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _user_id
        AND _property_id = ANY(COALESCE(assigned_property_ids, '{}'::uuid[]))
    );
$$;

-- =========================
-- maintenance_issues
-- =========================
DROP POLICY IF EXISTS "Authenticated users can view maintenance issues" ON public.maintenance_issues;
CREATE POLICY "Users view maintenance issues for accessible properties"
ON public.maintenance_issues FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND public.user_can_access_property(auth.uid(), property_id)
);

-- =========================
-- calendar_events
-- =========================
DROP POLICY IF EXISTS "Principal can view all calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Staff can view assigned and non-private events" ON public.calendar_events;

CREATE POLICY "Principal can view accessible calendar events"
ON public.calendar_events FOR SELECT
USING (
  public.has_role(auth.uid(), 'principal'::app_role)
  AND public.user_can_access_property(auth.uid(), property_id)
);

CREATE POLICY "Staff can view events for accessible properties"
ON public.calendar_events FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND public.user_can_access_property(auth.uid(), property_id)
  AND ((NOT is_private) OR (auth.uid() = ANY (assigned_staff_ids)))
);

-- =========================
-- orders
-- =========================
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
CREATE POLICY "Users view orders for accessible properties"
ON public.orders FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND public.user_can_access_property(auth.uid(), property_id)
);

-- =========================
-- car_wash_bookings
-- =========================
DROP POLICY IF EXISTS "Authenticated users can view car wash bookings" ON public.car_wash_bookings;
CREATE POLICY "Users view car wash bookings for accessible properties"
ON public.car_wash_bookings FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND public.user_can_access_property(auth.uid(), location_property_id)
);