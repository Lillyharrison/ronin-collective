-- Extend tasks table for full estate task management
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_department text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assigned_role text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS linked_checklist_id uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_suggested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_inventory_ids uuid[] NOT NULL DEFAULT '{}';

-- Index for fast draft task queries (used by dashboard widget)
CREATE INDEX IF NOT EXISTS idx_tasks_is_draft ON public.tasks(is_draft) WHERE is_draft = true;
-- Index for AI suggested tasks
CREATE INDEX IF NOT EXISTS idx_tasks_ai_suggested ON public.tasks(ai_suggested) WHERE ai_suggested = true;