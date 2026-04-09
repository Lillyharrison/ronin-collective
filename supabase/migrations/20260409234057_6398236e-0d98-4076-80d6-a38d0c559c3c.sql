ALTER TABLE public.planned_maintenance
ADD COLUMN scheduled_time time without time zone DEFAULT NULL;