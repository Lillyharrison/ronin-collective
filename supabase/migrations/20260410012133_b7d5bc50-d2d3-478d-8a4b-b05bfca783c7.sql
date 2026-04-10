
CREATE OR REPLACE FUNCTION public.cascade_delete_planned_maintenance_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.calendar_event_id IS NOT NULL THEN
    DELETE FROM public.calendar_events WHERE id = OLD.calendar_event_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cascade_delete_planned_maintenance_calendar
  AFTER DELETE ON public.planned_maintenance
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_planned_maintenance_calendar();
