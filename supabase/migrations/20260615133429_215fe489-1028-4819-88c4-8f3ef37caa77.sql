WITH stale AS (
  SELECT id, calendar_event_id
  FROM public.planned_maintenance
  WHERE calendar_event_id IS NOT NULL
    AND status NOT IN ('booked', 'initiated_by_vendor', 'completed')
),
del AS (
  DELETE FROM public.calendar_events
  WHERE id IN (SELECT calendar_event_id FROM stale)
  RETURNING id
)
UPDATE public.planned_maintenance
SET calendar_event_id = NULL
WHERE id IN (SELECT id FROM stale);