DROP POLICY IF EXISTS "Participants and admins can update threads" ON public.chat_threads;
CREATE POLICY "Participants and admins can update threads"
ON public.chat_threads FOR UPDATE
TO authenticated
USING (auth.uid() = ANY (participant_ids) OR has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (true);