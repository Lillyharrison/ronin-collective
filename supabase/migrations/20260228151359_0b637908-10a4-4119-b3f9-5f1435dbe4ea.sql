
-- ============================================================
-- USER STATS & ACHIEVEMENTS TABLE
-- ============================================================

CREATE TABLE public.user_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  points_total INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  badges_earned TEXT[] DEFAULT '{}',
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stats"
  ON public.user_stats FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Master admin can view all stats"
  ON public.user_stats FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own stats"
  ON public.user_stats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stats"
  ON public.user_stats FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admin can update any stats"
  ON public.user_stats FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_user_stats_updated_at
  BEFORE UPDATE ON public.user_stats FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_profile_created_init_stats
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_stats();

-- ============================================================
-- ACHIEVEMENTS TABLE
-- ============================================================

CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_es TEXT,
  description_en TEXT,
  description_es TEXT,
  icon TEXT NOT NULL DEFAULT '🏅',
  points INTEGER NOT NULL DEFAULT 10,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view achievements"
  ON public.achievements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage achievements"
  ON public.achievements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin') OR public.has_role(auth.uid(), 'admin'));

INSERT INTO public.achievements (key, title_en, title_es, description_en, description_es, icon, points, category) VALUES
  ('first_task',      'First Task Done',    'Primera Tarea',      'Completed your very first task.',            'Completaste tu primera tarea.',         '🎯', 10,  'task'),
  ('streak_3',        '3-Day Streak',       'Racha de 3 Días',    'Completed tasks 3 days in a row.',           'Tareas completadas 3 días seguidos.',   '🔥', 25,  'streak'),
  ('streak_7',        'Week Warrior',       'Guerrero Semanal',   'Completed tasks 7 days in a row.',           'Tareas 7 días seguidos.',               '⚡', 75,  'streak'),
  ('streak_30',       'Unstoppable',        'Imparable',          '30-day task streak. Legendary.',             'Racha de 30 días. Legendario.',         '💎', 300, 'streak'),
  ('tasks_10',        '10 Tasks Complete',  '10 Tareas',          'Completed 10 tasks total.',                  'Completaste 10 tareas en total.',       '✅', 50,  'task'),
  ('tasks_50',        'Half Century',       'Cincuentenario',     'Completed 50 tasks total.',                  '50 tareas completadas.',                '🥈', 150, 'task'),
  ('tasks_100',       'Century Club',       'Club del Siglo',     'Completed 100 tasks. Elite.',                '100 tareas. Elite.',                    '🥇', 500, 'task'),
  ('issue_reporter',  'Issue Spotter',      'Detector de Fallos', 'Reported your first maintenance issue.',     'Reportaste tu primer problema.',        '🔧', 15,  'task'),
  ('anniversary_1',   '1-Year Anniversary', 'Primer Aniversario', 'One year with Ronin Collective.',            'Un año con Ronin Collective.',          '🎂', 200, 'milestone'),
  ('birthday',        'Happy Birthday!',    'Feliz Cumpleanos!',  'Your special day with Ronin Collective.',    'Tu dia especial con Ronin Collective.', '🎉', 50,  'special'),
  ('all_tasks_day',   'Perfect Day',        'Dia Perfecto',       'Completed every task assigned for today.',   'Completaste todas las tareas del dia.', '⭐', 100, 'task'),
  ('photo_pro',       'Photo Pro',          'Pro en Fotos',       'Submitted 10 tasks with photo evidence.',    'Enviaste 10 tareas con foto.',          '📸', 40,  'task');
