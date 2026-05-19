import { useEffect, useState } from "react";
import { StaffCalendarTab } from "@/components/calendar/StaffCalendarTab";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Standalone Staff Scheduling section.
 * Visibility scope per-user is controlled by the `scope` field on the
 * `staff-schedule` section permission: "own" | "department" | "all".
 *
 * - master_admin / admin / manager → always "all" regardless of stored scope.
 * - Otherwise → respect the per-user scope (default "own").
 *
 * The actual filtering of which staff rows appear is delegated to
 * StaffCalendarTab via the `scopeFilterIds` prop (null = no filter / all).
 */
export function StaffSchedulingSection() {
  const { userId, role, isMasterAdmin, isAdmin, isManager, department, sectionPermissions, canEdit: permCanEdit } = usePermissions();

  const isPrincipal = role === "principal";
  const canEdit = isMasterAdmin || isAdmin || isManager || permCanEdit("staff-schedule");
  // Principals are family/owners → see all staff schedules like managers/admins.
  const elevated = isMasterAdmin || isAdmin || isManager || isPrincipal;

  // Read user-configured scope; admins/managers override to "all".
  const storedScope = sectionPermissions?.["staff-schedule"]?.scope ?? "own";
  const effectiveScope: "own" | "department" | "all" = elevated
    ? "all"
    : (storedScope as "own" | "department" | "all");

  const [scopeIds, setScopeIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadScope() {
      if (effectiveScope === "all") {
        if (!cancelled) { setScopeIds(null); setLoading(false); }
        return;
      }
      if (effectiveScope === "own") {
        if (!cancelled) { setScopeIds(userId ? [userId] : []); setLoading(false); }
        return;
      }
      // department: include everyone in the same department
      if (!department) {
        if (!cancelled) { setScopeIds(userId ? [userId] : []); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("department", department);
      if (cancelled) return;
      const ids = (data ?? []).map((p) => p.id);
      setScopeIds(ids.length > 0 ? ids : (userId ? [userId] : []));
      setLoading(false);
    }
    loadScope();
    return () => { cancelled = true; };
  }, [effectiveScope, department, userId]);

  if (loading) return null;

  return (
    <div className="px-2 py-2">
      <StaffCalendarTab canEdit={canEdit} userId={userId} scopeFilterIds={scopeIds} />
    </div>
  );
}
