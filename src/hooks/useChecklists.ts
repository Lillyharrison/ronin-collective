import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

export interface ChecklistTemplate {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  icon: string;
  color: string;
  property_id: string | null;
  is_universal: boolean;
  sort_order: number;
}

export interface ChecklistItem {
  id: string;
  template_id: string;
  title: string;
  icon: string;
  color: string;
  photo_url: string | null;
  notes: string | null;
  sort_order: number;
  is_required: boolean;
}

export interface ChecklistSession {
  item_id: string;
  completed_by: string;
  session_date: string;
}

export function useChecklistTemplates(category?: string, propertyId?: string | null) {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("checklist_templates").select("*").order("sort_order");
    if (category) q = q.eq("category", category);
    if (propertyId !== undefined) {
      if (propertyId === null) {
        q = q.is("property_id", null);
      } else {
        q = q.eq("property_id", propertyId);
      }
    }
    const { data } = await q;
    setTemplates((data as ChecklistTemplate[]) ?? []);
    setLoading(false);
  }, [category, propertyId]);

  useEffect(() => { load(); }, [load]);
  return { templates, loading, reload: load };
}

export function useChecklistItems(templateId: string | null) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!templateId) { setItems([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order");
    setItems((data as ChecklistItem[]) ?? []);
    setLoading(false);
  }, [templateId]);

  useEffect(() => { load(); }, [load]);
  return { items, loading, reload: load, setItems };
}

export function useChecklistSessions(templateId: string | null, propertyId?: string | null) {
  const [sessions, setSessions] = useState<ChecklistSession[]>([]);
  const { userId } = usePermissions();

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!templateId) { setSessions([]); return; }
    const { data } = await supabase
      .from("checklist_sessions")
      .select("item_id, completed_by, session_date")
      .eq("template_id", templateId)
      .eq("session_date", today);
    setSessions((data as ChecklistSession[]) ?? []);
  }, [templateId, today]);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (itemId: string, isCompleted: boolean) => {
    if (!userId) return;
    if (isCompleted) {
      await supabase.from("checklist_sessions").delete()
        .eq("template_id", templateId!)
        .eq("item_id", itemId)
        .eq("session_date", today)
        .eq("completed_by", userId);
      setSessions(prev => prev.filter(s => !(s.item_id === itemId && s.completed_by === userId)));
    } else {
      const { data } = await supabase.from("checklist_sessions").insert({
        template_id: templateId!,
        item_id: itemId,
        property_id: propertyId ?? null,
        session_date: today,
        completed_by: userId,
      }).select().single();
      if (data) setSessions(prev => [...prev, data as ChecklistSession]);
    }
  }, [templateId, propertyId, userId, today]);

  const completedIds = new Set(sessions.map(s => s.item_id));
  return { completedIds, toggle, reload: load };
}
