-- Add multi-occupant array column to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS occupied_by_profile_ids uuid[] NOT NULL DEFAULT '{}';

-- Migrate any existing single occupant into the new array
UPDATE public.properties
SET occupied_by_profile_ids = ARRAY[occupied_by_profile_id]
WHERE occupied_by_profile_id IS NOT NULL;