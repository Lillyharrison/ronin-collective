import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlannedMaintenanceEntry {
  id: string;
  title: string;
  description: string | null;
  vendor_id: string | null;
  property_id: string | null;
  assigned_to: string | null;
  date_type: "specific" | "month_only";
  scheduled_date: string | null;
  scheduled_month: number | null;
  scheduled_year: number | null;
  reminder_days: number;
  recurrence_months: number | null;
  status: "to_be_booked" | "booked" | "initiated_by_vendor" | "completed" | "cancelled";
  last_service_date: string | null;
  calendar_event_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  vendor_name?: string;
  property_name?: string;
  assignee_name?: string;
  assignee_avatar?: string | null;
}

export function usePlannedMaintenance(scopedPropertyIds?: string[]) {
  const [entries, setEntries] = useState<PlannedMaintenanceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("planned_maintenance")
      .select("*")
      .order("created_at", { ascending: false });

    if (scopedPropertyIds && scopedPropertyIds.length > 0) {
      query = query.in("property_id", scopedPropertyIds);
    }

    const { data, error } = await query;
    if (error || !data) { setLoading(false); return; }

    // Gather IDs for joins
    const vendorIds   = [...new Set(data.map((e: any) => e.vendor_id).filter(Boolean))] as string[];
    const propertyIds = [...new Set(data.map((e: any) => e.property_id).filter(Boolean))] as string[];
    const profileIds  = [...new Set(data.map((e: any) => e.assigned_to).filter(Boolean))] as string[];

    const [vendorsRes, propsRes, profilesRes] = await Promise.all([
      vendorIds.length   ? supabase.from("vendors").select("id, name").in("id", vendorIds)       : Promise.resolve({ data: [] }),
      propertyIds.length ? supabase.from("properties").select("id, name").in("id", propertyIds) : Promise.resolve({ data: [] }),
      profileIds.length  ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", profileIds) : Promise.resolve({ data: [] }),
    ]);

    const vendorMap:  Record<string, string> = {};
    const propMap:    Record<string, string> = {};
    const profileMap: Record<string, { name: string; avatar: string | null }> = {};

    (vendorsRes.data ?? []).forEach((v: any) => { vendorMap[v.id] = v.name; });
    (propsRes.data ?? []).forEach((p: any) => { propMap[p.id] = p.name; });
    (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = { name: p.full_name ?? "Unknown", avatar: p.avatar_url }; });

    const enriched: PlannedMaintenanceEntry[] = (data as any[]).map((e) => ({
      ...e,
      vendor_name:    e.vendor_id    ? vendorMap[e.vendor_id]              : undefined,
      property_name:  e.property_id  ? propMap[e.property_id]              : undefined,
      assignee_name:  e.assigned_to  ? profileMap[e.assigned_to]?.name    : undefined,
      assignee_avatar: e.assigned_to ? profileMap[e.assigned_to]?.avatar  : undefined,
    }));

    setEntries(enriched);
    setLoading(false);
  }, [scopedPropertyIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch(); }, [fetch]);

  const createEntry = async (payload: Omit<PlannedMaintenanceEntry, "id" | "created_at" | "updated_at" | "vendor_name" | "property_name" | "assignee_name" | "assignee_avatar">) => {
    const { data, error } = await supabase
      .from("planned_maintenance")
      .insert(payload)
      .select()
      .single();
    if (error) { toast.error("Failed to create planned maintenance entry"); return null; }
    toast.success("Planned maintenance entry added");
    await fetch();
    return data;
  };

  const updateEntry = async (id: string, patch: Partial<PlannedMaintenanceEntry>) => {
    const { error } = await supabase.from("planned_maintenance").update(patch).eq("id", id);
    if (error) { toast.error("Failed to update entry"); return false; }
    toast.success("Entry updated");
    await fetch();
    return true;
  };

  const deleteEntry = async (id: string) => {
    // Also remove linked calendar event if exists
    const entry = entries.find(e => e.id === id);
    if (entry?.calendar_event_id) {
      await supabase.from("calendar_events").delete().eq("id", entry.calendar_event_id);
    }
    const { error } = await supabase.from("planned_maintenance").delete().eq("id", id);
    if (error) { toast.error("Failed to delete entry"); return false; }
    toast.success("Entry deleted");
    setEntries(prev => prev.filter(e => e.id !== id));
    return true;
  };

  return { entries, loading, refetch: fetch, createEntry, updateEntry, deleteEntry };
}
