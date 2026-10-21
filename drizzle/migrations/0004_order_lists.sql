ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS order_recipient_ids uuid[] NOT NULL DEFAULT '{}';

DROP POLICY IF EXISTS "Checklist visibility by dept and role" ON public.checklist_templates;
CREATE POLICY "Checklist visibility by dept and role" ON public.checklist_templates
FOR SELECT USING (
  has_role(auth.uid(), 'master_admin'::app_role)
  OR (
    is_published = true
    AND can_user_see_checklist(assigned_department, assigned_role)
    AND ((category <> 'care_guide'::text) OR (property_id IS NULL) OR user_can_access_property(auth.uid(), property_id))
    AND ((kind <> 'order_list'::text) OR user_can_access_property(auth.uid(), property_id))
  )
);

CREATE TABLE public.order_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  library_item_id uuid NOT NULL REFERENCES public.order_library_items(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, library_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_list_items TO authenticated;
GRANT ALL ON public.order_list_items TO service_role;
ALTER TABLE public.order_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View order list items for visible lists" ON public.order_list_items
FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.id = template_id));
CREATE POLICY "Admins manage order list items" ON public.order_list_items
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.order_list_draft_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  library_item_id uuid NOT NULL REFERENCES public.order_library_items(id) ON DELETE CASCADE,
  quantity text,
  comment text,
  photo_url text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, library_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_list_draft_lines TO authenticated;
GRANT ALL ON public.order_list_draft_lines TO service_role;
ALTER TABLE public.order_list_draft_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users with list access manage draft lines" ON public.order_list_draft_lines
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.id = template_id AND t.kind = 'order_list'))
WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.id = template_id AND t.kind = 'order_list'));
CREATE TRIGGER update_order_list_draft_lines_updated_at BEFORE UPDATE ON public.order_list_draft_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_list_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  property_id uuid,
  submitted_by uuid NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_list_submissions TO authenticated;
GRANT ALL ON public.order_list_submissions TO service_role;
ALTER TABLE public.order_list_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View submissions for accessible properties" ON public.order_list_submissions
FOR SELECT TO authenticated USING (user_can_access_property(auth.uid(), property_id));

CREATE POLICY "Authenticated can upload order request photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-library' AND (storage.foldername(name))[1] = 'order-requests');