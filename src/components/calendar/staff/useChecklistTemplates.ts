import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChecklistTemplateOption {
  id: string;
  title: string;
  property_id: string | null;
  is_universal: boolean;
}

let cache: ChecklistTemplateOption[] | null = null;
let inflight: Promise<ChecklistTemplateOption[]> | null = null;
const listeners = new Set<(t: ChecklistTemplateOption[]) => void>();

async function load(): Promise<ChecklistTemplateOption[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = Promise.resolve(supabase
      .from("checklist_templates")
      .select("id, title, property_id, is_universal")
      .eq("is_published", true)
      .order("title")
      .limit(500)
      .then(({ data }) => {
        cache = (data as ChecklistTemplateOption[]) ?? [];
        listeners.forEach((l) => l(cache!));
        inflight = null;
        return cache;
      }));
  }
  return inflight;
}

/** Published checklist templates (universal + property-specific), cached per session. */
export function useChecklistTemplates() {
  const [templates, setTemplates] = useState<ChecklistTemplateOption[]>(cache ?? []);

  useEffect(() => {
    let active = true;
    const listener = (t: ChecklistTemplateOption[]) => { if (active) setTemplates(t); };
    listeners.add(listener);
    load().then(listener);
    return () => { active = false; listeners.delete(listener); };
  }, []);

  return templates;
}

/** Templates available for a given property (property-specific + universal). */
export function templatesForProperty(
  templates: ChecklistTemplateOption[],
  propertyId: string | null | undefined,
) {
  if (!propertyId) return [];
  return templates.filter((t) => t.is_universal || t.property_id === propertyId);
}
