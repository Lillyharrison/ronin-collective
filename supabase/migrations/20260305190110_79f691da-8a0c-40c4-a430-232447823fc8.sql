
-- Add checklist comments table
CREATE TABLE public.checklist_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view checklist comments" ON public.checklist_comments FOR SELECT USING (true);
CREATE POLICY "Users can insert own comments" ON public.checklist_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.checklist_comments FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all checklist comments" ON public.checklist_comments FOR ALL USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add recurrence and assignment columns to checklist_templates
ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS recurrence text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_day integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assigned_role text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notify_on_day boolean DEFAULT false;

-- Enable realtime for checklist_sessions so collaboration works
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_comments;
