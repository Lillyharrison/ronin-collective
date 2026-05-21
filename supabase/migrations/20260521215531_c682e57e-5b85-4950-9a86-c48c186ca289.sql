
CREATE TABLE public.gantt_shared_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text UNIQUE NOT NULL,
  projects jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_id integer NOT NULL DEFAULT 1,
  total_months integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gantt_shared_boards ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_gantt_shared_boards_updated_at
BEFORE UPDATE ON public.gantt_shared_boards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
