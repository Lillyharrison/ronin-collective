-- Allow master_admin to delete entire chat threads
CREATE POLICY "Master admin can delete threads"
ON public.chat_threads
FOR DELETE
USING (has_role(auth.uid(), 'master_admin'::app_role));
