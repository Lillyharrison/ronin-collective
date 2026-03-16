import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Message = Tables<"messages"> & {
  sender_profile?: { full_name: string | null; avatar_url: string | null };
};

const PAGE_SIZE = 40;

async function enrichMessages(data: Tables<"messages">[]): Promise<Message[]> {
  const senderIds = [...new Set(data.filter(m => m.sender_id).map(m => m.sender_id!))];
  if (!senderIds.length) return data as Message[];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", senderIds);
  const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);
  return data.map(m => ({
    ...m,
    sender_profile: m.sender_id
      ? profileMap.get(m.sender_id) ?? { full_name: null, avatar_url: null }
      : undefined,
  }));
}

export function useMessages(threadId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // cursor = created_at of the oldest loaded message
  const oldestCursorRef = useRef<string | null>(null);

  // ── Initial load: fetch newest PAGE_SIZE messages ─────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!threadId) { setMessages([]); setHasMore(false); return; }
    setLoading(true);

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (data) {
      const ordered = [...data].reverse(); // oldest → newest
      const enriched = await enrichMessages(ordered);
      setMessages(enriched);
      setHasMore(data.length === PAGE_SIZE);
      oldestCursorRef.current = ordered[0]?.created_at ?? null;
    }
    setLoading(false);
  }, [threadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // ── Load older messages (cursor-based pagination) ─────────────────────────
  const loadOlderMessages = useCallback(async () => {
    if (!threadId || !hasMore || loadingOlder || !oldestCursorRef.current) return;
    setLoadingOlder(true);

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .lt("created_at", oldestCursorRef.current)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (data) {
      const ordered = [...data].reverse();
      const enriched = await enrichMessages(ordered);
      setMessages(prev => [...enriched, ...prev]);
      setHasMore(data.length === PAGE_SIZE);
      if (ordered.length > 0) {
        oldestCursorRef.current = ordered[0].created_at;
      }
    }
    setLoadingOlder(false);
  }, [threadId, hasMore, loadingOlder]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`messages-${threadId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${threadId}`,
      }, async (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.sender_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .eq("id", newMsg.sender_id)
            .single();
          if (profile) newMsg.sender_profile = profile;
        }
        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev;
          const optimisticIdx = prev.findIndex(m =>
            m.id.startsWith("optimistic-") &&
            m.sender_id === newMsg.sender_id &&
            m.content_text === newMsg.content_text &&
            Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 10000
          );
          if (optimisticIdx !== -1) {
            const updated = [...prev];
            updated[optimisticIdx] = { ...updated[optimisticIdx], ...newMsg };
            return updated;
          }
          return [...prev, newMsg];
        });
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  // ── Send text message ─────────────────────────────────────────────────────
  const sendMessage = async (content: string, senderId: string) => {
    if (!threadId) return;
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: optimisticId,
      thread_id: threadId,
      content_text: content,
      sender_id: senderId,
      delivery_status: "sent",
      created_at: new Date().toISOString(),
      is_ai_generated: false,
      is_starred: false,
      reactions: null,
      seen_by: null,
      content_media_url: null,
      media_type: null,
      reply_to_id: null,
      audio_duration_sec: null,
    } as Message]);

    const { data: msg } = await supabase.from("messages").insert({
      thread_id: threadId,
      content_text: content,
      sender_id: senderId,
      delivery_status: "sent",
    }).select("id").single();
    await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);

    if (msg) {
      setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: msg.id } : m));
      triggerPushForThread(threadId, senderId, content);
    }
  };

  // ── Send media message ────────────────────────────────────────────────────
  const sendMediaMessage = async (
    mediaUrl: string,
    mediaType: string,
    senderId: string,
    caption?: string,
    audioDurationSec?: number,
  ): Promise<string | null> => {
    if (!threadId) return null;
    const { data: msg } = await supabase.from("messages").insert({
      thread_id: threadId,
      content_media_url: mediaUrl,
      media_type: mediaType,
      content_text: caption || null,
      sender_id: senderId,
      delivery_status: "sent",
      ...(audioDurationSec != null ? { audio_duration_sec: audioDurationSec } : {}),
    } as never).select("id").single();
    await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
    if (msg) triggerPushForThread(threadId, senderId, caption ?? "📎 Media");
    return msg?.id ?? null;
  };

  /** Fire-and-forget push notification */
  async function triggerPushForThread(tId: string, senderId: string, text: string) {
    try {
      const { data: thread } = await supabase
        .from("chat_threads")
        .select("participant_ids, title")
        .eq("id", tId)
        .single();
      if (!thread?.participant_ids) return;

      const recipientIds = (thread.participant_ids as string[]).filter(id => id !== senderId);
      if (!recipientIds.length) return;

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", senderId)
        .single();

      const senderName = senderProfile?.full_name ?? "Someone";
      const chatTitle = thread.title ?? "New message";

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          recipientUserIds: recipientIds,
          title: `💬 ${senderName}`,
          body: text.length > 80 ? text.slice(0, 80) + "…" : text,
          url: "/messages",
        }),
      }).catch(() => {/* non-critical */});
    } catch {/* non-critical */}
  }

  /**
   * Batch markAsRead — single RPC call instead of N individual updates.
   */
  const markAsRead = async (userId: string) => {
    if (!threadId) return;
    const unread = messages.filter(
      m => m.sender_id !== userId && !(m.seen_by ?? []).includes(userId)
    );
    if (!unread.length) return;
    const unreadIds = unread.map(m => m.id).filter(id => !id.startsWith("optimistic-"));
    if (!unreadIds.length) return;

    // Optimistic local update immediately
    setMessages(prev => prev.map(m =>
      unreadIds.includes(m.id)
        ? { ...m, seen_by: [...(m.seen_by ?? []), userId], delivery_status: "read" }
        : m
    ));

    await supabase.rpc("batch_mark_messages_seen", {
      _message_ids: unreadIds,
      _user_id: userId,
    });
  };

  const toggleReaction = async (messageId: string, userId: string, emoji: string) => {
    // Optimistically update local state immediately
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const current = (m.reactions as Record<string, string[]> | null) ?? {};
      const existing = current[emoji] ?? [];
      const hasReacted = existing.includes(userId);
      const updated = hasReacted
        ? existing.filter(id => id !== userId)
        : [...existing, userId];
      const newReactions = { ...current };
      if (updated.length === 0) {
        delete newReactions[emoji];
      } else {
        newReactions[emoji] = updated;
      }
      return { ...m, reactions: newReactions };
    }));

    // Persist: toggle in message_reactions table
    const { data: existing } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
    }

    // Sync the reactions JSON column on the messages row so other clients see it via realtime
    const { data: allReactions } = await supabase
      .from("message_reactions")
      .select("emoji, user_id")
      .eq("message_id", messageId);

    const reactionsMap: Record<string, string[]> = {};
    for (const r of allReactions ?? []) {
      if (!reactionsMap[r.emoji]) reactionsMap[r.emoji] = [];
      reactionsMap[r.emoji].push(r.user_id);
    }
    await supabase.from("messages").update({ reactions: reactionsMap } as never).eq("id", messageId);
  };

  const toggleStar = async (messageId: string, currentlyStarred: boolean) => {
    const next = !currentlyStarred;
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_starred: next } : m));
    await supabase.from("messages").update({ is_starred: next } as never).eq("id", messageId);
  };

  const deleteMessage = async (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    await supabase.from("messages").delete().eq("id", messageId);
  };

  return {
    messages, loading, loadingOlder, hasMore,
    sendMessage, sendMediaMessage,
    markAsRead, toggleReaction, toggleStar, deleteMessage,
    loadOlderMessages,
    refetch: fetchMessages,
  };
}
