import { useState, useEffect, useCallback, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { enqueue } from "@/lib/offlineDB";
import { OfflineSyncContext } from "@/hooks/useOfflineSync";

export interface ChecklistProduct {
  id: string;
  name: string;
  notes: string | null;
  image_url: string | null;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  icon: string;
  color: string;
  property_id: string | null;
  is_universal: boolean;
  is_published: boolean;
  sort_order: number;
  recurrence: string | null;
  recurrence_day: number | null;
  assigned_role: string | null;
  assigned_department: string | null;
  notify_on_day: boolean | null;
  only_when_occupied: boolean;
  cover_image_url: string | null;
  manual_link_url: string | null;
  manual_link_label: string | null;
  products: ChecklistProduct[] | null;
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
  container: string | null;
}

export interface ChecklistSession {
  id?: string;
  item_id: string;
  completed_by: string;
  session_date: string;
  completed_at: string;
}

export interface ChecklistComment {
  id: string;
  template_id: string;
  property_id: string | null;
  session_date: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: { full_name: string | null; avatar_url: string | null } | null;
}

export function useChecklistTemplates(
  category?: string,
  propertyId?: string | null,
  /** Optional allowlist of subcategory values — filtered server-side */
  subcategories?: string[],
) {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { isMasterAdmin, isAdmin, isManager, department, role } = usePermissions();

  const load = useCallback(async () => {
    setLoading(true);
    // Narrow columns — list view doesn't need `products` JSONB blob (loaded in detail).
    let q = supabase
      .from("checklist_templates")
      .select("id, title, category, subcategory, color, icon, cover_image_url, location, recurrence, recurrence_day, notify_on_day, only_when_occupied, is_published, is_universal, property_id, assigned_department, assigned_role, manual_link_label, manual_link_url, sort_order, created_at, updated_at, created_by")
      .order("sort_order")
      .limit(500);
    if (category) q = q.eq("category", category);
    if (!isMasterAdmin) q = q.eq("is_published", true);
    if (propertyId !== undefined) {
      if (propertyId === null) {
        q = q.is("property_id", null);
      } else {
        q = q.eq("property_id", propertyId);
      }
    }
    // Push subcategory filter to the DB — avoids fetching the full table client-side
    if (subcategories && subcategories.length > 0) {
      q = q.in("subcategory", subcategories);
    }
    const { data } = await q;
    const rows = ((data as unknown as ChecklistTemplate[]) ?? []).filter((tpl) => {
      if (!isMasterAdmin && !tpl.is_published) return false;
      if (isMasterAdmin || isAdmin || isManager) return true;
      return (
        (!tpl.assigned_department && !tpl.assigned_role) ||
        (!!tpl.assigned_department && tpl.assigned_department === department) ||
        (!!tpl.assigned_role && tpl.assigned_role === role)
      );
    });
    setTemplates(rows);
    setLoading(false);
  }, [category, propertyId, subcategories?.join(","), isMasterAdmin, isAdmin, isManager, department, role]); // eslint-disable-line react-hooks/exhaustive-deps

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
      .select("id, template_id, title, icon, color, container, photo_url, notes, is_required, sort_order, created_at, updated_at")
      .eq("template_id", templateId)
      .order("sort_order")
      .limit(500);
    setItems((data as ChecklistItem[]) ?? []);
    setLoading(false);
  }, [templateId]);

  useEffect(() => { load(); }, [load]);
  return { items, loading, reload: load, setItems };
}

export function useChecklistSessions(templateId: string | null, propertyId?: string | null) {
  const [sessions, setSessions] = useState<ChecklistSession[]>([]);
  const { userId } = usePermissions();
  // Use sync context if available (may be null before Provider mounts)
  const syncCtx = useContext(OfflineSyncContext);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!templateId) { setSessions([]); return; }
    // Skip network fetch when offline — keep whatever is already in local state
    if (!navigator.onLine) return;
    const { data } = await supabase
      .from("checklist_sessions")
      .select("id, item_id, completed_by, session_date, completed_at")
      .eq("template_id", templateId)
      .eq("session_date", today);
    setSessions((data as ChecklistSession[]) ?? []);
  }, [templateId, today]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription for collaboration
  useEffect(() => {
    if (!templateId) return;
    const channel = supabase
      .channel(`checklist-sessions-${templateId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'checklist_sessions',
        filter: `template_id=eq.${templateId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [templateId, load]);

  const toggle = useCallback(async (itemId: string, isCompleted: boolean) => {
    if (!userId) return;

    const isOffline = !navigator.onLine;

    if (isCompleted) {
      // Optimistic update — remove locally right away
      setSessions(prev => prev.filter(s => !(s.item_id === itemId && s.completed_by === userId)));

      if (isOffline) {
        // Queue the delete for when we're back online
        await enqueue(
          "checklist_sessions",
          "delete",
          {},
          {
            template_id: templateId!,
            item_id: itemId,
            session_date: today,
            completed_by: userId,
          },
        );
        syncCtx?.notifyQueued();
      } else {
        await supabase.from("checklist_sessions").delete()
          .eq("template_id", templateId!)
          .eq("item_id", itemId)
          .eq("session_date", today)
          .eq("completed_by", userId);
      }
    } else {
      // Optimistic insert with a temp id
      const tempId = crypto.randomUUID();
      const optimistic: ChecklistSession = {
        id: tempId,
        item_id: itemId,
        completed_by: userId,
        session_date: today,
        completed_at: new Date().toISOString(),
      };
      setSessions(prev => [...prev, optimistic]);

      if (isOffline) {
        await enqueue("checklist_sessions", "insert", {
          template_id: templateId!,
          item_id: itemId,
          property_id: propertyId ?? null,
          session_date: today,
          completed_by: userId,
        });
        syncCtx?.notifyQueued();
      } else {
        const { data } = await supabase.from("checklist_sessions").insert({
          template_id: templateId!,
          item_id: itemId,
          property_id: propertyId ?? null,
          session_date: today,
          completed_by: userId,
        }).select().single();
        // Replace temp entry with the real DB row
        if (data) {
          setSessions(prev => prev.map(s => s.id === tempId ? (data as ChecklistSession) : s));
        }
      }
    }
  }, [templateId, propertyId, userId, today, syncCtx]);

  const completedIds = new Set(sessions.map(s => s.item_id));
  // Map itemId → session for timestamp display
  const sessionMap = new Map(sessions.map(s => [s.item_id, s]));
  return { completedIds, sessionMap, toggle, reload: load, sessions };
}

export function useChecklistComments(templateId: string | null, propertyId?: string | null) {
  const [comments, setComments] = useState<ChecklistComment[]>([]);
  const [loading, setLoading] = useState(false);
  const { userId } = usePermissions();
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!templateId) { setComments([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("checklist_comments")
      .select("*, profile:profiles(full_name, avatar_url)")
      .eq("template_id", templateId)
      .eq("session_date", today)
      .order("created_at", { ascending: true });
    setComments((data as any[]) ?? []);
    setLoading(false);
  }, [templateId, today]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!templateId) return;
    const channel = supabase
      .channel(`checklist-comments-${templateId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'checklist_comments',
        filter: `template_id=eq.${templateId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [templateId, load]);

  const addComment = useCallback(async (content: string) => {
    if (!userId || !templateId || !content.trim()) return;
    await supabase.from("checklist_comments").insert({
      template_id: templateId,
      property_id: propertyId ?? null,
      session_date: today,
      user_id: userId,
      content: content.trim(),
    });
    load();
  }, [templateId, propertyId, userId, today, load]);

  const deleteComment = useCallback(async (commentId: string) => {
    await supabase.from("checklist_comments").delete().eq("id", commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  return { comments, loading, addComment, deleteComment, reload: load };
}
