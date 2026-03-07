
-- Fix overly permissive UPDATE policy on shopping_list_items
DROP POLICY "Authenticated users can update shopping items" ON public.shopping_list_items;

CREATE POLICY "Authenticated users can update shopping items"
  ON public.shopping_list_items FOR UPDATE
  USING (auth.uid() IS NOT NULL);
