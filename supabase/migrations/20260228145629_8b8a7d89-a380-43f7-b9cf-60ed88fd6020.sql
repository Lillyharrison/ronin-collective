
-- ============================================================
-- STEP 1: ENUMS + user_roles table + has_role function FIRST
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('master_admin', 'admin', 'manager', 'staff', 'principal');
CREATE TYPE public.property_status AS ENUM ('occupied', 'vacant', 'maintenance');
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed', 'urgent');
CREATE TYPE public.asset_category AS ENUM ('vehicle', 'appliance', 'art', 'tech', 'furniture', 'other');
CREATE TYPE public.thread_type AS ENUM ('private', 'group', 'system_ai', 'property');
CREATE TYPE public.language_pref AS ENUM ('en', 'es');

-- user_roles table (must exist before has_role function)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function (must exist before any RLS policy references it)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies on user_roles (now safe to reference has_role)
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Master admin can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'));

-- ============================================================
-- STEP 2: PROPERTIES
-- ============================================================
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  image_url TEXT,
  status public.property_status NOT NULL DEFAULT 'vacant',
  country TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view properties"
  ON public.properties FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and above can insert properties"
  ON public.properties FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'master_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin and above can update properties"
  ON public.properties FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Master admin can delete properties"
  ON public.properties FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'));

-- ============================================================
-- STEP 3: PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  language_pref public.language_pref NOT NULL DEFAULT 'en',
  phone TEXT,
  job_title TEXT,
  assigned_property_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============================================================
-- STEP 4: ASSETS
-- ============================================================
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category public.asset_category NOT NULL DEFAULT 'other',
  current_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  qr_code_id TEXT,
  photo_url TEXT,
  make TEXT,
  model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  purchase_value NUMERIC(12, 2),
  last_serviced_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view assets"
  ON public.assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manager and above can manage assets"
  ON public.assets FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager')
  );

-- ============================================================
-- STEP 5: TASKS
-- ============================================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en TEXT NOT NULL,
  title_es TEXT,
  description_en TEXT,
  description_es TEXT,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.task_status NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 2,
  photo_url TEXT,
  voice_note_url TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tasks"
  ON public.tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Assigned user or manager can update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    auth.uid() = assigned_to OR
    public.has_role(auth.uid(), 'master_admin') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Manager and above can delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager')
  );

-- ============================================================
-- STEP 6: MANUALS & SOPs
-- ============================================================
CREATE TABLE public.manuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en TEXT NOT NULL,
  title_es TEXT,
  content_en TEXT,
  content_es TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_universal BOOLEAN NOT NULL DEFAULT false,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  file_url TEXT,
  cover_image_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view manuals"
  ON public.manuals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and above can manage manuals"
  ON public.manuals FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- STEP 7: CHAT THREADS
-- ============================================================
CREATE TABLE public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  type public.thread_type NOT NULL DEFAULT 'group',
  participant_ids UUID[] DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants and admins can view threads"
  ON public.chat_threads FOR SELECT TO authenticated
  USING (
    auth.uid() = ANY(participant_ids) OR
    public.has_role(auth.uid(), 'master_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Authenticated users can create threads"
  ON public.chat_threads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Participants and admins can update threads"
  ON public.chat_threads FOR UPDATE TO authenticated
  USING (auth.uid() = ANY(participant_ids) OR public.has_role(auth.uid(), 'master_admin'));

-- ============================================================
-- STEP 8: MESSAGES
-- ============================================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content_text TEXT,
  content_media_url TEXT,
  media_type TEXT,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  seen_by UUID[] DEFAULT '{}',
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants can view messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads ct
      WHERE ct.id = thread_id
      AND (auth.uid() = ANY(ct.participant_ids) OR public.has_role(auth.uid(), 'master_admin'))
    )
  );

CREATE POLICY "Thread participants can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.chat_threads ct
      WHERE ct.id = thread_id AND auth.uid() = ANY(ct.participant_ids)
    )
  );

CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id OR public.has_role(auth.uid(), 'master_admin'));

-- ============================================================
-- STEP 9: SYSTEM EVENTS
-- ============================================================
CREATE TABLE public.system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id UUID,
  payload JSONB DEFAULT '{}',
  processed_by_ai BOOLEAN NOT NULL DEFAULT false,
  ai_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and above can view system events"
  ON public.system_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Authenticated users can insert system events"
  ON public.system_events FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- STEP 10: TRIGGERS for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_manuals_updated_at
  BEFORE UPDATE ON public.manuals FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_threads_updated_at
  BEFORE UPDATE ON public.chat_threads FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STEP 11: AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STEP 12: REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;

-- ============================================================
-- STEP 13: SEED — 4 SAMPLE PROPERTIES
-- ============================================================
INSERT INTO public.properties (name, address, timezone, status, country, city) VALUES
  ('Malibu Hideaway',    '24000 Pacific Coast Hwy, Malibu, CA 90265',         'America/Los_Angeles', 'occupied',    'USA',    'Malibu'),
  ('Montana Ranch',      '1 Ranch Road, Big Sky, MT 59716',                   'America/Denver',      'vacant',      'USA',    'Big Sky'),
  ('New York Penthouse', '432 Park Ave, New York, NY 10022',                  'America/New_York',    'maintenance', 'USA',    'New York'),
  ('Riviera Villa',      '12 Chemin des Oliviers, Saint-Tropez, 83990',       'Europe/Paris',        'vacant',      'France', 'Saint-Tropez');
