CREATE OR REPLACE FUNCTION public.is_team_member(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid,'master_admin') OR public.has_role(_uid,'admin') OR public.has_role(_uid,'manager')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND NOT p.is_archived
               AND cardinality(COALESCE(p.assigned_property_ids,'{}'::uuid[])) > 0)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can view vehicles" ON public.vehicles;
CREATE POLICY "Team can view vehicles" ON public.vehicles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'master_admin') OR has_role(auth.uid(),'admin')
  OR owner_profile_id = auth.uid()
  OR (property_id IS NOT NULL AND user_can_access_property(auth.uid(), property_id))
  OR (property_id IS NULL AND is_team_member(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can update gantt boards" ON public.gantt_shared_boards;
CREATE POLICY "Managers can update gantt boards" ON public.gantt_shared_boards FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'master_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
WITH CHECK (has_role(auth.uid(),'master_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "Participants and admins can update threads" ON public.chat_threads;
CREATE POLICY "Participants and admins can update threads" ON public.chat_threads FOR UPDATE TO authenticated
USING ((auth.uid() = ANY (participant_ids)) OR has_role(auth.uid(),'master_admin'))
WITH CHECK ((auth.uid() = ANY (participant_ids)) OR auth.uid() = created_by OR has_role(auth.uid(),'master_admin'));

DROP POLICY IF EXISTS "Authenticated can view published weeks" ON public.staff_schedule_publications;
CREATE POLICY "Team can view published weeks" ON public.staff_schedule_publications FOR SELECT TO authenticated
USING (is_team_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view presence" ON public.user_presence;
CREATE POLICY "Team can view presence" ON public.user_presence FOR SELECT TO authenticated
USING (auth.uid() = user_id OR is_team_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read system settings" ON public.system_settings;
CREATE POLICY "Team can read system settings" ON public.system_settings FOR SELECT TO authenticated
USING (is_team_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view checklist items" ON public.checklist_items;
CREATE POLICY "Users can view items of visible checklists" ON public.checklist_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.id = checklist_items.template_id));