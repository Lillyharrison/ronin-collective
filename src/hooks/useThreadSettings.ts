import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ThreadSettings {
  is_muted: boolean;
  is_archived: boolean;
}

const DEFAULT_SETTINGS: ThreadSettings = { is_muted: false, is_archived: false };

export function useThreadSettings(userId: string | null) {
  const [settings, setSettings] = useState<Map<string, ThreadSettings>>(new Map());

  const fetchSettings = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("user_thread_settings" as never)
      .select("thread_id, is_muted, is_archived")
      .eq("user_id", userId);
    if (data) {
      const map = new Map<string, ThreadSettings>();
      for (const row of data as { thread_id: string; is_muted: boolean; is_archived: boolean }[]) {
        map.set(row.thread_id, { is_muted: row.is_muted, is_archived: row.is_archived });
      }
      setSettings(map);
    }
  }, [userId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const getSettings = (threadId: string): ThreadSettings =>
    settings.get(threadId) ?? DEFAULT_SETTINGS;

  const updateSetting = async (
    threadId: string,
    patch: Partial<ThreadSettings>,
  ) => {
    if (!userId) return;
    const current = getSettings(threadId);
    const next = { ...current, ...patch };

    // Optimistic
    setSettings(prev => {
      const m = new Map(prev);
      m.set(threadId, next);
      return m;
    });

    // Use raw fetch since the types file doesn't yet know about this new table
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_thread_settings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: userId,
          thread_id: threadId,
          ...next,
          updated_at: new Date().toISOString(),
        }),
      },
    );
  };

  const toggleMute = (threadId: string) => {
    const current = getSettings(threadId);
    return updateSetting(threadId, { is_muted: !current.is_muted });
  };

  const toggleArchive = (threadId: string) => {
    const current = getSettings(threadId);
    return updateSetting(threadId, { is_archived: !current.is_archived });
  };

  return { getSettings, toggleMute, toggleArchive };
}
