import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

export function useAssignableProfileIds(sections: string[]): ReadonlySet<string> | null {
  const { userId } = usePermissions();
  const normalized = [...new Set(sections)].sort();
  const { data, isPending, isError } = useQuery({
    queryKey: ["assignable-profile-ids", userId, normalized],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("profile_ids_who_can_see", { _sections: normalized });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Invalid assignable profile response");
      return new Set(data);
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
  return isPending || isError ? null : data ?? null;
}