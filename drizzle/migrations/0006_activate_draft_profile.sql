CREATE OR REPLACE FUNCTION public.activate_draft_profile(_draft_id uuid, _new_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  summary jsonb := '{}'::jsonb;
  n integer;
  cols text;
  ref record;
  r record;
  col_type text;
  refs text[][] := ARRAY[
    ['staff_shifts','staff_id'],['staff_shifts','created_by'],
    ['staff_schedules','staff_id'],['staff_schedules','created_by'],
    ['staff_leave_requests','staff_id'],['staff_leave_requests','created_by'],['staff_leave_requests','reviewed_by'],
    ['staff_schedule_publications','published_by'],['staff_schedule_shares','created_by'],
    ['push_subscriptions','user_id'],
    ['notifications','user_id'],['notifications','acknowledged_by'],
    ['tasks','assigned_to'],['tasks','created_by'],
    ['maintenance_issues','reported_by'],['maintenance_issues','assigned_to'],
    ['planned_maintenance','assigned_to'],['planned_maintenance','created_by'],
    ['orders','assigned_to'],['orders','created_by'],
    ['order_list_submissions','submitted_by'],['order_list_draft_lines','updated_by'],['order_library_items','created_by'],
    ['shopping_list_items','created_by'],['shopping_list_items','approved_by'],
    ['checklist_sessions','completed_by'],['checklist_comments','user_id'],['checklist_public_sessions','created_by'],
    ['checklist_templates','created_by'],['checklist_templates','order_recipient_ids'],
    ['chat_threads','created_by'],['chat_threads','participant_ids'],
    ['messages','sender_id'],['messages','seen_by'],['message_reactions','user_id'],
    ['calendar_events','created_by'],['calendar_events','assigned_staff_ids'],
    ['properties','occupied_by_profile_id'],['properties','occupied_by_profile_ids'],
    ['property_rules','created_by'],['property_rules','submitted_by'],['property_rules','visible_to_user_ids'],['property_rules','enacted_occupant_ids'],
    ['vehicles','owner_profile_id'],['vehicles','created_by'],
    ['car_wash_bookings','assigned_staff_id'],['car_wash_bookings','requested_by'],
    ['ronin_memories','subject_user_id'],['system_events','triggered_by'],
    ['manuals','created_by'],['vendors','created_by'],['system_settings','updated_by'],
    ['assets','created_by']
  ];
  i integer;
BEGIN
  -- a. validation
  IF _draft_id IS NULL OR _new_id IS NULL OR _draft_id = _new_id THEN
    RAISE EXCEPTION 'activate_draft_profile: ids must be non-null and different';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _draft_id AND is_draft = true) THEN
    RAISE EXCEPTION 'activate_draft_profile: draft profile % not found or not a draft', _draft_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _new_id) THEN
    RAISE EXCEPTION 'activate_draft_profile: login % does not exist', _new_id;
  END IF;

  -- b. copy profile (ensure the target row exists first)
  INSERT INTO profiles (id) VALUES (_new_id) ON CONFLICT (id) DO NOTHING;
  SELECT string_agg(format('%I = d.%I', column_name, column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name NOT IN ('id','created_at','updated_at');
  EXECUTE format('UPDATE profiles p SET %s FROM profiles d WHERE d.id = $1 AND p.id = $2', cols)
    USING _draft_id, _new_id;
  UPDATE profiles SET is_draft = false WHERE id = _new_id;
  summary := summary || jsonb_build_object('profiles', 1);

  -- c. one-row-per-person tables
  -- roles: exactly one role; UPDATE avoids the BEFORE INSERT replace trigger
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _draft_id) THEN
    DELETE FROM user_roles WHERE user_id = _new_id;
    DELETE FROM user_roles WHERE id IN (
      SELECT id FROM user_roles WHERE user_id = _draft_id ORDER BY id OFFSET 1);
    UPDATE user_roles SET user_id = _new_id WHERE user_id = _draft_id;
    GET DIAGNOSTICS n = ROW_COUNT; summary := summary || jsonb_build_object('user_roles', n);
  END IF;

  IF EXISTS (SELECT 1 FROM user_stats WHERE user_id = _draft_id) THEN
    DELETE FROM user_stats WHERE user_id = _new_id;
    UPDATE user_stats SET user_id = _new_id WHERE user_id = _draft_id;
    GET DIAGNOSTICS n = ROW_COUNT; summary := summary || jsonb_build_object('user_stats', n);
  END IF;

  IF EXISTS (SELECT 1 FROM user_presence WHERE user_id = _draft_id) THEN
    DELETE FROM user_presence WHERE user_id = _new_id;
    UPDATE user_presence SET user_id = _new_id WHERE user_id = _draft_id;
    GET DIAGNOSTICS n = ROW_COUNT; summary := summary || jsonb_build_object('user_presence', n);
  END IF;

  IF EXISTS (SELECT 1 FROM user_section_permissions WHERE user_id = _draft_id) THEN
    DELETE FROM user_section_permissions WHERE user_id = _new_id;
    UPDATE user_section_permissions SET user_id = _new_id WHERE user_id = _draft_id;
    GET DIAGNOSTICS n = ROW_COUNT; summary := summary || jsonb_build_object('user_section_permissions', n);
  END IF;

  IF EXISTS (SELECT 1 FROM user_preferences WHERE user_id = _draft_id) THEN
    DELETE FROM user_preferences d WHERE d.user_id = _draft_id
      AND EXISTS (SELECT 1 FROM user_preferences x WHERE x.user_id = _new_id AND x.key = d.key);
    UPDATE user_preferences SET user_id = _new_id WHERE user_id = _draft_id;
    GET DIAGNOSTICS n = ROW_COUNT; summary := summary || jsonb_build_object('user_preferences', n);
  END IF;

  IF EXISTS (SELECT 1 FROM user_thread_settings WHERE user_id = _draft_id) THEN
    DELETE FROM user_thread_settings d WHERE d.user_id = _draft_id
      AND EXISTS (SELECT 1 FROM user_thread_settings x WHERE x.user_id = _new_id AND x.thread_id = d.thread_id);
    UPDATE user_thread_settings SET user_id = _new_id WHERE user_id = _draft_id;
    GET DIAGNOSTICS n = ROW_COUNT; summary := summary || jsonb_build_object('user_thread_settings', n);
  END IF;

  -- d. all other references (names verified at run time)
  FOR i IN 1 .. array_length(refs, 1) LOOP
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = refs[i][1] AND column_name = refs[i][2]
      AND (udt_name = 'uuid' OR udt_name = '_uuid');
    CONTINUE WHEN col_type IS NULL;

    IF col_type = 'ARRAY' THEN
      EXECUTE format(
        'UPDATE %I SET %I = (SELECT array_agg(DISTINCT e) FROM unnest(array_replace(%I, $1, $2)) e) WHERE $1 = ANY(%I)',
        refs[i][1], refs[i][2], refs[i][2], refs[i][2]) USING _draft_id, _new_id;
      GET DIAGNOSTICS n = ROW_COUNT;
    ELSE
      BEGIN
        EXECUTE format('UPDATE %I SET %I = $2 WHERE %I = $1', refs[i][1], refs[i][2], refs[i][2])
          USING _draft_id, _new_id;
        GET DIAGNOSTICS n = ROW_COUNT;
      EXCEPTION WHEN unique_violation THEN
        -- row by row: drop the draft's duplicate when an identical row exists for the new id
        n := 0;
        FOR r IN EXECUTE format('SELECT ctid AS c FROM %I WHERE %I = $1', refs[i][1], refs[i][2]) USING _draft_id LOOP
          BEGIN
            EXECUTE format('UPDATE %I SET %I = $2 WHERE ctid = $1', refs[i][1], refs[i][2]) USING r.c, _new_id;
            n := n + 1;
          EXCEPTION WHEN unique_violation THEN
            EXECUTE format('DELETE FROM %I WHERE ctid = $1', refs[i][1]) USING r.c;
          END;
        END LOOP;
      END;
    END IF;
    IF n > 0 THEN
      summary := summary || jsonb_build_object(refs[i][1] || '.' || refs[i][2], n);
    END IF;
  END LOOP;

  -- e. remove the draft last
  DELETE FROM profiles WHERE id = _draft_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_draft_profile: failed to remove draft %', _draft_id;
  END IF;

  RETURN summary;
END;
$fn$;

REVOKE ALL ON FUNCTION public.activate_draft_profile(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_draft_profile(uuid, uuid) TO service_role;