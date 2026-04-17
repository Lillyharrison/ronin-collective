DO $$
DECLARE
  prof RECORD;
  section_key TEXT;
  section_val JSONB;
BEGIN
  FOR prof IN
    SELECT p.id, p.section_permissions
    FROM public.profiles p
    INNER JOIN auth.users u ON u.id = p.id  -- only profiles tied to a real auth user
    WHERE p.section_permissions IS NOT NULL
      AND jsonb_typeof(p.section_permissions) = 'object'
  LOOP
    FOR section_key, section_val IN
      SELECT * FROM jsonb_each(prof.section_permissions)
    LOOP
      IF jsonb_typeof(section_val) <> 'object' THEN
        CONTINUE;
      END IF;

      INSERT INTO public.user_section_permissions (user_id, section, can_view, can_edit, notifications)
      VALUES (
        prof.id,
        section_key,
        COALESCE((section_val->>'view')::boolean, false),
        COALESCE((section_val->>'edit')::boolean, false),
        COALESCE((section_val->>'notifications')::boolean, false)
      )
      ON CONFLICT (user_id, section) DO UPDATE
        SET can_view = EXCLUDED.can_view,
            can_edit = EXCLUDED.can_edit,
            notifications = EXCLUDED.notifications,
            updated_at = now();
    END LOOP;
  END LOOP;
END $$;