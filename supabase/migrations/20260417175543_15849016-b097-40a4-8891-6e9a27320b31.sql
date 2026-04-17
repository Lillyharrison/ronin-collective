-- Step 1: Add a dedicated column for Quick Actions (currently lives in section_permissions._quick_actions)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quick_actions text[] NOT NULL DEFAULT '{}';

-- Step 2: Backfill quick_actions from the old JSONB blob
UPDATE public.profiles
SET quick_actions = ARRAY(
  SELECT jsonb_array_elements_text(section_permissions->'_quick_actions')
)
WHERE section_permissions IS NOT NULL
  AND jsonb_typeof(section_permissions->'_quick_actions') = 'array';

-- Step 3: Final sync of section_permissions JSONB → user_section_permissions table
-- (defensive — should already be synced from previous migration, but guarantees no data loss)
DO $$
DECLARE
  prof RECORD;
  section_key TEXT;
  section_val JSONB;
BEGIN
  FOR prof IN
    SELECT p.id, p.section_permissions
    FROM public.profiles p
    INNER JOIN auth.users u ON u.id = p.id
    WHERE p.section_permissions IS NOT NULL
      AND jsonb_typeof(p.section_permissions) = 'object'
  LOOP
    FOR section_key, section_val IN
      SELECT * FROM jsonb_each(prof.section_permissions)
    LOOP
      -- Skip the _quick_actions key (it's an array, handled above)
      IF section_key = '_quick_actions' THEN CONTINUE; END IF;
      IF jsonb_typeof(section_val) <> 'object' THEN CONTINUE; END IF;

      INSERT INTO public.user_section_permissions (user_id, section, can_view, can_edit, notifications)
      VALUES (
        prof.id,
        section_key,
        COALESCE((section_val->>'view')::boolean, false),
        COALESCE((section_val->>'edit')::boolean, false),
        COALESCE((section_val->>'notifications')::boolean, false)
      )
      ON CONFLICT (user_id, section) DO NOTHING;  -- table wins; don't overwrite recent edits
    END LOOP;
  END LOOP;
END $$;

-- Step 4: Drop the deprecated JSONB column. This makes it structurally impossible
-- for any code path to write permissions to the wrong place.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS section_permissions;