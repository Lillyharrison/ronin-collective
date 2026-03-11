-- Allow any thread participant to delete a thread they're part of
DROP POLICY IF EXISTS "Master admin can delete threads" ON public.chat_threads;

CREATE POLICY "Participants and admins can delete threads"
  ON public.chat_threads
  FOR DELETE
  TO public
  USING (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR auth.uid() = ANY(participant_ids)
  );