
-- ─── RONIN PLATFORM MONITOR: DB TRIGGERS ────────────────────────────────────
-- These triggers insert rows into system_events whenever something significant
-- happens on the platform, so Ronin's event listener can react.

-- ── 1. PROPERTY OCCUPANCY CHANGED ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_ronin_on_occupancy_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when occupied_by or status actually changes
  IF (OLD.occupied_by IS DISTINCT FROM NEW.occupied_by) OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.system_events (event_type, entity_type, entity_id, property_id, payload)
    VALUES (
      'occupancy_changed',
      'property',
      NEW.id,
      NEW.id,
      jsonb_build_object(
        'property_name',  NEW.name,
        'old_occupant',   OLD.occupied_by,
        'new_occupant',   NEW.occupied_by,
        'old_status',     OLD.status,
        'new_status',     NEW.status,
        'address',        NEW.address,
        'city',           NEW.city
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ronin_occupancy ON public.properties;
CREATE TRIGGER trg_ronin_occupancy
  AFTER UPDATE OF occupied_by, status ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.notify_ronin_on_occupancy_change();

-- ── 2. URGENT TASK CREATED OR ESCALATED ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_ronin_on_urgent_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- New urgent task created
  IF (TG_OP = 'INSERT' AND NEW.status = 'urgent') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'urgent' AND OLD.status != 'urgent') THEN
    INSERT INTO public.system_events (event_type, entity_type, entity_id, property_id, triggered_by, payload)
    VALUES (
      'urgent_task',
      'task',
      NEW.id,
      NEW.property_id,
      NEW.created_by,
      jsonb_build_object(
        'task_title',     NEW.title_en,
        'description',    NEW.description_en,
        'category',       NEW.category,
        'assigned_to',    NEW.assigned_to,
        'due_date',       NEW.due_date,
        'from_status',    OLD.status,
        'priority',       NEW.priority
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ronin_urgent_task ON public.tasks;
CREATE TRIGGER trg_ronin_urgent_task
  AFTER INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_ronin_on_urgent_task();

-- ── 3. PENDING RULE SUBMITTED (requires approval) ────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_ronin_on_rule_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.system_events (event_type, entity_type, entity_id, property_id, triggered_by, payload)
    VALUES (
      'rule_submitted',
      'property_rule',
      NEW.id,
      NEW.property_id,
      NEW.submitted_by,
      jsonb_build_object(
        'rule_title',       NEW.title,
        'description',      NEW.description,
        'submitted_source', NEW.submitted_source,
        'color',            NEW.color,
        'icon',             NEW.icon,
        'is_universal',     NEW.is_universal
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ronin_rule_submitted ON public.property_rules;
CREATE TRIGGER trg_ronin_rule_submitted
  AFTER INSERT OR UPDATE OF status ON public.property_rules
  FOR EACH ROW EXECUTE FUNCTION public.notify_ronin_on_rule_submitted();

-- ── 4. OVERDUE TASK WATCHER (triggered by daily cron, not real-time) ─────────
-- Handled via a pg_cron job calling the system_events insert directly.
-- This is a helper function to insert an overdue-task digest event.
CREATE OR REPLACE FUNCTION public.notify_ronin_overdue_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  overdue_count integer;
BEGIN
  SELECT COUNT(*) INTO overdue_count
  FROM public.tasks
  WHERE status NOT IN ('completed')
    AND due_date < NOW()
    AND due_date IS NOT NULL;

  IF overdue_count > 0 THEN
    INSERT INTO public.system_events (event_type, entity_type, payload)
    VALUES (
      'overdue_tasks_digest',
      'task',
      jsonb_build_object('overdue_count', overdue_count)
    );
  END IF;
END;
$$;

-- Update system_events trigger to also fire on new occupancy/task/rule events
CREATE OR REPLACE FUNCTION public.notify_ronin_on_system_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Forward ALL relevant event types to the edge function
  IF NEW.event_type IN (
    'calendar_entry', 'travel_event', 'guest_arrival', 'guest_departure',
    'occupancy_changed', 'urgent_task', 'rule_submitted', 'overdue_tasks_digest'
  ) THEN
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
