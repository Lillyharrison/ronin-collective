ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_assigned_to_idx ON public.orders(assigned_to);