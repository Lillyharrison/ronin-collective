
DROP POLICY IF EXISTS "Managers and above can upload maintenance photos" ON storage.objects;

CREATE POLICY "Authenticated users can upload maintenance photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'maintenance');
