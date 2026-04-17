-- Speeds up date-windowed reads on system_events as it grows.
CREATE INDEX IF NOT EXISTS idx_system_events_created_at
  ON public.system_events (created_at DESC);

-- Prune helper: deletes processed events older than 90 days.
-- Mirrors the pattern of prune_old_notifications().
CREATE OR REPLACE FUNCTION public.prune_old_system_events()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.system_events
  WHERE processed_by_ai = true
    AND created_at < now() - INTERVAL '90 days';
$function$;