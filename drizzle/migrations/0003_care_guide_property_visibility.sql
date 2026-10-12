DROP POLICY "Checklist visibility by dept and role" ON public.checklist_templates;
CREATE POLICY "Checklist visibility by dept and role" ON public.checklist_templates FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'master_admin'::app_role) OR ((is_published = true) AND can_user_see_checklist(assigned_department, assigned_role)
  AND (category <> 'care_guide' OR property_id IS NULL OR user_can_access_property(auth.uid(), property_id))));