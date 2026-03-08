
-- Add external_uid to deduplicate synced iCal events
ALTER TABLE public.calendar_events 
  ADD COLUMN IF NOT EXISTS external_uid TEXT,
  ADD COLUMN IF NOT EXISTS calendar_source TEXT DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external_uid 
  ON public.calendar_events(external_uid) 
  WHERE external_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON public.calendar_events(calendar_source);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON public.calendar_events(start_date);
