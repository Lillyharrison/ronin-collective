import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PropertyRule {
  id: string;
  title: string;
  description: string | null;
  property_id: string | null;
  is_universal: boolean;
  applies_to_roles: string[];
  visible_to_user_ids: string[];
  enacted_event_types: string[];
  enacted_keywords: string[];
  enacted_occupant_ids: string[];
  icon: string;
  color: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function usePropertyRules(propertyId?: string | null) {
  const [rules, setRules] = useState<PropertyRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("property_rules").select("*").eq("is_active", true).eq("status", "active").order("created_at");
    if (propertyId !== undefined && propertyId !== null) {
      q = q.or(`property_id.eq.${propertyId},is_universal.eq.true`);
    }
    const { data } = await q;
    setRules((data as PropertyRule[]) ?? []);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);
  return { rules, loading, reload: load, setRules };
}

// Hook for the dashboard Alerts tile and the dedicated AlertsSection.
// Master admin: ALL active rules across every property.
// Staff/non-admin: all active rules for their assigned properties + universal rules.
// (No event-trigger filter — rules are visible as long as they're marked active.)
export function useActiveRulesForDashboard(assignedPropertyIds: string[], isMasterAdmin = false) {
  const [activeRules, setActiveRules] = useState<Array<PropertyRule & { propertyName?: string }>>([]);

  useEffect(() => {
    async function load() {
      // Fetch all property names upfront
      const { data: props } = await supabase.from("properties").select("id, name");
      const propMap: Record<string, string> = {};
      (props ?? []).forEach((p: { id: string; name: string }) => { propMap[p.id] = p.name; });

      let rules: PropertyRule[] = [];

      if (isMasterAdmin) {
        // Master admin sees every active+approved rule
        const { data } = await supabase
          .from("property_rules")
          .select("*")
          .eq("is_active", true)
          .eq("status", "active")
          .order("created_at");
        rules = (data as PropertyRule[]) ?? [];
      } else if (assignedPropertyIds.length > 0) {
        // Staff: active rules for their assigned properties + universal rules
        const { data } = await supabase
          .from("property_rules")
          .select("*")
          .eq("is_active", true)
          .eq("status", "active")
          .or(`is_universal.eq.true,property_id.in.(${assignedPropertyIds.join(",")})`)
          .order("created_at");
        rules = (data as PropertyRule[]) ?? [];
      }

      setActiveRules(rules.map(r => ({
        ...r,
        propertyName: r.property_id ? propMap[r.property_id] : undefined,
      })));
    }

    load();
  }, [assignedPropertyIds, isMasterAdmin]);

  return activeRules;
}
