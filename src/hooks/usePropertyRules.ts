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
    let q = supabase.from("property_rules").select("*").eq("is_active", true).order("created_at");
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

// Hook for checking if any rules are triggered by today's calendar events
export function useActiveRulesForDashboard(assignedPropertyIds: string[]) {
  const [activeRules, setActiveRules] = useState<Array<PropertyRule & { propertyName?: string }>>([]);

  useEffect(() => {
    if (!assignedPropertyIds.length) return;
    const today = new Date().toISOString().slice(0, 10);

    async function load() {
      // Get today's calendar events for assigned properties
      const { data: events } = await supabase
        .from("calendar_events")
        .select("event_type, title, property_id")
        .in("property_id", assignedPropertyIds)
        .lte("start_date", new Date().toISOString())
        .gte("end_date", new Date().toISOString());

      if (!events?.length) return;

      const eventTypes = events.map(e => e.event_type);
      const eventTitles = events.map(e => (e.title ?? "").toLowerCase());

      // Get all rules for these properties
      const { data: rules } = await supabase
        .from("property_rules")
        .select("*")
        .eq("is_active", true)
        .or(`is_universal.eq.true,property_id.in.(${assignedPropertyIds.join(",")})`);

      if (!rules) return;

      // Get property names
      const { data: props } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", assignedPropertyIds);
      const propMap: Record<string, string> = {};
      (props ?? []).forEach((p: { id: string; name: string }) => { propMap[p.id] = p.name; });

      // Filter rules triggered by today's events
      const triggered = (rules as PropertyRule[]).filter(rule => {
        const eventTypeMatch = rule.enacted_event_types.length === 0 ||
          rule.enacted_event_types.some(t => eventTypes.includes(t));
        const keywordMatch = rule.enacted_keywords.length === 0 ||
          rule.enacted_keywords.some(k =>
            eventTitles.some(t => t.includes(k.toLowerCase()))
          );
        return eventTypeMatch && keywordMatch;
      });

      setActiveRules(triggered.map(r => ({
        ...r,
        propertyName: r.property_id ? propMap[r.property_id] : undefined,
      })));
    }

    load();
  }, [assignedPropertyIds]);

  return activeRules;
}
