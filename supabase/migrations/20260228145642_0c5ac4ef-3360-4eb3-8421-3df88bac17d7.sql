
-- Fix: system_events INSERT policy — scope to the triggering user
DROP POLICY IF EXISTS "Authenticated users can insert system events" ON public.system_events;

CREATE POLICY "Authenticated users can insert system events"
  ON public.system_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = triggered_by OR triggered_by IS NULL);
