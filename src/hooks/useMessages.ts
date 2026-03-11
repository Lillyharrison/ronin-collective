import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Message = Tables<"messages"> & { sender_profile?: { full_name: string | null; avatar_url: string | null } };

export function useMessages(threadId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!threadId) { setMessages([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200);
    
    if (data) {
      const senderIds = [...new Set(data.filter(m => m.sender_id).map(m => m.sender_id!))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", senderIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);
      const enriched = data.map(m => ({
        ...m,
        sender_profile: m.sender_id ? profileMap.get(m.sender_id) ?? { full_name: null, avatar_url: null } : undefined,
      }));
      setMessages(enriched);
    }
    setLoading(false);
  }, [threadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Realtime subscription
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
          // Exact duplicate guard
          if (prev.find(m => m.id === newMsg.id)) return prev;
          // Replace optimistic placeholder if it matches (same sender + same text within a few seconds)
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

  const sendMessage = async (content: string, senderId: string) => {
    if (!threadId) return;
    // Optimistically add to local state immediately — realtime deduplication handles the real insert
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: optimisticId,
      thread_id: threadId,
      content_text: content,
      sender_id: senderId,
      delivery_status: "sent",
      created_at: new Date().toISOString(),
      is_ai_generated: false,
      reactions: null,
      seen_by: null,
      content_media_url: null,
      media_type: null,
      reply_to_id: null,
    } as Message]);

    const { data: msg } = await supabase.from("messages").insert({
      thread_id: threadId,
      content_text: content,
      sender_id: senderId,
      delivery_status: "sent",
    }).select("id").single();
    await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);

    // Replace optimistic entry with real DB id once we get it back
    if (msg) {
      setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: msg.id } : m));
      triggerPushForThread(threadId, senderId, content);
    }
  };

  const sendMediaMessage = async (mediaUrl: string, mediaType: string, senderId: string, caption?: string): Promise<string | null> => {
    if (!threadId) return null;
    const { data: msg } = await supabase.from("messages").insert({
      thread_id: threadId,
      content_media_url: mediaUrl,
      media_type: mediaType,
      content_text: caption || null,
      sender_id: senderId,
      delivery_status: "sent",
    }).select("id").single();
    await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
    if (msg) triggerPushForThread(threadId, senderId, caption ?? "📎 Media");
    return msg?.id ?? null;
  };

  /** Fire-and-forget: fetch thread participants and call the push edge function */
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

  const markAsRead = async (userId: string) => {
    if (!threadId) return;
    const unread = messages.filter(m => m.sender_id !== userId && !(m.seen_by ?? []).includes(userId));
    if (!unread.length) return;
    const unreadIds = unread.map(m => m.id);
    // Single batch update instead of one per message
    await supabase
      .from("messages")
      .update({ delivery_status: "read" })
      .in("id", unreadIds);
    // Update seen_by for each optimistically in state
    setMessages(prev => prev.map(m =>
      unreadIds.includes(m.id)
        ? { ...m, seen_by: [...(m.seen_by ?? []), userId], delivery_status: "read" }
        : m
    ));
    // Best-effort DB seen_by update (array_append isn't available via JS client, so update each)
    // But we batch them in parallel rather than serially
    await Promise.all(unread.map(msg =>
      supabase.from("messages").update({
        seen_by: [...(msg.seen_by ?? []), userId],
      }).eq("id", msg.id)
    ));
  };

  const toggleReaction = async (messageId: string, userId: string, emoji: string) => {
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
  };

  const deleteMessage = async (messageId: string) => {
    // Optimistically remove from UI immediately
    setMessages(prev => prev.filter(m => m.id !== messageId));
    await supabase.from("messages").delete().eq("id", messageId);
  };

  return { messages, loading, sendMessage, sendMediaMessage, markAsRead, toggleReaction, deleteMessage, refetch: fetchMessages };
}
