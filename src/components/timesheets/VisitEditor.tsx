import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { db, result } from "./api";
import {
  localInput,
  localInstant,
  reasonLabels,
  type Entry,
  type Property,
} from "./logic";
export type VisitSeed = {
  entry?: Entry;
  property_id?: string;
  date?: string;
  start?: string;
  end?: string;
  notWorked?: boolean;
};
export function VisitEditor({
  seed,
  staff,
  properties,
  es,
  onClose,
  onSaved,
}: {
  seed: VisitSeed;
  staff: string;
  properties: Property[];
  es: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const e = seed.entry;
  const [property, setProperty] = useState(
    e?.property_id || seed.property_id || properties[0]?.id || "",
  );
  const zone = properties.find((p) => p.id === property)?.timezone;
  const [start, setStart] = useState(
    e
      ? localInput(e.adj_in || e.clock_in, e.property?.timezone)
      : `${seed.date || new Date().toISOString().slice(0, 10)}T${seed.start?.slice(0, 5) || "08:00"}`,
  );
  const [end, setEnd] = useState(
    e
      ? localInput(e.adj_out || e.clock_out, e.property?.timezone)
      : `${seed.date || new Date().toISOString().slice(0, 10)}T${seed.end?.slice(0, 5) || "16:00"}`,
  );
  const [why, setWhy] = useState("");
  const [reason, setReason] = useState(e?.reason || "weekly_visit");
  const [note, setNote] = useState(e?.note || "");
  const [busy, setBusy] = useState(false);
  const t = (en: string, sp: string) => (es ? sp : en);
  async function save() {
    setBusy(true);
    try {
      if (!why.trim())
        throw new Error(t("A reason is required", "El motivo es obligatorio"));
      if (seed.notWorked && e) {
        await result(
          db.rpc("mark_time_entry_not_worked", { _id: e.id, _why: why }),
        );
      } else {
        const inside = localInstant(start, zone),
          outside = localInstant(end, zone);
        if (outside <= inside)
          throw new Error(
            t("End must be after start", "El fin debe ser posterior al inicio"),
          );
        await result(
          db.rpc(
            e ? "edit_time_entry" : "add_manual_time_entry",
            e
              ? {
                  _id: e.id,
                  _adj_in: inside,
                  _adj_out: outside,
                  _why: why,
                  _visit_reason: reason,
                  _note: note,
                }
              : {
                  _staff: staff,
                  _property: property,
                  _in: inside,
                  _out: outside,
                  _visit_reason: reason,
                  _note: note,
                  _why: why,
                },
          ),
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("Could not save visit", "No se pudo guardar"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {seed.notWorked
              ? t("Didn't work", "No trabajó")
              : e
                ? t("Edit visit", "Editar visita")
                : t("Add visit", "Añadir visita")}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 space-y-4">
          {!seed.notWorked && (
            <>
              <Label>
                {t("House", "Casa")}
                <select
                  className="timesheet-input"
                  value={property}
                  disabled={!!e}
                  onChange={(ev) => setProperty(ev.target.value)}
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Label>
              <p className="text-muted-foreground">{zone || "UTC"}</p>
              <Label>
                {t("Start", "Inicio")}
                <Input
                  type="datetime-local"
                  value={start}
                  onChange={(ev) => setStart(ev.target.value)}
                />
              </Label>
              <Label>
                {t("End", "Fin")}
                <Input
                  type="datetime-local"
                  value={end}
                  onChange={(ev) => setEnd(ev.target.value)}
                />
              </Label>
              <Label>
                {t("Visit reason", "Tipo de visita")}
                <select
                  className="timesheet-input"
                  value={reason}
                  onChange={(ev) => setReason(ev.target.value)}
                >
                  {reasonLabels.map((r) => (
                    <option key={r[0]} value={r[0]}>
                      {r[es ? 2 : 1]}
                    </option>
                  ))}
                </select>
              </Label>
              <Label>
                {t("Note", "Nota")}
                <Textarea
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                />
              </Label>
            </>
          )}
          <Label>
            {t(
              "Reason for this change (required)",
              "Motivo del cambio (obligatorio)",
            )}
            <Textarea value={why} onChange={(ev) => setWhy(ev.target.value)} />
          </Label>
        </div>
        <div className="pt-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("Cancel", "Cancelar")}
          </Button>
          <Button
            disabled={
              busy ||
              !why.trim() ||
              (!seed.notWorked && (!start || !end || !property))
            }
            onClick={save}
          >
            {t("Save", "Guardar")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
