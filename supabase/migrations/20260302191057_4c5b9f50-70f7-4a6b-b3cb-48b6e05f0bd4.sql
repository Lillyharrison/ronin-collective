-- Allow senders to delete their own messages
-- Allow admins/master_admin to delete any message
CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE
  USING (auth.uid() = sender_id);

CREATE POLICY "Admins can delete any message"
  ON public.messages FOR DELETE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  );