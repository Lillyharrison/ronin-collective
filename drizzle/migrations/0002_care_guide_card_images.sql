ALTER TABLE public.checklist_templates ADD COLUMN IF NOT EXISTS card_images jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.checklist_templates SET card_images =
  (CASE WHEN icon LIKE 'http%' THEN jsonb_build_array(jsonb_build_object('url', icon, 'side', 'front')) ELSE '[]'::jsonb END)
  || (CASE WHEN cover_image_url IS NOT NULL AND cover_image_url <> '' THEN jsonb_build_array(jsonb_build_object('url', cover_image_url, 'side', 'back')) ELSE '[]'::jsonb END)
WHERE category = 'care_guide';