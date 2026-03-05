
-- ============================================================
-- 1. NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'info',         -- info | success | warning | alert | task | message | ai
  entity_type TEXT,                           -- task | message | calendar_event | memory | system
  entity_id UUID,                             -- FK to the related entity
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  action_url TEXT,                            -- optional deep-link section name
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(user_id, is_read);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their own notifications read"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Service role / edge functions can insert notifications for any user
CREATE POLICY "Admins can insert notifications for anyone"
  ON public.notifications FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'master_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
  );

-- ============================================================
-- 2. MANUALS STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'manuals',
  'manuals',
  true,
  52428800,  -- 50 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read manuals
CREATE POLICY "Authenticated users can view manuals files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'manuals' AND auth.role() = 'authenticated');

-- Admin and above can upload manuals
CREATE POLICY "Admins can upload manuals files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'manuals'
    AND (
      has_role(auth.uid(), 'master_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Admin and above can update manuals
CREATE POLICY "Admins can update manuals files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'manuals'
    AND (
      has_role(auth.uid(), 'master_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Admin and above can delete manuals
CREATE POLICY "Admins can delete manuals files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'manuals'
    AND (
      has_role(auth.uid(), 'master_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );
