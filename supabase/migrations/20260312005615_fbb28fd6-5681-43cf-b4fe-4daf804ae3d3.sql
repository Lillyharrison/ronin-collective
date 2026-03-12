
-- Attach the occupant-change notification trigger (function already exists)
DROP TRIGGER IF EXISTS on_occupant_change ON public.properties;
CREATE TRIGGER on_occupant_change
  AFTER UPDATE OF occupied_by_profile_ids ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_occupant_change();

-- Attach the rule sync trigger watching both the array and legacy columns
DROP TRIGGER IF EXISTS on_occupancy_sync ON public.properties;
CREATE TRIGGER on_occupancy_sync
  AFTER UPDATE OF occupied_by_profile_ids, occupied_by, status ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_rules_on_occupancy_change();
