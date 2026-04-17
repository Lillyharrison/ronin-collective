import { useState, useEffect, useCallback, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { enqueue } from "@/lib/offlineDB";
import { OfflineSyncContext } from "@/hooks/useOfflineSync";

export type IssuePriority = "urgent" | "high" | "medium" | "low";
export type IssueStatus = "reported" | "approved" | "assigned" | "scheduled" | "in_progress" | "resolved";

export interface MaintenanceIssue {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: IssuePriority;
  status: IssueStatus;
  property_id: string | null;
  location_detail: string | null;
  reported_by: string;
  assigned_to: string | null;
  photo_url: string | null;
  close_out_photo_url: string | null;
  scheduled_date: string | null;
  resolved_at: string | null;
  source: string;
  related_issue_id: string | null;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  property_name?: string;
  reporter_name?: string;
  assignee_name?: string;
  assignee_avatar?: string;
  related_issue_title?: string;
}

export interface MaintenanceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  is_custom: boolean;
}

// How many issues to load per page
const PAGE_SIZE = 50;

export interface MaintenanceFilters {
  search?: string;
  category?: string;
  priority?: string;
}

export function useMaintenanceIssues(filterPropertyIds?: string[], filters?: MaintenanceFilters) {
  const [issues, setIssues] = useState<MaintenanceIssue[]>([]);
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const syncCtx = useContext(OfflineSyncContext);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from("maintenance_categories")
      .select("*")
      .order("sort_order");
    if (data) setCategories(data as MaintenanceCategory[]);
  }, []);

  const fetchIssues = useCallback(async (pageIndex = 0) => {
    setLoading(true);

    // Narrow columns — list view never needs description until detail drawer opens
    const ISSUE_COLS = "id, title, category, priority, status, property_id, location_detail, reported_by, assigned_to, photo_url, close_out_photo_url, scheduled_date, resolved_at, source, related_issue_id, is_draft, created_at, updated_at";

    // Build query with server-side property + filter params
    let query = supabase
      .from("maintenance_issues")
      .select(ISSUE_COLS)
      .order("created_at", { ascending: false })
      .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

    if (filterPropertyIds && filterPropertyIds.length > 0) {
      query = query.in("property_id", filterPropertyIds);
    }
    // Server-side text search (title only — DB ilike is fast with index)
    if (filters?.search) {
      query = query.ilike("title", `%${filters.search}%`);
    }
    if (filters?.category) {
      query = query.eq("category", filters.category);
    }
    if (filters?.priority) {
      query = query.eq("priority", filters.priority);
    }

    const { data, error } = await query;

    if (error || !data) { setLoading(false); return; }

    setHasMore(data.length === PAGE_SIZE);

    // Gather related IDs for join
    const propertyIds = [...new Set(data.map(i => i.property_id).filter(Boolean))] as string[];
    const profileIds  = [...new Set([
      ...data.map(i => i.reported_by),
      ...data.map(i => i.assigned_to).filter(Boolean),
    ])] as string[];
    const relatedIds  = [...new Set(data.map(i => i.related_issue_id).filter(Boolean))] as string[];

    const [propsRes, profilesRes, relatedRes] = await Promise.all([
      propertyIds.length ? supabase.from("properties").select("id, name").in("id", propertyIds) : Promise.resolve({ data: [] }),
      profileIds.length  ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", profileIds) : Promise.resolve({ data: [] }),
      relatedIds.length  ? supabase.from("maintenance_issues").select("id, title").in("id", relatedIds) : Promise.resolve({ data: [] }),
    ]);

    const propMap:    Record<string, string> = {};
    const profileMap: Record<string, { name: string; avatar: string | null }> = {};
    const relMap:     Record<string, string> = {};

    (propsRes.data ?? []).forEach((p: { id: string; name: string }) => { propMap[p.id] = p.name; });
    (profilesRes.data ?? []).forEach((p: { id: string; full_name: string | null; avatar_url: string | null }) => {
      profileMap[p.id] = { name: p.full_name ?? "Unknown", avatar: p.avatar_url };
    });
    (relatedRes.data ?? []).forEach((r: { id: string; title: string }) => { relMap[r.id] = r.title; });

    const enriched: MaintenanceIssue[] = (data as unknown as MaintenanceIssue[]).map(issue => ({
      ...issue,
      property_name:        issue.property_id      ? propMap[issue.property_id]        : undefined,
      reporter_name:        profileMap[issue.reported_by]?.name,
      assignee_name:        issue.assigned_to      ? profileMap[issue.assigned_to]?.name   : undefined,
      assignee_avatar:      issue.assigned_to      ? profileMap[issue.assigned_to]?.avatar ?? undefined : undefined,
      related_issue_title:  issue.related_issue_id ? relMap[issue.related_issue_id]    : undefined,
    }));

    setIssues(prev => pageIndex === 0 ? enriched : [...prev, ...enriched]);
    setPage(pageIndex);
    setLoading(false);
  }, [filterPropertyIds?.join(","), filters?.search, filters?.category, filters?.priority]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (!loading && hasMore) fetchIssues(page + 1);
  }, [loading, hasMore, page, fetchIssues]);

  useEffect(() => {
    fetchCategories();
    fetchIssues(0);
  }, [fetchCategories, fetchIssues]);

  const createIssue = async (payload: Omit<MaintenanceIssue, "id" | "created_at" | "updated_at" | "property_name" | "reporter_name" | "assignee_name" | "assignee_avatar" | "related_issue_title">) => {
    if (!navigator.onLine) {
      // Optimistic local insert with a temp id so the UI reflects it immediately
      const tempId = crypto.randomUUID();
      const optimistic: MaintenanceIssue = {
        ...payload,
        id: tempId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setIssues(prev => [optimistic, ...prev]);
      await enqueue("maintenance_issues", "insert", payload as unknown as Record<string, unknown>);
      syncCtx?.notifyQueued();
      return { data: optimistic, error: null };
    }
    const { data, error } = await supabase.from("maintenance_issues").insert(payload).select().single();
    if (!error) await fetchIssues(0);
    return { data, error };
  };

  const updateIssue = async (id: string, patch: Partial<MaintenanceIssue>) => {
    const { error } = await supabase.from("maintenance_issues").update(patch).eq("id", id);
    if (!error) await fetchIssues(0);
    return { error };
  };

  const deleteIssue = async (id: string) => {
    // Find the issue title so we can clean up related records
    const issue = issues.find(i => i.id === id);
    const issueTitle = issue?.title ?? "";

    // Cascade cleanup:
    // 1. calendar_events auto-generated from this issue (matched by title)
    // 2. AI-suggested draft tasks referencing this issue
    await Promise.all([
      supabase.from("calendar_events")
        .delete()
        .eq("calendar_source", "auto")
        .ilike("title", `%${issueTitle}%`),
      issueTitle
        ? supabase.from("tasks")
            .delete()
            .eq("is_draft", true)
            .eq("ai_suggested", true)
            .ilike("title_en", `%${issueTitle}%`)
        : Promise.resolve(),
    ]);

    const { error } = await supabase.from("maintenance_issues").delete().eq("id", id);
    if (!error) setIssues(prev => prev.filter(i => i.id !== id));
    return { error };
  };

  const addCategory = async (name: string, icon: string, color: string) => {
    const { error } = await supabase.from("maintenance_categories").insert({
      name, icon, color, is_custom: true, sort_order: categories.length + 1,
    });
    if (!error) await fetchCategories();
    return { error };
  };

  return { issues, categories, loading, hasMore, loadMore, fetchIssues: () => fetchIssues(0), createIssue, updateIssue, deleteIssue, addCategory };
}
