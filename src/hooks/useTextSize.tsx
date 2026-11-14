import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { applyTextSize, cachedTextSize, normalizeTextSize, type TextSize } from "@/lib/textSize";

const TextSizeContext = createContext({ size: "auto" as TextSize, saving: false, ready: false, save: async (_size: TextSize) => {} });
export const textSizeQueryKey = (id: string) => ["profile-text-size", id];
export function TextSizeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [size, setSize] = useState<TextSize>(() => cachedTextSize());
  const query = useQuery({
    queryKey: textSizeQueryKey(user?.id ?? ""), enabled: !!user,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return "auto" as TextSize;
      const { data, error } = await supabase.from("profiles").select("text_size").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return normalizeTextSize((data as unknown as { text_size?: string } | null)?.text_size);
    },
  });
  useEffect(() => {
    const next = query.data ?? cachedTextSize(user?.id);
    setSize(next); applyTextSize(next, user?.id);
  }, [query.data, user?.id]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") applyTextSize(size, user?.id); };
    const visible = () => { refresh(); if (user && document.visibilityState === "visible") void client.invalidateQueries({ queryKey: textSizeQueryKey(user.id) }); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", refresh);
    return () => { document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", refresh); };
  }, [size, user?.id, client]);
  const mutation = useMutation({
    mutationFn: async (next: TextSize) => {
      if (!user) throw new Error("Please sign in.");
      const previous = size;
      // Immediate accessibility feedback; restore the confirmed preference if saving fails.
      applyTextSize(next);
      try {
        const { error } = await supabase.from("profiles").update({ text_size: next } as never).eq("id", user.id);
        if (error) throw error;
        client.setQueryData(textSizeQueryKey(user.id), next);
        setSize(next); applyTextSize(next, user.id);
      } catch (error) { applyTextSize(previous, user.id); throw error; }
    },
  });
  return <TextSizeContext.Provider value={{ size, saving: mutation.isPending, ready: !!user && query.isSuccess, save: async next => { await mutation.mutateAsync(next); } }}>{children}</TextSizeContext.Provider>;
}
export const useTextSize = () => useContext(TextSizeContext);