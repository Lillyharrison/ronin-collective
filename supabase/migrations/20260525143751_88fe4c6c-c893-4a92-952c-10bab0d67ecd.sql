ALTER TABLE planned_maintenance DROP CONSTRAINT IF EXISTS planned_maintenance_status_check;
ALTER TABLE planned_maintenance ADD CONSTRAINT planned_maintenance_status_check
  CHECK (status IN ('future', 'to_be_booked', 'booked', 'initiated_by_vendor', 'completed', 'cancelled'));