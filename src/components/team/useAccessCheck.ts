import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AccessFinding, AccessOverview, AccessReport } from "./accessCheckLogic";

export function useAccessCheck(caller: string | null, master: boolean, target: string | null) {
  const client = useQueryClient();
  const key = ["access-check", caller];
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [personErrors, setPersonErrors] = useState<Record<string, boolean>>({});
  const checking = useRef(false);
  const overview = useQuery({ queryKey: [...key, "overview"], enabled: master && !!caller, staleTime: 0, retry: false, refetchOnWindowFocus: false, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_access_overview");
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid access overview");
    return data as unknown as AccessOverview[];
  } });
  const personOptions = (id: string) => ({
    queryKey: [...key, "check-person", id], staleTime: 0, retry: false as const,
    queryFn: async () => {
      if (!master || !caller) throw new Error("Master admin only");
      try {
        const { data, error } = await supabase.rpc("admin_access_check_person", { _target: id });
        if (error) throw error;
        if (!data || typeof data !== "object" || Array.isArray(data) || !("person" in data)) throw new Error("Invalid person check");
        const result = data as unknown as AccessOverview;
        client.setQueryData<AccessOverview[]>([...key, "overview"], rows => rows?.some(row => row.person.id === id) ? rows.map(row => row.person.id === id ? result : row) : [...(rows ?? []), result]);
        setPersonErrors(errors => ({ ...errors, [id]: false }));
        return result;
      } catch (error) {
        setPersonErrors(errors => ({ ...errors, [id]: true }));
        throw error;
      }
    },
  });
  const personCheck = useQuery({ ...personOptions(target ?? ""), enabled: master && !!caller && !!target && !progress, refetchOnWindowFocus: false });
  const refreshPerson = async (id: string) => { try { await client.fetchQuery(personOptions(id)); } catch { /* The row keeps its stored result and shows Retry. */ } };
  const checkAll = async () => {
    if (!master || !caller || checking.current) return;
    checking.current = true;
    const rows = overview.data ?? [];
    try {
      for (let i = 0; i < rows.length; i++) {
        setProgress({ current: i + 1, total: rows.length });
        await refreshPerson(rows[i].person.id);
      }
      await overview.refetch();
      await findings.refetch();
    } finally { checking.current = false; setProgress(null); }
  };
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
  return { overview, report, findings, dismiss, personCheck, refreshPerson, checkAll, progress, personErrors };
}