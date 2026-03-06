
-- Add container column to checklist_items for grouping instructions into Do's, Don'ts, etc.
ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS container text DEFAULT NULL;
