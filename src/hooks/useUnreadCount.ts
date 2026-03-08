import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Returns total unread message count across all threads for the current user.
 *  Optimised: single query using the unread pattern, debounced realtime updates. */
export function useUnreadCount(userId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchCount = useCallback(async () => {
    if (!userId) { setUnreadCount(0); return; }

    // Get threads + unread messages in 2 parallel queries
    const [threadsRes] = await Promise.all([
      supabase
        .from("chat_threads")
        .select("id")
        .contains("participant_ids", [userId]),
    ]);

    if (!threadsRes.data?.length) { setUnreadCount(0); return; }

    const threadIds = threadsRes.data.map(t => t.id);

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", threadIds)
      .neq("sender_id", userId)
      .not("seen_by", "cs", `{${userId}}`);

    setUnreadCount(count ?? 0);
  }, [userId]);

  useEffect(() => { fetchCount(); }, [fetchCount]);

  useEffect(() => {
    if (!userId) return;

    const debouncedFetch = () => {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(fetchCount, 500);
    };

    const channel = supabase
      .channel("unread-count")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, debouncedFetch)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, debouncedFetch)
      .subscribe();

    return () => {
      clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchCount]);

  return unreadCount;
}
