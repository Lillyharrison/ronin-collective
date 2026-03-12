
-- Drop the older duplicate triggers, keep the freshly created canonical ones
DROP TRIGGER IF EXISTS check_occupant_rules_on_change ON public.properties;
DROP TRIGGER IF EXISTS trg_sync_rules_on_occupancy ON public.properties;
