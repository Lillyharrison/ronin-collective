DROP TRIGGER IF EXISTS trg_cascade_delete_planned_maintenance_calendar ON public.planned_maintenance;

CREATE TRIGGER trg_cascade_delete_planned_maintenance_calendar
  AFTER DELETE ON public.planned_maintenance
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_planned_maintenance_calendar();