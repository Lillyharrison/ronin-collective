
-- Fix: notify_on_occupant_change was watching occupied_by_profile_id (singular/legacy)
-- but the system now uses occupied_by_profile_ids (array). 
-- Rewrite the function to diff the array and fire for each newly added occupant.

CREATE OR REPLACE FUNCTION public.notify_on_occupant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rule_record    RECORD;
  admin_record   RECORD;
  occupant_id    uuid;
  occupant_name  TEXT;
  notif_title    TEXT;
  notif_body     TEXT;
  added_ids      uuid[];
BEGIN
  -- Only fire when occupied_by_profile_ids array actually changes
  IF OLD.occupied_by_profile_ids IS NOT DISTINCT FROM NEW.occupied_by_profile_ids THEN
    RETURN NEW;
  END IF;

  -- Compute the IDs that were added (present in NEW but not in OLD)
  SELECT ARRAY(
    SELECT UNNEST(NEW.occupied_by_profile_ids)
    EXCEPT
    SELECT UNNEST(OLD.occupied_by_profile_ids)
  ) INTO added_ids;

  -- Nothing added (only removals) → nothing to activate
  IF array_length(added_ids, 1) IS NULL OR array_length(added_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- For each newly added occupant, check if any rules reference them
  FOREACH occupant_id IN ARRAY added_ids LOOP

    -- Resolve display name
    SELECT COALESCE(full_name, 'Unknown') INTO occupant_name
    FROM public.profiles
    WHERE id = occupant_id;

    -- Find active rules for this property (or universal) that reference this occupant
    FOR rule_record IN
      SELECT *
      FROM public.property_rules
      WHERE is_active = true
        AND status = 'active'
        AND occupant_id = ANY(enacted_occupant_ids)
        AND (property_id = NEW.id OR is_universal = true)
    LOOP
      notif_title := rule_record.icon || ' Rule triggered: ' || rule_record.title;
      notif_body  := occupant_name || ' is now at ' || NEW.name ||
                     '. Tap to review and confirm this alert.';

      -- Notify every master_admin
      FOR admin_record IN
        SELECT user_id FROM public.user_roles WHERE role = 'master_admin'
      LOOP
        INSERT INTO public.notifications (
          user_id,
          title,
          body,
          type,
          action_url,
          entity_id,
          entity_type,
          property_id
        ) VALUES (
          admin_record.user_id,
          notif_title,
          notif_body,
          'rule_trigger',
          'rules',
          rule_record.id,
          'property_rule',
          NEW.id
        );
      END LOOP;
    END LOOP;

  END LOOP;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger is attached watching the array column
DROP TRIGGER IF EXISTS on_occupant_change ON public.properties;
CREATE TRIGGER on_occupant_change
  AFTER UPDATE OF occupied_by_profile_ids ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_occupant_change();
