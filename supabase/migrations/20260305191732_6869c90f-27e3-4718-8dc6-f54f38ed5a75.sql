ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS assigned_department text DEFAULT NULL;