-- Reset all user_stats to zero so no fake demo data persists
UPDATE public.user_stats SET
  points_total       = 0,
  current_streak     = 0,
  longest_streak     = 0,
  tasks_completed    = 0,
  badges_earned      = '{}',
  last_activity_date = NULL;