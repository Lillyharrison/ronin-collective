
-- ─── Function: check occupant rules and notify master admins ─────────────────
CREATE OR REPLACE FUNCTION public.notify_on_occupant_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule_record   RECORD;
  admin_record  RECORD;
  occupant_name TEXT;
  notif_title   TEXT;
  notif_body    TEXT;
BEGIN
  -- Only fire when occupied_by_profile_id actually changes
  IF OLD.occupied_by_profile_id IS NOT DISTINCT FROM NEW.occupied_by_profile_id THEN
    RETURN NEW;
  END IF;

  -- Occupant was cleared — nothing to activate
  IF NEW.occupied_by_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve occupant display name
  SELECT COALESCE(full_name, 'Unknown') INTO occupant_name
  FROM public.profiles
  WHERE id = NEW.occupied_by_profile_id;

  -- Find active rules for this property (or universal) that reference this occupant
  FOR rule_record IN
    SELECT *
    FROM public.property_rules
    WHERE is_active = true
      AND status = 'active'
      AND NEW.occupied_by_profile_id = ANY(enacted_occupant_ids)
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

  RETURN NEW;
END;
$$;

-- ─── Trigger: fire on every UPDATE to properties ──────────────────────────────
DROP TRIGGER IF EXISTS check_occupant_rules_on_change ON public.properties;

CREATE TRIGGER check_occupant_rules_on_change
  AFTER UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_occupant_change();
