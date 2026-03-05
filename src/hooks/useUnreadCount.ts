import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Returns total unread message count across all threads for the current user */
export function useUnreadCount(userId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchCount = async () => {
    if (!userId) { setUnreadCount(0); return; }

    // Get all threads this user is in
    const { data: threads } = await supabase
      .from("chat_threads")
      .select("id")
      .contains("participant_ids", [userId]);

    if (!threads?.length) { setUnreadCount(0); return; }

    const threadIds = threads.map(t => t.id);

    // Count messages not sent by this user and not yet seen by them
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", threadIds)
      .not("sender_id", "eq", userId)
      .not("seen_by", "cs", `{${userId}}`);

    setUnreadCount(count ?? 0);
  };

  useEffect(() => {
    fetchCount();
  }, [userId]);

  // Realtime: refresh on any new message
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("unread-count")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, fetchCount)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return unreadCount;
}
