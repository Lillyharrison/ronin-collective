
-- Add only_when_occupied column to property_rules
ALTER TABLE public.property_rules
  ADD COLUMN IF NOT EXISTS only_when_occupied boolean NOT NULL DEFAULT false;

-- Function: auto-deactivate/reactivate rules when property occupancy changes
CREATE OR REPLACE FUNCTION public.sync_rules_on_occupancy_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- occupied_by was cleared → deactivate rules marked only_when_occupied for this property
  IF (OLD.occupied_by IS NOT NULL OR OLD.status = 'occupied')
     AND (NEW.occupied_by IS NULL AND NEW.status != 'occupied') THEN
    UPDATE public.property_rules
    SET is_active = false,
        updated_at = now()
    WHERE property_id = NEW.id
      AND only_when_occupied = true
      AND is_active = true
      AND status = 'active';

  -- occupied_by was set → re-activate rules marked only_when_occupied for this property
  ELSIF (OLD.occupied_by IS NULL OR OLD.status != 'occupied')
        AND (NEW.occupied_by IS NOT NULL OR NEW.status = 'occupied') THEN
    UPDATE public.property_rules
    SET is_active = true,
        updated_at = now()
    WHERE property_id = NEW.id
      AND only_when_occupied = true
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to properties table
DROP TRIGGER IF EXISTS trg_sync_rules_on_occupancy ON public.properties;
CREATE TRIGGER trg_sync_rules_on_occupancy
  AFTER UPDATE OF occupied_by, status ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_rules_on_occupancy_change();
