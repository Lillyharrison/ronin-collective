-- Self-rolling-back verification of public.activate_draft_profile.
-- Run as one statement; it ALWAYS ends with an exception so nothing persists.
-- Expected final error text: "ALL CHECKS PASSED: {...summary...}".
DO $t$
DECLARE
  d uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
  prop uuid;
  s jsonb;
  failed boolean := false;
BEGIN
  SELECT id INTO prop FROM properties LIMIT 1;

  -- draft with history
  INSERT INTO profiles (id, full_name, is_draft, department, job_title, contracted_days_per_week, annual_leave_days, assigned_property_ids)
  VALUES (d, 'TEST Draft', true, 'Housekeeping', 'Housekeeper', 5, 20, ARRAY[prop]);
  -- profile insert trigger gave the draft a role + stats; override role
  UPDATE user_roles SET role = 'manager' WHERE user_id = d;
  INSERT INTO staff_shifts (staff_id, property_id, shift_date, status) VALUES (d, prop, CURRENT_DATE, 'scheduled');
  INSERT INTO notifications (user_id, title, type, acknowledged_by) VALUES (d, 'TEST', 'test', ARRAY[d]);

  -- failure case: non-draft id must raise and leave the draft untouched
  BEGIN
    PERFORM activate_draft_profile(d, d);
    failed := true;
  EXCEPTION WHEN others THEN NULL;
  END;
  IF failed THEN RAISE EXCEPTION 'FAIL: same-id activation did not raise'; END IF;
  BEGIN
    PERFORM activate_draft_profile(d, gen_random_uuid()); -- no such login
    failed := true;
  EXCEPTION WHEN others THEN NULL;
  END;
  IF failed THEN RAISE EXCEPTION 'FAIL: missing login did not raise'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = d AND is_draft) THEN RAISE EXCEPTION 'FAIL: draft lost after failed activation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_shifts WHERE staff_id = d) THEN RAISE EXCEPTION 'FAIL: draft shifts lost after failed activation'; END IF;

  -- success case: create login (signup triggers make blank profile, staff role, stats)
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'activation-test-' || u || '@example.invalid', '{}'::jsonb, now(), now());

  s := activate_draft_profile(d, u);

  IF EXISTS (SELECT 1 FROM profiles WHERE id = d) THEN RAISE EXCEPTION 'FAIL: draft not removed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = u AND NOT is_draft AND full_name = 'TEST Draft'
                 AND department = 'Housekeeping' AND contracted_days_per_week = 5 AND annual_leave_days = 20
                 AND assigned_property_ids = ARRAY[prop]) THEN RAISE EXCEPTION 'FAIL: profile fields not copied'; END IF;
  IF (SELECT count(*) FROM user_roles WHERE user_id = u) <> 1
     OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = u AND role = 'manager') THEN RAISE EXCEPTION 'FAIL: role'; END IF;
  IF (SELECT count(*) FROM user_stats WHERE user_id = u) <> 1 THEN RAISE EXCEPTION 'FAIL: stats'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_shifts WHERE staff_id = u) THEN RAISE EXCEPTION 'FAIL: shifts not moved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = u AND acknowledged_by = ARRAY[u]) THEN RAISE EXCEPTION 'FAIL: notifications not moved'; END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED: %', s;
END
$t$;
