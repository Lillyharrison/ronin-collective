INSERT INTO public.user_section_permissions (user_id, section, can_view, can_edit, notifications)
SELECT usp.user_id, s.section, usp.can_view, false, usp.notifications
FROM public.user_section_permissions usp
CROSS JOIN (VALUES ('maintenance-repairs'), ('maintenance-planned')) AS s(section)
WHERE usp.section = 'maintenance'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_section_permissions x
    WHERE x.user_id = usp.user_id AND x.section = s.section
  );

CREATE OR REPLACE FUNCTION public.notify_on_calendar_event_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_section TEXT;
  notif_title    TEXT;
  notif_body     TEXT;
  date_str       TEXT;
  user_record    RECORD;
BEGIN
  IF NEW.calendar_source = 'ical' THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type IN ('staff', 'shift', 'schedule') THEN
    RETURN NEW;
  END IF;

  CASE NEW.event_type
    WHEN 'birthday'    THEN target_section := 'meet-team';
    WHEN 'maintenance' THEN target_section := 'maintenance-planned';
    WHEN 'repair'      THEN target_section := 'maintenance-repairs';
    WHEN 'delivery'    THEN target_section := 'orders';
    WHEN 'order'       THEN target_section := 'orders';
    ELSE                    target_section := 'calendar';
  END CASE;

  date_str := to_char(NEW.start_date AT TIME ZONE 'UTC', 'Mon DD, YYYY');
  IF NEW.end_date IS NOT NULL AND NEW.end_date::date != NEW.start_date::date THEN
    date_str := date_str || ' – ' || to_char(NEW.end_date AT TIME ZONE 'UTC', 'Mon DD');
  END IF;

  notif_title := CASE NEW.event_type
    WHEN 'birthday'    THEN '🎂 Birthday: ' || NEW.title
    WHEN 'maintenance' THEN '🔧 Maintenance: ' || NEW.title
    WHEN 'repair'      THEN '🔧 Repair: ' || NEW.title
    WHEN 'delivery'    THEN '📦 Delivery: ' || NEW.title
    WHEN 'order'       THEN '📦 Order: ' || NEW.title
    WHEN 'travel'      THEN '✈️ Travel: ' || NEW.title
    WHEN 'guest'       THEN '🏠 Guest: ' || NEW.title
    ELSE                    '📅 ' || NEW.title
  END;

  notif_body := COALESCE(NULLIF(NEW.description, ''), date_str);

  FOR user_record IN
    SELECT DISTINCT usp.user_id
    FROM public.user_section_permissions usp
    WHERE usp.section = target_section
      AND usp.notifications = true
    UNION
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'master_admin'
  LOOP
    INSERT INTO public.notifications (
      user_id, title, body, type, action_url, entity_id, entity_type, property_id
    ) VALUES (
      user_record.user_id, notif_title, notif_body, 'calendar_event', 'calendar',
      NEW.id, 'calendar_event', NEW.property_id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;