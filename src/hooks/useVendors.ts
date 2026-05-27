import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VendorContact {
  id: string;
  vendor_id: string;
  name: string;
  job_title: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  category: string;
  description: string | null;
  notes: string | null;
  logo_url: string | null;
  address: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contacts?: VendorContact[];
}

export const VENDOR_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "art", label: "Art" },
  { value: "catering", label: "Catering & Events" },
  { value: "cleaning", label: "Cleaning" },
  { value: "construction", label: "Construction" },
  { value: "electrical", label: "Electrical" },
  { value: "furniture", label: "Furniture" },
  { value: "landscaping", label: "Landscaping" },
  { value: "legal", label: "Legal & Finance" },
  { value: "maintenance", label: "Maintenance" },
  { value: "medical", label: "Medical" },
  { value: "security", label: "Security" },
  { value: "services", label: "Services" },
  { value: "tech", label: "Tech & AV" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
];

export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      // Narrow columns — vendor cards render name/company/category/contact info.
      const { data: vendorData, error: vendorErr } = await supabase
        .from("vendors")
        .select("id, name, company, email, phone, website, category, description, notes, logo_url, address, is_active, created_by, created_at, updated_at")
        .order("name")
        .limit(500);
      if (vendorErr) throw vendorErr;

      const { data: contactData, error: contactErr } = await supabase
        .from("vendor_contacts")
        .select("id, vendor_id, name, job_title, phone, email, notes, is_primary, created_at")
        .order("is_primary", { ascending: false })
        .limit(2000);
      if (contactErr) throw contactErr;

      const vendorsWithContacts = (vendorData ?? []).map((v) => ({
        ...v,
        contacts: (contactData ?? []).filter((c) => c.vendor_id === v.id),
      }));
      setVendors(vendorsWithContacts);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const createVendor = async (data: Omit<Vendor, "id" | "created_at" | "updated_at" | "contacts">) => {
    const payload = { ...data, created_by: data.created_by ?? currentUserId };
    const { data: v, error } = await supabase.from("vendors").insert(payload).select().single();
    if (error) { toast.error("Failed to create vendor"); return null; }
    toast.success("Vendor added");
    await fetchVendors();
    return v;
  };

  const updateVendor = async (id: string, data: Partial<Vendor>) => {
    const { error } = await supabase.from("vendors").update(data).eq("id", id);
    if (error) { toast.error("Failed to update vendor"); return false; }
    toast.success("Vendor updated");
    await fetchVendors();
    return true;
  };

  const deleteVendor = async (id: string) => {
    const { error } = await supabase.from("vendors").delete().eq("id", id);
    if (error) { toast.error("Failed to delete vendor"); return false; }
    toast.success("Vendor deleted");
    await fetchVendors();
    return true;
  };

  const createContact = async (data: Omit<VendorContact, "id" | "created_at">) => {
    const { error } = await supabase.from("vendor_contacts").insert(data);
    if (error) { toast.error("Failed to add contact"); return false; }
    toast.success("Contact added");
    await fetchVendors();
    return true;
  };

  const updateContact = async (id: string, data: Partial<VendorContact>) => {
    const { error } = await supabase.from("vendor_contacts").update(data).eq("id", id);
    if (error) { toast.error("Failed to update contact"); return false; }
    toast.success("Contact updated");
    await fetchVendors();
    return true;
  };

  const deleteContact = async (id: string) => {
    const { error } = await supabase.from("vendor_contacts").delete().eq("id", id);
    if (error) { toast.error("Failed to delete contact"); return false; }
    toast.success("Contact removed");
    await fetchVendors();
    return true;
  };

  return {
    vendors,
    loading,
    refetch: fetchVendors,
    createVendor,
    updateVendor,
    deleteVendor,
    createContact,
    updateContact,
    deleteContact,
  };
}
