
-- ─── Standalone orders table (decoupled from tasks) ───────────────────────────
CREATE TABLE public.orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  property_id         UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  source_task_id      UUID,                    -- soft reference only, no FK
  status              TEXT NOT NULL DEFAULT 'pending_delivery',  -- pending_delivery | delivered
  expected_delivery   DATE,
  delivered_at        TIMESTAMP WITH TIME ZONE,
  carrier             TEXT,
  tracking_number     TEXT,
  tracking_url        TEXT,
  packing_list        TEXT,
  notes               TEXT,
  created_by          UUID,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view orders"
  ON public.orders FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert orders"
  ON public.orders FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Managers and above can update orders"
  ON public.orders FOR UPDATE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admins can delete orders"
  ON public.orders FOR DELETE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Shopping list items ───────────────────────────────────────────────────────
CREATE TABLE public.shopping_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'other',   -- food | cleaning | supplies | personal | tech | other
  is_checked  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  created_by  UUID,
  quantity    TEXT,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view shopping list"
  ON public.shopping_list_items FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert shopping items"
  ON public.shopping_list_items FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update shopping items"
  ON public.shopping_list_items FOR UPDATE USING (true);

CREATE POLICY "Managers and above can delete shopping items"
  ON public.shopping_list_items FOR DELETE
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    auth.uid() = created_by
  );

CREATE TRIGGER update_shopping_list_items_updated_at
  BEFORE UPDATE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
