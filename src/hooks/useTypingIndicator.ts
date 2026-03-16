import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const TYPING_TIMEOUT_MS = 3000;

interface TypingUser {
  userId: string;
  name: string;
}

export function useTypingIndicator(
  threadId: string | null,
  currentUserId: string | null,
  currentUserName: string | null,
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isTypingRef = useRef(false);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!threadId || !currentUserId) return;

    const channel = supabase.channel(`typing-${threadId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        const { userId, name } = payload.payload as { userId: string; name: string };
        if (userId === currentUserId) return;

        // Add/refresh typing user
        setTypingUsers(prev => {
          const filtered = prev.filter(u => u.userId !== userId);
          return [...filtered, { userId, name }];
        });

        // Auto-clear after timeout
        const existing = typingTimers.current.get(userId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== userId));
          typingTimers.current.delete(userId);
        }, TYPING_TIMEOUT_MS);
        typingTimers.current.set(userId, timer);
      })
      .on("broadcast", { event: "stopped_typing" }, (payload) => {
        const { userId } = payload.payload as { userId: string };
        const existing = typingTimers.current.get(userId);
        if (existing) clearTimeout(existing);
        typingTimers.current.delete(userId);
        setTypingUsers(prev => prev.filter(u => u.userId !== userId));
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      typingTimers.current.forEach(t => clearTimeout(t));
      typingTimers.current.clear();
    };
  }, [threadId, currentUserId]);

  /** Call this on every keystroke in the input */
  const sendTyping = useCallback(() => {
    if (!channelRef.current || !currentUserId) return;

    // Throttle: only broadcast if not already flagged as typing
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: currentUserId, name: currentUserName ?? "Someone" },
      });
    }

    // Reset the "stop typing" debounce
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    sendTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      channelRef.current?.send({
        type: "broadcast",
        event: "stopped_typing",
        payload: { userId: currentUserId },
      });
    }, TYPING_TIMEOUT_MS);
  }, [currentUserId, currentUserName]);

  /** Call this when the user sends a message */
  const clearTyping = useCallback(() => {
    isTypingRef.current = false;
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    channelRef.current?.send({
      type: "broadcast",
      event: "stopped_typing",
      payload: { userId: currentUserId },
    });
  }, [currentUserId]);

  /** Human-readable label: "Alice is typing…" or "Alice and Bob are typing…" */
  const typingLabel = (() => {
    if (!typingUsers.length) return null;
    const names = typingUsers.map(u => u.name.split(" ")[0]);
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names[0]} and ${names.length - 1} others are typing…`;
  })();

  return { typingUsers, typingLabel, sendTyping, clearTyping };
}
