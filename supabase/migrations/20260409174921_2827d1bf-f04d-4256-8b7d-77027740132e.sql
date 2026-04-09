-- Drop existing constraint
ALTER TABLE planned_maintenance DROP CONSTRAINT IF EXISTS planned_maintenance_status_check;

-- Update data
UPDATE planned_maintenance SET status = 'to_be_booked' WHERE status = 'unconfirmed';
UPDATE planned_maintenance SET status = 'booked' WHERE status = 'confirmed';

-- Add new constraint
ALTER TABLE planned_maintenance ADD CONSTRAINT planned_maintenance_status_check
  CHECK (status IN ('to_be_booked', 'booked', 'initiated_by_vendor', 'completed', 'cancelled'));

-- Update default
ALTER TABLE planned_maintenance ALTER COLUMN status SET DEFAULT 'to_be_booked';