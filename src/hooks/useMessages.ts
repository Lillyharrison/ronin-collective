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
          if (prev.find(m => m.id === newMsg.id)) return prev;
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
    await supabase.from("messages").insert({
      thread_id: threadId,
      content_text: content,
      sender_id: senderId,
      delivery_status: "sent",
    });
    await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
  };

  const sendMediaMessage = async (mediaUrl: string, mediaType: string, senderId: string, caption?: string) => {
    if (!threadId) return;
    await supabase.from("messages").insert({
      thread_id: threadId,
      content_media_url: mediaUrl,
      media_type: mediaType,
      content_text: caption || null,
      sender_id: senderId,
      delivery_status: "sent",
    });
    await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
  };

  const markAsRead = async (userId: string) => {
    if (!threadId) return;
    const unread = messages.filter(m => m.sender_id !== userId && !(m.seen_by ?? []).includes(userId));
    for (const msg of unread) {
      const newSeenBy = [...(msg.seen_by ?? []), userId];
      await supabase.from("messages").update({
        seen_by: newSeenBy,
        delivery_status: "read",
      }).eq("id", msg.id);
    }
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
