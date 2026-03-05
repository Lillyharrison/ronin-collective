
-- ============================================================
-- CHECKLIST TEMPLATES
-- ============================================================
CREATE TABLE public.checklist_templates (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'cleaning',
  subcategory   TEXT,
  icon          TEXT NOT NULL DEFAULT '✅',
  color         TEXT NOT NULL DEFAULT 'green',
  property_id   UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  is_universal  BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    UUID,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view checklist templates"
  ON public.checklist_templates FOR SELECT USING (true);

CREATE POLICY "Admins can manage checklist templates"
  ON public.checklist_templates FOR ALL
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- CHECKLIST ITEMS
-- ============================================================
CREATE TABLE public.checklist_items (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id   UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  icon          TEXT NOT NULL DEFAULT '▸',
  color         TEXT NOT NULL DEFAULT 'default',
  photo_url     TEXT,
  notes         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_required   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view checklist items"
  ON public.checklist_items FOR SELECT USING (true);

CREATE POLICY "Admins can manage checklist items"
  ON public.checklist_items FOR ALL
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_checklist_items_updated_at
  BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- CHECKLIST SESSIONS (date-stamped completions)
-- ============================================================
CREATE TABLE public.checklist_sessions (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id   UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  property_id   UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_by  UUID NOT NULL,
  completed_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(template_id, item_id, session_date, completed_by)
);

ALTER TABLE public.checklist_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view checklist sessions"
  ON public.checklist_sessions FOR SELECT USING (true);

CREATE POLICY "Staff can insert own completions"
  ON public.checklist_sessions FOR INSERT
  WITH CHECK (auth.uid() = completed_by);

CREATE POLICY "Staff can delete own completions"
  ON public.checklist_sessions FOR DELETE
  USING (auth.uid() = completed_by);

CREATE POLICY "Admins can manage all checklist sessions"
  ON public.checklist_sessions FOR ALL
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- PROPERTY RULES
-- ============================================================
CREATE TABLE public.property_rules (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title                 TEXT NOT NULL,
  description           TEXT,
  property_id           UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  is_universal          BOOLEAN NOT NULL DEFAULT false,
  applies_to_roles      TEXT[] NOT NULL DEFAULT '{}',
  visible_to_user_ids   UUID[] NOT NULL DEFAULT '{}',
  enacted_event_types   TEXT[] NOT NULL DEFAULT '{}',
  enacted_keywords      TEXT[] NOT NULL DEFAULT '{}',
  icon                  TEXT NOT NULL DEFAULT '⚠️',
  color                 TEXT NOT NULL DEFAULT 'amber',
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.property_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active rules"
  ON public.property_rules FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage property rules"
  ON public.property_rules FOR ALL
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_property_rules_updated_at
  BEFORE UPDATE ON public.property_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
