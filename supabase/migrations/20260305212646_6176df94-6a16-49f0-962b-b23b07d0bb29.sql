
-- Allow master_admin to view ALL notifications (not just their own)
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'master_admin'::app_role)
  );
