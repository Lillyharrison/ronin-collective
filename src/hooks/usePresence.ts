import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks the current user's online/offline presence.
 * Updates user_presence on mount, periodic heartbeat, and beforeunload.
 */
export function usePresence(userId: string | null) {
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!userId) return;

    const goOnline = async () => {
      await supabase.from("user_presence").upsert({
        user_id: userId,
        is_online: true,
        last_seen_at: new Date().toISOString(),
      });
    };

    const goOffline = async () => {
      await supabase.from("user_presence").upsert({
        user_id: userId,
        is_online: false,
        last_seen_at: new Date().toISOString(),
      });
    };

    goOnline();

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(goOnline, 30_000);

    const handleUnload = () => {
      // Best-effort offline signal
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${userId}`,
        JSON.stringify({ is_online: false, last_seen_at: new Date().toISOString() })
      );
    };

    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") goOffline();
      else goOnline();
    });

    return () => {
      clearInterval(heartbeatRef.current);
      window.removeEventListener("beforeunload", handleUnload);
      goOffline();
    };
  }, [userId]);
}
