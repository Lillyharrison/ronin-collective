
-- Add cover image, manual link, and products list to checklist_templates
ALTER TABLE public.checklist_templates
  ADD COLUMN cover_image_url text DEFAULT NULL,
  ADD COLUMN manual_link_url text DEFAULT NULL,
  ADD COLUMN manual_link_label text DEFAULT NULL,
  ADD COLUMN products jsonb DEFAULT '[]'::jsonb;
