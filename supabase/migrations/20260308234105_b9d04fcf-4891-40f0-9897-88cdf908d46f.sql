
-- Create vendors table
CREATE TABLE public.vendors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  website text,
  category text NOT NULL DEFAULT 'general',
  description text,
  notes text,
  logo_url text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create vendor_contacts table (sub-contacts / employees)
CREATE TABLE public.vendor_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  job_title text,
  phone text,
  email text,
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;

-- vendors RLS policies
CREATE POLICY "Authenticated users can view vendors"
  ON public.vendors FOR SELECT
  USING (true);

CREATE POLICY "Managers and above can manage vendors"
  ON public.vendors FOR ALL
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  );

-- vendor_contacts RLS policies
CREATE POLICY "Authenticated users can view vendor contacts"
  ON public.vendor_contacts FOR SELECT
  USING (true);

CREATE POLICY "Managers and above can manage vendor contacts"
  ON public.vendor_contacts FOR ALL
  USING (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'master_admin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role)
  );

-- Timestamps triggers
CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_contacts_updated_at
  BEFORE UPDATE ON public.vendor_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for faster lookups
CREATE INDEX idx_vendor_contacts_vendor_id ON public.vendor_contacts(vendor_id);
CREATE INDEX idx_vendors_category ON public.vendors(category);
CREATE INDEX idx_vendors_name ON public.vendors(name);
