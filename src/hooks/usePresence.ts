import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks the current user's online/offline presence.
 * Correctly cleans up ALL event listeners on unmount / userId change.
 */
export function usePresence(userId: string | null) {
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();

  const goOnline = useCallback(async () => {
    if (!userId) return;
    await supabase.from("user_presence").upsert({
      user_id: userId,
      is_online: true,
      last_seen_at: new Date().toISOString(),
    });
  }, [userId]);

  const goOffline = useCallback(async () => {
    if (!userId) return;
    await supabase.from("user_presence").upsert({
      user_id: userId,
      is_online: false,
      last_seen_at: new Date().toISOString(),
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    goOnline();

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(goOnline, 30_000);

    const handleUnload = () => {
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${userId}`,
        JSON.stringify({ is_online: false, last_seen_at: new Date().toISOString() })
      );
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") goOffline();
      else goOnline();
    };

    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(heartbeatRef.current);
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
      goOffline();
    };
  }, [userId, goOnline, goOffline]);
}
