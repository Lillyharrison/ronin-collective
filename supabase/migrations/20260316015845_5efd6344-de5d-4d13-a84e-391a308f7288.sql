
-- 1. Add is_starred column to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_starred
  ON public.messages(thread_id, is_starred)
  WHERE is_starred = true;

-- 2. Create a function for batch seen_by update (eliminates N+1 loop)
CREATE OR REPLACE FUNCTION public.batch_mark_messages_seen(
  _message_ids uuid[],
  _user_id     uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.messages
  SET
    seen_by         = array_append(COALESCE(seen_by, '{}'), _user_id),
    delivery_status = 'read'
  WHERE id = ANY(_message_ids)
    AND NOT (_user_id = ANY(COALESCE(seen_by, '{}')));
$$;

-- 3. Create user_thread_settings table for mute/archive per user
CREATE TABLE IF NOT EXISTS public.user_thread_settings (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID    NOT NULL,
  thread_id   UUID    NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  is_muted    BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, thread_id)
);

ALTER TABLE public.user_thread_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own thread settings"
  ON public.user_thread_settings
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_thread_settings_user
  ON public.user_thread_settings(user_id);

-- 4. Store audio duration in the message for voice notes
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS audio_duration_sec INTEGER NULL;
