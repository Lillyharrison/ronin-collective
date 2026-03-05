
-- Add acknowledged_by array so each user can independently dismiss dashboard notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid[] NOT NULL DEFAULT '{}';

-- Security-definer function so any authenticated user can append themselves safely
CREATE OR REPLACE FUNCTION public.acknowledge_notification(_notif_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
  SET acknowledged_by = array_append(acknowledged_by, auth.uid())
  WHERE id = _notif_id
    AND NOT (auth.uid() = ANY(acknowledged_by));
$$;

-- Also allow master_admin to mark read (for bell panel) on any notification
DROP POLICY IF EXISTS "Users can mark their own notifications read" ON public.notifications;
CREATE POLICY "Users can mark their own notifications read"
  ON public.notifications FOR UPDATE
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'master_admin'::app_role)
  );
