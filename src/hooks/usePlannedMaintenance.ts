import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { enqueue } from "@/lib/offlineDB";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export interface PlannedMaintenanceEntry {
  id: string;
  title: string;
  description: string | null;
  vendor_id: string | null;
  property_id: string | null;
  assigned_to: string | null;
  date_type: "specific" | "month_only";
  scheduled_date: string | null;
  scheduled_end_date: string | null;
  scheduled_time: string | null;
  scheduled_month: number | null;
  scheduled_year: number | null;
  reminder_days: number;
  recurrence_months: number | null;
  status: "future" | "to_be_booked" | "booked" | "initiated_by_vendor" | "completed" | "cancelled";
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
  const { user, loading: authLoading } = useAuth();
  const syncCtx = useOfflineSync();
  const [entries, setEntries] = useState<PlannedMaintenanceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }

    if (scopedPropertyIds && scopedPropertyIds.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Named columns only; include description so edit dialogs never reopen with blank notes and overwrite them.
    const PM_COLS = "id, title, description, vendor_id, property_id, assigned_to, date_type, scheduled_date, scheduled_end_date, scheduled_time, scheduled_month, scheduled_year, reminder_days, recurrence_months, status, last_service_date, calendar_event_id, created_by, created_at, updated_at";
    let query = supabase
      .from("planned_maintenance")
      .select(PM_COLS)
      .order("created_at", { ascending: false })
      .limit(200); // generous cap; planned maintenance grows slowly

    if (scopedPropertyIds && scopedPropertyIds.length > 0) {
      query = query.in("property_id", scopedPropertyIds);
    }

    const { data, error } = await query;
    if (error || !data) {
      setEntries([]);
      setLoading(false);
      return;
    }

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
  }, [authLoading, scopedPropertyIds?.join(","), user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Auto-roll dates only when status is CHANGING to completed (not already completed)
    if (patch.status === "completed") {
      const entry = entries.find(e => e.id === id);
      if (entry && entry.status !== "completed" && entry.recurrence_months && entry.recurrence_months > 0) {
        // Set last_service_date to the current target date
        let currentTarget: string | null = null;
        if (entry.date_type === "specific" && entry.scheduled_date) {
          currentTarget = entry.scheduled_date;
        } else if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year) {
          // Use UTC-safe string formatting to avoid timezone day-shift
          const mm = String(entry.scheduled_month).padStart(2, "0");
          currentTarget = `${entry.scheduled_year}-${mm}-01`;
        }

        if (currentTarget) {
          patch.last_service_date = currentTarget;

          // Parse date parts directly to avoid timezone issues
          const [yStr, mStr, dStr] = currentTarget.split("-");
          let y = Number(yStr), m = Number(mStr) - 1, d = Number(dStr);

          // Add recurrence months
          m += entry.recurrence_months;
          while (m > 11) { y++; m -= 12; }

          if (entry.date_type === "specific") {
            // Clamp day to valid range for the target month
            const maxDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
            const clampedDay = Math.min(d, maxDay);
            patch.scheduled_date = `${y}-${String(m + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
          } else {
            patch.scheduled_month = m + 1;
            patch.scheduled_year = y;
          }
        }
      }
    }

    const allowedPatch: Partial<PlannedMaintenanceEntry> = {
      title: patch.title,
      description: patch.description,
      vendor_id: patch.vendor_id,
      property_id: patch.property_id,
      assigned_to: patch.assigned_to,
      date_type: patch.date_type,
      scheduled_date: patch.scheduled_date,
      scheduled_end_date: patch.scheduled_end_date,
      scheduled_time: patch.scheduled_time,
      scheduled_month: patch.scheduled_month,
      scheduled_year: patch.scheduled_year,
      reminder_days: patch.reminder_days,
      recurrence_months: patch.recurrence_months,
      status: patch.status,
      last_service_date: patch.last_service_date,
      calendar_event_id: patch.calendar_event_id,
      created_by: patch.created_by,
    };
    Object.keys(allowedPatch).forEach((key) => {
      if (allowedPatch[key as keyof PlannedMaintenanceEntry] === undefined) delete allowedPatch[key as keyof PlannedMaintenanceEntry];
    });

    if (!navigator.onLine) {
      setEntries(prev => prev.map(entry => entry.id === id ? { ...entry, ...allowedPatch, updated_at: new Date().toISOString() } : entry));
      await enqueue("planned_maintenance", "update", allowedPatch as unknown as Record<string, unknown>, { id });
      syncCtx.notifyQueued();
      toast.success("Entry changes queued to sync");
      return true;
    }

    const { error } = await supabase.from("planned_maintenance").update(allowedPatch).eq("id", id);
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
