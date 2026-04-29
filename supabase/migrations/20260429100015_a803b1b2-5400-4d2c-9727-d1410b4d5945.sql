CREATE POLICY "Master admins can delete any notification"
ON public.notifications
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'::app_role));