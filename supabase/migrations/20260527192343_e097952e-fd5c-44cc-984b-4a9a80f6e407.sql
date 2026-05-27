ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS property_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
CREATE INDEX IF NOT EXISTS idx_vendors_property_ids ON public.vendors USING GIN (property_ids);