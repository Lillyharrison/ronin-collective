import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db, result, allRows } from "./api";
import type { Property } from "./logic";
import { invalidateTimeSettings } from "@/components/team/memberAccess";
type Person = {
  id: string;
  full_name: string;
  level: string | null;
  is_archived: boolean;
};
type Pay = {
  staff_id: string;
  time_tracking: string;
  payee_name: string;
  hourly_rate: number | null;
  daily_rate: number | null;
  pay_basis: "hourly" | "daily" | "payroll";
  currency: string;
  rounding_minutes: number;
};
function PayRow({
  p,
  value,
  es,
  saved,
}: {
  p: Person;
  value?: Pay;
  es: boolean;
  saved: () => void;
}) {
  const [v, setV] = useState<Pay>(
    value || {
      staff_id: p.id,
      time_tracking: "none",
      payee_name: "",
      hourly_rate: null,
      daily_rate: null,
      pay_basis: "hourly",
      currency: "USD",
      rounding_minutes: 15,
    },
  );
  const [busy, setBusy] = useState(false);
  const t = (a: string, b: string) => (es ? b : a);
  return (
    <form
      className="border-b py-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await result(
            db
              .from("staff_time_settings")
              .upsert(
                { ...v, payee_name: v.payee_name || null },
                { onConflict: "staff_id" },
              )
              .select("staff_id")
              .single(),
          );
          toast.success(t("Saved", "Guardado"));
          saved();
        } catch (err) {
          const message = err && typeof err === "object" && "message" in err
            ? String(err.message)
            : t("Could not save. Please try again.", "No se pudo guardar. Inténtalo de nuevo.");
          toast.error(message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">{p.full_name}</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <Label>
          {t("Who records time", "Registro de horas")}
          <select
            className="timesheet-input"
            value={v.time_tracking}
            onChange={(e) => setV({ ...v, time_tracking: e.target.value })}
          >
            <option value="trinet">TriNet</option>
            <option value="ronin">
              {t("Ronin sign-in", "Registro Ronin")}
            </option>
            <option value="none">{t("Not tracked", "Sin registro")}</option>
          </select>
        </Label>
        <Label>
          {t("Payee name", "Nombre del beneficiario")}
          <Input
            value={v.payee_name || ""}
            onChange={(e) => setV({ ...v, payee_name: e.target.value })}
          />
        </Label>
        <Label>
          {t("Paid", "Pago")}
          <select
            className="timesheet-input"
            value={v.pay_basis}
            onChange={(e) => setV({ ...v, pay_basis: e.target.value as Pay["pay_basis"] })}
          >
            <option value="hourly">{t("By the hour", "Por hora")}</option>
            <option value="daily">{t("By the day", "Por día")}</option>
            <option value="payroll">{t("Through TriNet payroll", "Por nómina TriNet")}</option>
          </select>
        </Label>
        <Label>
          {t("Hourly rate", "Tarifa por hora")}
          <Input
            type="number"
            min="0"
            step="0.01"
            value={v.hourly_rate ?? ""}
            onChange={(e) =>
              setV({
                ...v,
                hourly_rate:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Label>
        <Label>
          {t("Day rate", "Tarifa por día")}
          <Input
            type="number"
            min="0"
            step="0.01"
            value={v.daily_rate ?? ""}
            onChange={(e) =>
              setV({
                ...v,
                daily_rate:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Label>
        <Label>
          {t("Currency", "Moneda")}
          <select
            className="timesheet-input"
            value={v.currency}
            onChange={(e) => setV({ ...v, currency: e.target.value })}
          >
            {["USD", "EUR", "GBP"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Label>
        <Label>
          {t("Rounding (minutes)", "Redondeo (minutos)")}
          <Input
            type="number"
            min="1"
            max="60"
            required
            value={v.rounding_minutes}
            onChange={(e) =>
              setV({ ...v, rounding_minutes: Number(e.target.value) })
            }
          />
        </Label>
      </div>
      <Button disabled={busy} type="submit">
        {t("Save", "Guardar")}
      </Button>
    </form>
  );
}
function LocationRow({
  p,
  es,
  saved,
}: {
  p: Property;
  es: boolean;
  saved: () => void;
}) {
  const [lat, setLat] = useState(p.latitude?.toString() || "");
  const [lng, setLng] = useState(p.longitude?.toString() || "");
  const [radius, setRadius] = useState(p.geofence_radius_m || 100);
  const [busy, setBusy] = useState(false);
  const t = (a: string, b: string) => (es ? b : a);
  return (
    <form
      className="border-b py-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await result(
            db.rpc("set_property_location", {
              _property_id: p.id,
              _lat: Number(lat),
              _lng: Number(lng),
              _radius_m: radius,
            }),
          );
          saved();
          toast.success(t("Saved", "Guardado"));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>
        {p.name}{" "}
        {(p.latitude == null || p.longitude == null) && (
          <span className="timesheet-attention">
            {t("Not set", "Sin configurar")}
          </span>
        )}
      </h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <Label>
          {t("Latitude", "Latitud")}
          <Input
            type="number"
            min="-90"
            max="90"
            step="any"
            required
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </Label>
        <Label>
          {t("Longitude", "Longitud")}
          <Input
            type="number"
            min="-180"
            max="180"
            step="any"
            required
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </Label>
        <Label>
          {t("Radius (metres)", "Radio (metros)")}
          <Input
            type="number"
            min="1"
            required
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
        </Label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (!navigator.geolocation) {
              toast.error(t("Location unavailable", "Ubicación no disponible"));
              return;
            }
            setBusy(true);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setLat(String(pos.coords.latitude));
                setLng(String(pos.coords.longitude));
                setBusy(false);
              },
              () => {
                toast.error(
                  t(
                    "Could not get your location",
                    "No se pudo obtener tu ubicación",
                  ),
                );
                setBusy(false);
              },
              { enableHighAccuracy: true, timeout: 8000 },
            );
          }}
        >
          {t("Use my current location", "Usar mi ubicación actual")}
        </Button>
        <Button type="submit" disabled={busy}>
          {t("Save", "Guardar")}
        </Button>
      </div>
    </form>
  );
}
export function TimesheetSettings({
  es,
  userId,
}: {
  es: boolean;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["timesheet-settings", userId],
    queryFn: async () => {
      const response = await result<{ people: Person[] }>(
        db.functions.invoke("time-tracking-staff", { body: {} }),
      );
      // The login-only feed is shared with history: narrow only Settings.
      const roles = await allRows<{ user_id: string }>((a, b) =>
        db.from("user_roles").select("user_id").eq("role", "staff")
          .order("user_id").range(a, b),
      );
      const staffIds = new Set(roles.map((r) => r.user_id));
      const people = response.people.filter(
        (p) => p.level === "staff" && !p.is_archived && staffIds.has(p.id),
      );
      return {
        people,
        pay: await allRows<Pay>((a, b) =>
          db
            .from("staff_time_settings")
            .select(
              "staff_id,time_tracking,payee_name,hourly_rate,daily_rate,pay_basis,currency,rounding_minutes",
            )
            .order("staff_id")
            .range(a, b),
        ),
        properties: await allRows<Property>((a, b) =>
          db
            .from("properties")
            .select("id,name,timezone,latitude,longitude,geofence_radius_m")
            .order("id")
            .range(a, b),
        ),
      };
    },
  });
  const refresh = () => invalidateTimeSettings(qc);
  if (q.isError) return <p role="alert">{q.error.message}</p>;
  if (!q.data) return <p>{es ? "Cargando…" : "Loading…"}</p>;
  return (
    <div>
      <h2 className="text-lg font-semibold">
        {es ? "Horas y pago" : "Time and pay"}
      </h2>
      {q.data.people.map((p) => (
        <PayRow
          key={p.id}
          p={p}
          value={q.data.pay.find((x) => x.staff_id === p.id)}
          es={es}
          saved={refresh}
        />
      ))}
      <h2 className="text-lg font-semibold mt-6">
        {es ? "Ubicaciones de registro" : "Clock-in locations"}
      </h2>
      {q.data.properties.map((p) => (
        <LocationRow key={p.id} p={p} es={es} saved={refresh} />
      ))}
    </div>
  );
}
