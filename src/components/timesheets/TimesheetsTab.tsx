import "./timesheets.css";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Settings, ArrowLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { db, result } from "./api";
import { previousPeriod, monthShift, monthName, type Overview } from "./logic";
import { TimesheetDetail } from "./TimesheetDetail";
import { TimesheetSettings } from "./Settings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusChip } from "./StatusChip";
import { orderOverview, overviewStatus } from "./presentation";
export function TimesheetsTab() {
  const { language } = useLanguage();
  const es = language === "es";
  const { userId, isAdmin, isMasterAdmin } = usePermissions();
  const {
    pendingTimesheetStaffId,
    setPendingTimesheetStaffId,
    registerBackHandler,
  } = useNavigation();
  const [period, setPeriod] = useState(previousPeriod);
  const [staff, setStaff] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const t = (a: string, b: string) => (es ? b : a);
  const allowed = isAdmin || isMasterAdmin;
  const target = useQuery({
    queryKey: ["timesheet-target", userId, pendingTimesheetStaffId],
    enabled: allowed && !!pendingTimesheetStaffId,
    queryFn: async () => {
      const id = pendingTimesheetStaffId;
      const entries = await result<{ visit_date: string }[]>(
        db
          .from("time_entries")
          .select("visit_date")
          .eq("staff_id", id)
          .is("timesheet_id", null)
          .order("visit_date", { ascending: false })
          .limit(1),
      );
      const adjustments = await result<{ period_start: string }[]>(
        db
          .from("timesheet_adjustments")
          .select("period_start")
          .eq("staff_id", id)
          .is("timesheet_id", null)
          .order("period_start", { ascending: false })
          .limit(1),
      );
      return (
        [
          entries[0]?.visit_date?.slice(0, 7) + "-01",
          adjustments[0]?.period_start,
        ]
          .filter((x) => x && !x.startsWith("undefined"))
          .sort()
          .reverse()[0] || previousPeriod()
      );
    },
  });
  useEffect(() => {
    if (pendingTimesheetStaffId && target.data) {
      setStaff(pendingTimesheetStaffId);
      setPeriod(target.data);
      setSettings(false);
      setPendingTimesheetStaffId(null);
    }
  }, [pendingTimesheetStaffId, target.data, setPendingTimesheetStaffId]);
  useEffect(() => {
    registerBackHandler(() => {
      if (staff) {
        setStaff(null);
        return true;
      }
      if (settings) {
        setSettings(false);
        return true;
      }
      return false;
    });
    return () => registerBackHandler(null);
  }, [staff, settings, registerBackHandler]);
  const overview = useQuery({
    queryKey: ["timesheet-overview", userId, period],
    enabled: allowed,
    queryFn: () =>
      result<Overview[]>(
        db.rpc("timesheet_overview", { _period_start: period }),
      ),
  });
  const ids = (overview.data || []).map(r => r.staff_id);
  const bases = useQuery({
    queryKey: ["timesheet-pay-basis", userId, ids],
    enabled: allowed && ids.length > 0,
    queryFn: async () => Object.fromEntries((await result<{ staff_id: string; pay_basis: string }[]>(db.from("staff_time_settings").select("staff_id,pay_basis").in("staff_id", ids).limit(ids.length))).map(r => [r.staff_id, r.pay_basis])) as Record<string, string>,
  });
  if (!allowed) return null;
  return (
    <div className="timesheets-surface space-y-5 min-w-0 mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        {(staff || settings) ? (
          <Button variant="ghost" className="min-h-11 px-0 gap-1 font-medium" onClick={() => { setStaff(null); setSettings(false); }}>
            <ArrowLeft size={16} />{t("Timesheets", "Hojas de horas")}
          </Button>
        ) : <h2 className="text-2xl font-medium">{t("Timesheets", "Hojas de horas")}</h2>}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="timesheet-month gap-2 font-medium">{monthName(period, es)}<ChevronDown size={16} /></Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label={t("Previous month", "Mes anterior")} onClick={() => setPeriod(monthShift(period, -1))}><ChevronLeft /></Button>
              <Input aria-label={t("Month", "Mes")} className="min-w-0" type="month" value={period.slice(0, 7)} onChange={e => e.target.value && setPeriod(e.target.value + "-01")} />
              <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label={t("Next month", "Mes siguiente")} onClick={() => setPeriod(monthShift(period, 1))}><ChevronRight /></Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {target.isError && <p role="alert">{target.error.message}</p>}
      {settings ? (
        <TimesheetSettings es={es} userId={userId} />
      ) : staff ? (
        <TimesheetDetail
          key={staff + period}
          staff={staff}
          period={period}
          es={es}
          userId={userId}
          onPeriodChange={setPeriod}
        />
      ) : (
        <>
          {overview.isPending && <p>{t("Loading…", "Cargando…")}</p>}
          {overview.isError && (
            <p role="alert">
              {overview.error.message}
              <Button onClick={() => overview.refetch()}>
                {t("Retry", "Reintentar")}
              </Button>
            </p>
          )}
          <div className="space-y-2">
            {orderOverview(overview.data || [], bases.data).map(row => (
              <Button key={row.staff_id} variant="ghost" className="timesheet-person" onClick={() => setStaff(row.staff_id)}>
                <span className="min-w-0 flex-1 text-left break-words font-medium">{row.full_name}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">{Number(row.total_hours).toFixed(2)} h</span>
                <StatusChip status={overviewStatus(row, bases.data?.[row.staff_id])} count={Math.max(row.attention_count, row.pending_count)} es={es} />
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="min-h-11 text-muted-foreground gap-2" onClick={() => { setSettings(true); setStaff(null); }}><Settings size={18} />{t("Settings", "Ajustes")}</Button>
          {overview.data?.length === 0 && (
            <p>
              {t("No timesheets for this month", "Sin hojas de horas este mes")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
