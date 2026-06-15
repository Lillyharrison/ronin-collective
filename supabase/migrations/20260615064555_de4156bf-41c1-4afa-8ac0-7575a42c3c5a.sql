ALTER TABLE public.order_library_items
  ADD COLUMN IF NOT EXISTS property_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
CREATE INDEX IF NOT EXISTS idx_order_library_property_ids
  ON public.order_library_items USING GIN (property_ids);