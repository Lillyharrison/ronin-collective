
-- Function to fan-out notifications when a calendar event is created on Ronin
CREATE OR REPLACE FUNCTION public.notify_on_calendar_event_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_section TEXT;
  notif_title    TEXT;
  notif_body     TEXT;
  date_str       TEXT;
  user_record    RECORD;
BEGIN
  -- Only process manually-created Ronin events; skip iCal synced events to avoid flood
  IF NEW.calendar_source = 'ical' THEN
    RETURN NEW;
  END IF;

  -- Skip staff/shift events — these are transparency-only, no alerts needed
  IF NEW.event_type IN ('staff', 'shift', 'schedule') THEN
    RETURN NEW;
  END IF;

  -- Map event_type → section that controls who gets notified
  CASE NEW.event_type
    WHEN 'birthday'              THEN target_section := 'meet-team';
    WHEN 'maintenance', 'repair' THEN target_section := 'maintenance';
    WHEN 'delivery', 'order'     THEN target_section := 'orders';
    ELSE                              target_section := 'calendar';
  END CASE;

  -- Human-readable date range
  date_str := to_char(NEW.start_date AT TIME ZONE 'UTC', 'Mon DD, YYYY');
  IF NEW.end_date IS NOT NULL AND NEW.end_date::date != NEW.start_date::date THEN
    date_str := date_str || ' – ' || to_char(NEW.end_date AT TIME ZONE 'UTC', 'Mon DD');
  END IF;

  -- Build title with a contextual emoji
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

  notif_body := COALESCE(
    NULLIF(NEW.description, ''),
    date_str
  );

  -- Fan-out: notify every user who has alerts turned on for target_section
  -- UNION with master_admins who always receive calendar alerts
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
      user_id,
      title,
      body,
      type,
      action_url,
      entity_id,
      entity_type,
      property_id
    ) VALUES (
      user_record.user_id,
      notif_title,
      notif_body,
      'calendar_event',
      'calendar',
      NEW.id,
      'calendar_event',
      NEW.property_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Attach the trigger to calendar_events (INSERT only)
DROP TRIGGER IF EXISTS on_calendar_event_insert_notify ON public.calendar_events;
CREATE TRIGGER on_calendar_event_insert_notify
  AFTER INSERT ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_calendar_event_insert();
