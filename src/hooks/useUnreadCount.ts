import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns total unread message count for the current user.
 *
 * Design: does ONE fetch on mount to seed the badge (e.g. before the
 * MessagesSection has loaded its threads).  The real-time updates are owned
 * exclusively by useThreads (chat_threads subscription) + useMessages
 * (per-thread subscription).  We deliberately avoid adding a third concurrent
 * subscription to the messages table here.
 *
 * Once MessagesSection mounts, it syncs the live count from useThreads into
 * NavigationContext.totalUnread, which BottomNav reads directly.  This hook
 * therefore only runs for the initial "cold" badge before messages loads.
 */
export function useUnreadCount(userId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);
  const hasFetched = useRef(false);

  const fetchCount = useCallback(async () => {
    if (!userId) { setUnreadCount(0); return; }

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

  // Fetch once on mount; MessagesSection's useEffect keeps it live after that
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchCount();
  }, [fetchCount]);

  return unreadCount;
}
