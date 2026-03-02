
INSERT INTO storage.buckets (id, name, public) VALUES ('property-images', 'property-images', true);

CREATE POLICY "Anyone can view property images"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-images');

CREATE POLICY "Admins can upload property images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'property-images' AND (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Admins can update property images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'property-images' AND (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Admins can delete property images"
ON storage.objects FOR DELETE
USING (bucket_id = 'property-images' AND (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
