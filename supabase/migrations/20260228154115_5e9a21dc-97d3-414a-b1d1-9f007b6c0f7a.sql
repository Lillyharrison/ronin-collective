
-- Add extended profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS notes text;

-- Add a level/user-type column for permission tier
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS level text DEFAULT 'staff';

-- Create enum-like check for department
-- Departments: exterior, interior, kitchen, security, office (staff only)
-- Level: principal (main family), extended_family, manager, staff

-- Job title autocomplete: we'll store known titles as a table for reuse
CREATE TABLE IF NOT EXISTS public.job_title_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.job_title_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job titles"
  ON public.job_title_suggestions FOR SELECT
  USING (true);

CREATE POLICY "Admin can manage job titles"
  ON public.job_title_suggestions FOR ALL
  USING (has_role(auth.uid(), 'master_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Seed some initial job titles
INSERT INTO public.job_title_suggestions (title) VALUES
  ('Estate Manager'),
  ('House Manager'),
  ('Property Manager'),
  ('Executive Housekeeper'),
  ('Housekeeper'),
  ('Chef'),
  ('Sous Chef'),
  ('Personal Assistant'),
  ('Security Manager'),
  ('Security Officer'),
  ('Groundskeeper'),
  ('Driver'),
  ('Nanny'),
  ('Butler'),
  ('Office Administrator')
ON CONFLICT (title) DO NOTHING;
