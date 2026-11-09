import "./timesheets.css";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { db, result } from "./api";
import { previousPeriod, monthShift, monthName, type Overview } from "./logic";
import { TimesheetDetail } from "./TimesheetDetail";
import { TimesheetSettings } from "./Settings";
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
  if (!allowed) return null;
  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {(staff || settings) && (
          <Button
            aria-label={t("Back", "Volver")}
            variant="ghost"
            size="icon"
            onClick={() => {
              setStaff(null);
              setSettings(false);
            }}
          >
            <ArrowLeft />
          </Button>
        )}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("Previous month", "Mes anterior")}
            onClick={() => setPeriod(monthShift(period, -1))}
          >
            <ChevronLeft />
          </Button>
          <Input
            aria-label={t("Month", "Mes")}
            className="w-44"
            type="month"
            value={period.slice(0, 7)}
            onChange={(e) =>
              e.target.value && setPeriod(e.target.value + "-01")
            }
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("Next month", "Mes siguiente")}
            onClick={() => setPeriod(monthShift(period, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setSettings(!settings);
            setStaff(null);
          }}
        >
          <Settings size={18} />
          {t("Settings", "Ajustes")}
        </Button>
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
        />
      ) : (
        <>
          <h2 className="font-semibold">{monthName(period, es)}</h2>
          {overview.isPending && <p>{t("Loading…", "Cargando…")}</p>}
          {overview.isError && (
            <p role="alert">
              {overview.error.message}
              <Button onClick={() => overview.refetch()}>
                {t("Retry", "Reintentar")}
              </Button>
            </p>
          )}
          {overview.data?.map((row) => {
            const attention = Math.max(row.attention_count, row.pending_count);
            return (
              <Button
                key={row.staff_id}
                variant="ghost"
                className="w-full h-auto min-h-16 py-3 border-b rounded-none justify-between text-left whitespace-normal gap-3"
                onClick={() => setStaff(row.staff_id)}
              >
                <span className="min-w-0 break-words">
                  {row.full_name}
                  <span className="block text-muted-foreground">
                    {Number(row.total_hours).toFixed(2)} h · {row.visits}{" "}
                    {t("visits", "visitas")}
                  </span>
                </span>
                <span
                  className={
                    "timesheet-status " +
                    (row.timesheet_status === "paid"
                      ? "timesheet-green"
                      : row.timesheet_status === "issued"
                        ? "timesheet-issued"
                        : attention
                          ? "timesheet-attention"
                          : "text-muted-foreground")
                  }
                >
                  {row.timesheet_status === "paid"
                    ? t("Paid", "Pagado")
                    : row.timesheet_status === "issued"
                      ? `${t("Issued", "Emitido")} v${row.timesheet_version}`
                      : attention
                        ? `${attention} ${t("need attention", "por revisar")}`
                        : t("Ready to issue", "Listo para emitir")}
                </span>
              </Button>
            );
          })}
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
