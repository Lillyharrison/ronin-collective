CREATE OR REPLACE FUNCTION public.validate_staff_schedule_dow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.day_of_week < 0 OR NEW.day_of_week > 6 THEN
    RAISE EXCEPTION 'day_of_week must be 0 (Sun) – 6 (Sat), got %', NEW.day_of_week;
  END IF;
  RETURN NEW;
END;
$function$;