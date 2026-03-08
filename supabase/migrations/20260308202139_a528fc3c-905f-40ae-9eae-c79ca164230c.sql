
-- Add profile-linked occupant to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS occupied_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add occupant trigger field to property_rules
ALTER TABLE public.property_rules
  ADD COLUMN IF NOT EXISTS enacted_occupant_ids uuid[] NOT NULL DEFAULT '{}';
