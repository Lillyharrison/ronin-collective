import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

/** Null means unresolved/failed, never permission to show the full profile list. */
export function useVisibleStaffIds(): ReadonlySet<string> | null {
  const { userId } = usePermissions();
  const { data, isPending, isError } = useQuery({
    queryKey: ["visible-staff-ids", userId],
    enabled: Boolean(userId),
    staleTime: 2 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      // The helper is already deployed; generated client types may lag it.
      const { data: result, error } = await supabase.rpc("visible_staff_ids" as never);
      if (error) throw error;
      const data: unknown = result;
      if (!Array.isArray(data) || !data.every(id => typeof id === "string")) throw new Error("Invalid visible staff response");
      return new Set<string>(data);
    },
  });
  return !userId || isPending || isError ? null : data ?? null;
}