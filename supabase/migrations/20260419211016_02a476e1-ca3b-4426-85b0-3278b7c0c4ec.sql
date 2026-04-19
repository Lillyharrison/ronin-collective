-- 1. Add the column
ALTER TABLE public.order_library_items
ADD COLUMN IF NOT EXISTS size text;

-- 2. Extract "Size: ..." from notes into the new column, then strip it from notes
WITH extracted AS (
  SELECT id,
         notes,
         (regexp_match(notes, '(?im)^\s*Size:\s*(.+?)\s*$'))[1] AS size_value
  FROM public.order_library_items
  WHERE notes ~* '(?m)^\s*Size:\s*.+$'
)
UPDATE public.order_library_items o
SET
  size  = extracted.size_value,
  notes = NULLIF(
    btrim(regexp_replace(o.notes, '(?im)^\s*Size:\s*.+$\n?', '', 'g')),
    ''
  )
FROM extracted
WHERE o.id = extracted.id;