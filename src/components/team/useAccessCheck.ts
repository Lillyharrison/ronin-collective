import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AccessFinding, AccessOverview, AccessReport } from "./accessCheckLogic";

export function useAccessCheck(caller: string | null, master: boolean, target: string | null) {
  const client = useQueryClient();
  const key = ["access-check", caller];
  const overview = useQuery({ queryKey: [...key, "overview"], enabled: master && !!caller, staleTime: 0, retry: false, refetchOnWindowFocus: false, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_access_overview");
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid access overview");
    return data as unknown as AccessOverview[];
  } });
  const report = useQuery({ queryKey: [...key, "person", target], enabled: master && !!caller && !!target, staleTime: 0, retry: false, refetchOnWindowFocus: false, queryFn: async () => {
    if (!target) throw new Error("Choose a person");
    const { data, error } = await supabase.rpc("admin_visibility_report", { _target: target, _log: true });
    if (error) throw error;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid visibility report");
    return data as unknown as AccessReport;
  } });
  const findings = useQuery({ queryKey: [...key, "findings"], enabled: master && !!caller, queryFn: async () => {
    const columns = "id, person_id, person_name, rule, detail, status, first_seen, last_seen, resolved_at";
    const [open, resolved] = await Promise.all([
      supabase.from("access_scan_findings").select(columns).eq("status", "open").order("last_seen", { ascending: false }).limit(100),
      supabase.from("access_scan_findings").select(columns).eq("status", "resolved").gte("resolved_at", new Date(Date.now() - 14 * 86400000).toISOString()).order("resolved_at", { ascending: false }).limit(50),
    ]);
    if (open.error || resolved.error) throw open.error || resolved.error;
    return { open: open.data as AccessFinding[], resolved: resolved.data as AccessFinding[] };
  } });
  const dismiss = useMutation({ mutationFn: async (id: string) => {
    if (!master || !caller) throw new Error("Master admin only");
    const { data, error } = await supabase.from("access_scan_findings").update({ status: "dismissed" }).eq("id", id).eq("status", "open").select("id").single();
    if (error || !data) throw error || new Error("Finding was not dismissed");
  }, onSuccess: () => client.invalidateQueries({ queryKey: [...key, "findings"] }) });
  return { overview, report, findings, dismiss };
}