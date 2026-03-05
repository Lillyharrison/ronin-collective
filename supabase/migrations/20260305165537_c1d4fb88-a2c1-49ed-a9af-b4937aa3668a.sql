
-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── CALENDAR EVENTS TABLE ────────────────────────────────────────────────────
CREATE TABLE public.calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  event_type      text NOT NULL DEFAULT 'general',
  start_date      timestamp with time zone NOT NULL,
  end_date        timestamp with time zone,
  property_id     uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  created_by      uuid,
  assigned_staff_ids uuid[] DEFAULT '{}',
  keywords        text[] DEFAULT '{}',
  location        text,
  is_private      boolean NOT NULL DEFAULT false,
  notes           text,
  status          text NOT NULL DEFAULT 'upcoming',
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all calendar events"
ON public.calendar_events FOR ALL
USING (
  has_role(auth.uid(), 'master_admin'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Principal can view all calendar events"
ON public.calendar_events FOR SELECT
USING (has_role(auth.uid(), 'principal'::app_role));

CREATE POLICY "Staff can view assigned and non-private events"
ON public.calendar_events FOR SELECT
USING (
  (NOT is_private) OR
  (auth.uid() = ANY(assigned_staff_ids))
);

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── PROACTIVE RONIN WEBHOOK TRIGGER ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_ronin_on_calendar_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://apaoexixichuqeuhinss.supabase.co/functions/v1/ronin-event-listener',
    headers := jsonb_build_object(
      'Content-Type',           'application/json',
      'x-ronin-webhook-secret', 'ronin-event-webhook-2026'
    ),
    body    := jsonb_build_object(
      'event_id',           NEW.id,
      'title',              NEW.title,
      'description',        COALESCE(NEW.description, ''),
      'event_type',         NEW.event_type,
      'start_date',         NEW.start_date,
      'end_date',           NEW.end_date,
      'property_id',        NEW.property_id,
      'created_by',         NEW.created_by,
      'assigned_staff_ids', COALESCE(NEW.assigned_staff_ids, '{}'),
      'keywords',           COALESCE(NEW.keywords, '{}'),
      'location',           COALESCE(NEW.location, ''),
      'is_private',         NEW.is_private,
      'notes',              COALESCE(NEW.notes, '')
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_calendar_event_created
  AFTER INSERT ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_ronin_on_calendar_event();

-- ─── SYSTEM_EVENTS CALENDAR TRIGGER ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_ronin_on_system_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type IN ('calendar_entry', 'travel_event', 'guest_arrival', 'guest_departure') THEN
    PERFORM net.http_post(
      url     := 'https://apaoexixichuqeuhinss.supabase.co/functions/v1/ronin-event-listener',
      headers := jsonb_build_object(
        'Content-Type',           'application/json',
        'x-ronin-webhook-secret', 'ronin-event-webhook-2026'
      ),
      body    := jsonb_build_object(
        'source',      'system_event',
        'event_id',    NEW.id,
        'event_type',  NEW.event_type,
        'property_id', NEW.property_id,
        'created_by',  NEW.triggered_by,
        'payload',     COALESCE(NEW.payload, '{}')
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_system_event_calendar
  AFTER INSERT ON public.system_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_ronin_on_system_event();
