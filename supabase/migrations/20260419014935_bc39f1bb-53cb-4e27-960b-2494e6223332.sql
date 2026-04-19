-- ============================================================
-- Order Library — Step 1 (final: trigram index, fully immutable)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Permission helper
CREATE OR REPLACE FUNCTION public.can_edit_orders(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'master_admin'::app_role)
    OR public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_section_permissions
      WHERE user_id = _user_id
        AND section = 'orders'
        AND can_edit = true
    );
$$;

-- 2. order_library_items table
CREATE TABLE public.order_library_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  category               text NOT NULL DEFAULT 'other',
  image_url              text,
  website_url            text,
  notes                  text,
  default_quantity       text,
  status                 text NOT NULL DEFAULT 'preferred'
                         CHECK (status IN ('preferred','no_longer_preferred')),
  substitutions_allowed  boolean NOT NULL DEFAULT false,
  search_aliases         text[] NOT NULL DEFAULT '{}',
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Trigram fuzzy index on name + concatenated aliases
CREATE INDEX idx_order_library_name_trgm
  ON public.order_library_items USING GIN (name gin_trgm_ops);

CREATE INDEX idx_order_library_aliases
  ON public.order_library_items USING GIN (search_aliases);

CREATE INDEX idx_order_library_status   ON public.order_library_items(status);
CREATE INDEX idx_order_library_category ON public.order_library_items(category);

CREATE TRIGGER trg_order_library_items_updated_at
BEFORE UPDATE ON public.order_library_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RLS
ALTER TABLE public.order_library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view library"
ON public.order_library_items
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Orders editors can insert library items"
ON public.order_library_items
FOR INSERT TO authenticated
WITH CHECK (public.can_edit_orders(auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Orders editors can update library items"
ON public.order_library_items
FOR UPDATE TO authenticated
USING (public.can_edit_orders(auth.uid()));

CREATE POLICY "Orders editors can delete library items"
ON public.order_library_items
FOR DELETE TO authenticated
USING (public.can_edit_orders(auth.uid()));

-- 4. Soft link shopping list → library
ALTER TABLE public.shopping_list_items
ADD COLUMN IF NOT EXISTS library_item_id uuid;

CREATE INDEX IF NOT EXISTS idx_shopping_list_library
  ON public.shopping_list_items(library_item_id);

-- 5. Storage bucket for library item images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-library',
  'order-library',
  true,
  10485760,
  ARRAY['image/png','image/jpeg','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read order-library"
ON storage.objects
FOR SELECT
USING (bucket_id = 'order-library');

CREATE POLICY "Orders editors can upload to order-library"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-library' AND public.can_edit_orders(auth.uid()));

CREATE POLICY "Orders editors can update order-library"
ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'order-library' AND public.can_edit_orders(auth.uid()));

CREATE POLICY "Orders editors can delete order-library"
ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'order-library' AND public.can_edit_orders(auth.uid()));