
-- 1. Add delivery_status and reactions to messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS reactions jsonb DEFAULT '{}';

-- 2. User presence table
CREATE TABLE public.user_presence (
  user_id uuid PRIMARY KEY,
  is_online boolean NOT NULL DEFAULT false,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view presence"
ON public.user_presence FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can upsert own presence"
ON public.user_presence FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
ON public.user_presence FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- 3. Message reactions table
CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants can view reactions"
ON public.message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.chat_threads ct ON ct.id = m.thread_id
    WHERE m.id = message_reactions.message_id
    AND (auth.uid() = ANY(ct.participant_ids) OR has_role(auth.uid(), 'master_admin'))
  )
);

CREATE POLICY "Users can add reactions"
ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reactions"
ON public.message_reactions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 4. Chat media storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view chat media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-media');

CREATE POLICY "Users can delete own chat media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 5. Update messages update policy for thread participants
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Thread participants can update messages"
ON public.messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_threads ct
    WHERE ct.id = messages.thread_id
    AND (auth.uid() = ANY(ct.participant_ids) OR has_role(auth.uid(), 'master_admin'))
  )
);

-- 6. Enable realtime for new tables only
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
