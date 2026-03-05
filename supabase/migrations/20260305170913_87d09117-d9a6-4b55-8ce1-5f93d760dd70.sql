
-- ─── RONIN MEMORIES TABLE ────────────────────────────────────────────────────
CREATE TABLE public.ronin_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  subject_user_id UUID,
  importance INTEGER NOT NULL DEFAULT 3,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'conversation',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_referenced_at TIMESTAMP WITH TIME ZONE,
  reference_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT importance_range CHECK (importance BETWEEN 1 AND 5)
);

CREATE INDEX idx_ronin_memories_category ON public.ronin_memories(category);
CREATE INDEX idx_ronin_memories_property ON public.ronin_memories(property_id);
CREATE INDEX idx_ronin_memories_subject ON public.ronin_memories(subject_user_id);
CREATE INDEX idx_ronin_memories_importance ON public.ronin_memories(importance DESC);
CREATE INDEX idx_ronin_memories_tags ON public.ronin_memories USING GIN(tags);

CREATE TRIGGER update_ronin_memories_updated_at
  BEFORE UPDATE ON public.ronin_memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ronin_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all memories"
  ON public.ronin_memories FOR SELECT
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert memories"
  ON public.ronin_memories FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update memories"
  ON public.ronin_memories FOR UPDATE
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Master admin can delete memories"
  ON public.ronin_memories FOR DELETE
  USING (has_role(auth.uid(), 'master_admin'::app_role));
