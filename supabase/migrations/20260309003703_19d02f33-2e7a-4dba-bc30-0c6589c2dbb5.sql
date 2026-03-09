
-- ── Staff Schedules: recurring weekly patterns ────────────────────────────────
CREATE TABLE public.staff_schedules (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid        NOT NULL,
  property_id   uuid        REFERENCES public.properties(id) ON DELETE SET NULL,
  day_of_week   smallint    NOT NULL,   -- 0=Sun, 1=Mon, …, 6=Sat
  start_time    time        NOT NULL DEFAULT '09:00:00',
  end_time      time        NOT NULL DEFAULT '17:00:00',
  effective_from date       NOT NULL DEFAULT CURRENT_DATE,
  effective_to  date,                   -- NULL = still active
  is_active     boolean     NOT NULL DEFAULT true,
  notes         text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Validate day_of_week via trigger (not CHECK, per project guidelines)
CREATE OR REPLACE FUNCTION public.validate_staff_schedule_dow()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.day_of_week < 0 OR NEW.day_of_week > 6 THEN
    RAISE EXCEPTION 'day_of_week must be 0 (Sun) – 6 (Sat), got %', NEW.day_of_week;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_staff_schedule_dow
  BEFORE INSERT OR UPDATE ON public.staff_schedules
  FOR EACH ROW EXECUTE FUNCTION public.validate_staff_schedule_dow();

-- ── Staff Shifts: concrete instances / one-off overrides ─────────────────────
CREATE TABLE public.staff_shifts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid        NOT NULL,
  property_id   uuid        REFERENCES public.properties(id) ON DELETE SET NULL,
  schedule_id   uuid        REFERENCES public.staff_schedules(id) ON DELETE SET NULL,
  shift_date    date        NOT NULL,
  start_time    time,
  end_time      time,
  status        text        NOT NULL DEFAULT 'scheduled', -- scheduled | cancelled | leave
  notes         text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Staff Leave Requests ──────────────────────────────────────────────────────
CREATE TABLE public.staff_leave_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid        NOT NULL,
  start_date    date        NOT NULL,
  end_date      date        NOT NULL,
  leave_type    text        NOT NULL DEFAULT 'vacation', -- vacation | sick | personal
  reason        text,
  status        text        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_staff_schedules_staff_id  ON public.staff_schedules(staff_id);
CREATE INDEX idx_staff_schedules_active    ON public.staff_schedules(is_active, effective_from, effective_to);
CREATE INDEX idx_staff_shifts_date         ON public.staff_shifts(shift_date);
CREATE INDEX idx_staff_shifts_staff_id     ON public.staff_shifts(staff_id);
CREATE INDEX idx_staff_leave_staff_id      ON public.staff_leave_requests(staff_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.staff_schedules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shifts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_leave_requests    ENABLE ROW LEVEL SECURITY;

-- staff_schedules
CREATE POLICY "staff_schedules_select" ON public.staff_schedules
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "staff_schedules_manage" ON public.staff_schedules
  FOR ALL USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  );

-- staff_shifts
CREATE POLICY "staff_shifts_select" ON public.staff_shifts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "staff_shifts_manage" ON public.staff_shifts
  FOR ALL USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  );

-- staff_leave_requests – staff see their own; managers see all
CREATE POLICY "leave_select" ON public.staff_leave_requests
  FOR SELECT USING (
    auth.uid() = staff_id OR
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "leave_insert" ON public.staff_leave_requests
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "leave_update" ON public.staff_leave_requests
  FOR UPDATE USING (
    auth.uid() = staff_id OR
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "leave_delete" ON public.staff_leave_requests
  FOR DELETE USING (
    auth.uid() = staff_id OR
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role)
  );
