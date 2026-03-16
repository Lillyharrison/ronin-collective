
-- ============================================================
-- PERFORMANCE INDEXES — Long-term scalability migration
-- ============================================================

-- 1. MESSAGES: Fast lookup by thread + time (the most queried pattern)
CREATE INDEX IF NOT EXISTS idx_messages_thread_created
  ON public.messages(thread_id, created_at ASC);

-- 2. MESSAGES: Fast unread count queries (filter by sender + seen_by)
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages(sender_id);

-- 3. CHAT THREADS: GIN index on participant_ids array for O(1) participant lookup
CREATE INDEX IF NOT EXISTS idx_chat_threads_participants
  ON public.chat_threads USING GIN(participant_ids);

-- 4. CHAT THREADS: Sort by last_message_at (default thread list order)
CREATE INDEX IF NOT EXISTS idx_chat_threads_last_message
  ON public.chat_threads(last_message_at DESC NULLS LAST);

-- 5. CHECKLIST SESSIONS: Fast per-template + date queries (daily checklist loading)
CREATE INDEX IF NOT EXISTS idx_checklist_sessions_template_date
  ON public.checklist_sessions(template_id, session_date DESC);

-- 6. CHECKLIST SESSIONS: Fast per-property queries
CREATE INDEX IF NOT EXISTS idx_checklist_sessions_property
  ON public.checklist_sessions(property_id, session_date DESC);

-- 7. MAINTENANCE ISSUES: Fast open issues by property + status
CREATE INDEX IF NOT EXISTS idx_maintenance_issues_property_status
  ON public.maintenance_issues(property_id, status);

-- 8. MAINTENANCE ISSUES: Fast sort by created_at for lists
CREATE INDEX IF NOT EXISTS idx_maintenance_issues_created
  ON public.maintenance_issues(created_at DESC);

-- 9. TASKS: Fast status + property queries (dashboard & task list)
CREATE INDEX IF NOT EXISTS idx_tasks_status_property
  ON public.tasks(status, property_id);

-- 10. TASKS: Fast due_date lookups (overdue detection)
CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON public.tasks(due_date ASC NULLS LAST)
  WHERE due_date IS NOT NULL;

-- 11. TASKS: Fast assigned_to lookups (my tasks view)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to
  ON public.tasks(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 12. NOTIFICATIONS: Fast per-user unread queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications(user_id, is_read, created_at DESC);

-- 13. SYSTEM EVENTS: Fast event_type lookups (AI listener queries)
CREATE INDEX IF NOT EXISTS idx_system_events_type_created
  ON public.system_events(event_type, created_at DESC);

-- 14. CALENDAR EVENTS: Fast property + date range queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_property_start
  ON public.calendar_events(property_id, start_date ASC);

-- 15. CHECKLIST ITEMS: Fast per-template item loading
CREATE INDEX IF NOT EXISTS idx_checklist_items_template
  ON public.checklist_items(template_id, sort_order ASC);

-- 16. MESSAGE REACTIONS: Fast per-message reaction lookups
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON public.message_reactions(message_id);

-- 17. STAFF SHIFTS: Fast per-staff + date queries
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_date
  ON public.staff_shifts(staff_id, shift_date DESC);

-- 18. RONIN MEMORIES: Fast property + importance queries (AI context retrieval)
CREATE INDEX IF NOT EXISTS idx_ronin_memories_property_importance
  ON public.ronin_memories(property_id, importance DESC);

-- 19. AUTO-PRUNE old read notifications (keep last 90 days per user)
-- This prevents the notifications table from growing unbounded
CREATE OR REPLACE FUNCTION public.prune_old_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.notifications
  WHERE is_read = true
    AND created_at < now() - INTERVAL '90 days';
$$;
