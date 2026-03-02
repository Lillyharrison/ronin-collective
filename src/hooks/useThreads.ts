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
  participants: { id: string; full_name: string | null; avatar_url: string | null }[];
}

export function useThreads(userId: string | null) {
  const [threads, setThreads] = useState<ThreadWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    
    const { data: rawThreads } = await supabase
      .from("chat_threads")
      .select("*")
      .contains("participant_ids", [userId])
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (!rawThreads) { setLoading(false); return; }

    // Get all participant profiles
    const allParticipantIds = [...new Set(rawThreads.flatMap(t => t.participant_ids ?? []))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", allParticipantIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

    // Get last message and unread count per thread
    const enriched: ThreadWithMeta[] = await Promise.all(
      rawThreads.map(async (t) => {
        const { data: lastMsgs } = await supabase
          .from("messages")
          .select("content_text, seen_by")
          .eq("thread_id", t.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const lastMsg = lastMsgs?.[0];

        // Count unread
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("thread_id", t.id)
          .not("sender_id", "eq", userId)
          .not("seen_by", "cs", `{${userId}}`);

        return {
          id: t.id,
          title: t.title,
          type: t.type,
          participant_ids: t.participant_ids ?? [],
          last_message_at: t.last_message_at,
          created_by: t.created_by,
          property_id: t.property_id,
          last_message: lastMsg?.content_text ?? null,
          unread_count: count ?? 0,
          participants: (t.participant_ids ?? []).map(id => profileMap.get(id) ?? { id, full_name: null, avatar_url: null }),
        };
      })
    );

    setThreads(enriched);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Realtime for thread updates
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("threads-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, () => {
        fetchThreads();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        fetchThreads();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, () => {
        fetchThreads();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchThreads]);

  // Create a new DM thread
  const createDM = async (otherUserId: string): Promise<string | null> => {
    if (!userId) return null;
    // Check if a DM already exists between these two
    const { data: existing } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("type", "private")
      .contains("participant_ids", [userId, otherUserId]);

    const found = existing?.find(t => true); // first match
    if (found) return found.id;

    const { data, error } = await supabase
      .from("chat_threads")
      .insert({
        type: "private",
        participant_ids: [userId, otherUserId],
        created_by: userId,
      })
      .select("id")
      .single();

    if (data) {
      await fetchThreads();
      return data.id;
    }
    return null;
  };

  // Create a group thread
  const createGroup = async (name: string, participantIds: string[]): Promise<string | null> => {
    if (!userId) return null;
    const allIds = [...new Set([userId, ...participantIds])];
    const { data } = await supabase
      .from("chat_threads")
      .insert({
        type: "group",
        title: name,
        participant_ids: allIds,
        created_by: userId,
      })
      .select("id")
      .single();

    if (data) {
      await fetchThreads();
      return data.id;
    }
    return null;
  };

  return { threads, loading, createDM, createGroup, refetch: fetchThreads };
}
