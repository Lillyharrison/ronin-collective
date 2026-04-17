import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ThreadWithMeta {
  id: string;
  title: string | null;
  type: string;
  participant_ids: string[];
  last_message_at: string | null;
  created_by: string | null;
  property_id: string | null;
  last_message?: string | null;
  unread_count: number;
  is_pinned: boolean;
  participants: { id: string; full_name: string | null; avatar_url: string | null }[];
}

export function useThreads(userId: string | null) {
  const [threads, setThreads] = useState<ThreadWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    if (!userId) { setLoading(false); return; }

    // 1) Fetch threads — narrow columns + cap. A user is unlikely to actively
    // participate in more than ~100 threads; 200 is a generous safety cap.
    const { data: rawThreads } = await supabase
      .from("chat_threads")
      .select("id, title, type, participant_ids, last_message_at, created_by, property_id, is_pinned")
      .contains("participant_ids", [userId])
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);

    if (!rawThreads?.length) { setThreads([]); setLoading(false); return; }

    const threadIds = rawThreads.map(t => t.id);

    // 2) Batch: all participants profiles in ONE query
    const allParticipantIds = [...new Set(rawThreads.flatMap(t => t.participant_ids ?? []))];

    // 3) Batch: latest message per thread — fetch last 1 per thread by getting all and
    //    using a distinct-on approach via ordering + de-duplication client-side
    //    We fetch the most-recent message for ALL threads in a single query
    const [profilesRes, lastMsgsRes, unreadRes] = await Promise.all([
      allParticipantIds.length
        ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", allParticipantIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] }),

      // Get last message for every thread in one shot (ordered desc, we take first per thread_id)
      supabase
        .from("messages")
        .select("thread_id, content_text, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .limit(threadIds.length * 5), // generous cap to ensure we get at least 1 per thread

      // Get ALL unread messages across all threads in one count query — then group client-side
      supabase
        .from("messages")
        .select("thread_id, id")
        .in("thread_id", threadIds)
        .neq("sender_id", userId)
        .not("seen_by", "cs", `{${userId}}`),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p]));

    // Build last-message map: first occurrence per thread_id (already sorted desc)
    const lastMsgMap = new Map<string, string | null>();
    for (const msg of lastMsgsRes.data ?? []) {
      if (!lastMsgMap.has(msg.thread_id)) {
        lastMsgMap.set(msg.thread_id, msg.content_text);
      }
    }

    // Build unread count map
    const unreadMap = new Map<string, number>();
    for (const msg of unreadRes.data ?? []) {
      unreadMap.set(msg.thread_id, (unreadMap.get(msg.thread_id) ?? 0) + 1);
    }

    const enriched: ThreadWithMeta[] = rawThreads.map(t => ({
      id: t.id,
      title: t.title,
      type: t.type,
      participant_ids: t.participant_ids ?? [],
      last_message_at: t.last_message_at,
      created_by: t.created_by,
      property_id: t.property_id,
      last_message: lastMsgMap.get(t.id) ?? null,
      unread_count: unreadMap.get(t.id) ?? 0,
      is_pinned: (t as any).is_pinned ?? false,
      participants: (t.participant_ids ?? []).map(id => profileMap.get(id) ?? { id, full_name: null, avatar_url: null }),
    }));

    setThreads(enriched);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Realtime — only subscribe to thread-level changes.
  // Message INSERT/DELETE/UPDATE are handled by useMessages (scoped subscription).
  // Refreshing threads on message events here was creating 3 duplicate subscriptions
  // to the messages table simultaneously.
  useEffect(() => {
    if (!userId) return;
    let debounceTimer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchThreads, 300);
    };

    const channel = supabase
      .channel("threads-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, refresh)
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchThreads]);

  const createDM = async (otherUserId: string): Promise<string | null> => {
    if (!userId) return null;
    const { data: existing } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("type", "private")
      .contains("participant_ids", [userId, otherUserId]);

    const found = existing?.[0];
    if (found) return found.id;

    const { data } = await supabase
      .from("chat_threads")
      .insert({ type: "private", participant_ids: [userId, otherUserId], created_by: userId })
      .select("id")
      .single();

    if (data) { await fetchThreads(); return data.id; }
    return null;
  };

  const createGroup = async (name: string, participantIds: string[]): Promise<string | null> => {
    if (!userId) return null;
    const allIds = [...new Set([userId, ...participantIds])];
    const { data } = await supabase
      .from("chat_threads")
      .insert({ type: "group", title: name, participant_ids: allIds, created_by: userId })
      .select("id")
      .single();

    if (data) { await fetchThreads(); return data.id; }
    return null;
  };

  const deleteThread = async (threadId: string): Promise<boolean> => {
    if (!userId) return false;

    // Fetch current participant list
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("participant_ids")
      .eq("id", threadId)
      .single();

    const participants: string[] = (thread?.participant_ids as string[]) ?? [];
    const remaining = participants.filter(id => id !== userId);

    if (remaining.length === 0) {
      // Last participant — fully delete thread and its messages
      await supabase.from("messages").delete().eq("thread_id", threadId);
      const { error } = await supabase.from("chat_threads").delete().eq("id", threadId);
      if (!error) await fetchThreads();
      return !error;
    } else {
      // "Delete for me" — remove self from participant_ids so it disappears from our list
      const { error } = await supabase
        .from("chat_threads")
        .update({ participant_ids: remaining } as never)
        .eq("id", threadId);
      if (!error) await fetchThreads();
      return !error;
    }
  };

  return { threads, loading, createDM, createGroup, refetch: fetchThreads, deleteThread };
}
