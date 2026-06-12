import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Staff { id: string; full_name: string | null; job_title: string | null; }
interface Property { id: string; name: string; }
interface Shift {
  id: string;
  staff_id: string;
  property_id: string | null;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
}

interface SharePayload {
  week_start: string;
  week_end: string;
  label: string | null;
  staff: Staff[];
  properties: Property[];
  shifts: Shift[];
}

interface EditingState {
  staff_id: string;
  shift_date: string;
  existing?: Shift;
}

export default function SharedStaffSchedule() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SharePayload | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("staff-schedule-share-get", {
        body: { token },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setData(data as SharePayload);
      setError(null);
    } catch (e) {
      setError((e as Error)?.message ?? "Couldn't load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [token]);

  const weekDays = useMemo(() => {
    if (!data) return [];
    const start = parseISO(data.week_start);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [data]);

  const shiftsByCell = useMemo(() => {
    const map = new Map<string, Shift[]>();
    data?.shifts.forEach((s) => {
      const key = `${s.staff_id}|${s.shift_date}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [data]);

  if (!token || token.length < 16) {
    return <FullScreen msg="Invalid share link" sub="The link is missing or malformed." />;
  }
  if (loading) {
    return (
      <FullScreen
        msg="Loading shared schedule…"
        sub={<Loader2 className="w-5 h-5 animate-spin mx-auto mt-3" />}
      />
    );
  }
  if (error) {
    return <FullScreen msg="Can't open this link" sub={error} />;
  }
  if (!data) return null;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="space-y-1 border-b border-border pb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared staff schedule</p>
          <h1 className="text-xl sm:text-2xl font-semibold">
            Week of {format(parseISO(data.week_start), "d MMM yyyy")}
          </h1>
          {data.label && <p className="text-sm text-muted-foreground">{data.label}</p>}
          <p className="text-xs text-muted-foreground">
            Edits save live. You can only change shifts in this one week.
          </p>
        </header>

        {data.staff.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No staff to schedule.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left p-2 sticky left-0 bg-muted/40 z-10 min-w-[140px]">Staff</th>
                  {weekDays.map((d) => (
                    <th key={d.toISOString()} className="text-left p-2 min-w-[130px] font-medium">
                      <div>{format(d, "EEE")}</div>
                      <div className="text-[11px] text-muted-foreground font-normal">
                        {format(d, "d MMM")}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-2 sticky left-0 bg-background z-10 align-top">
                      <div className="font-medium">{s.full_name ?? "Unnamed"}</div>
                      {s.job_title && (
                        <div className="text-[11px] text-muted-foreground">{s.job_title}</div>
                      )}
                    </td>
                    {weekDays.map((d) => {
                      const dateStr = format(d, "yyyy-MM-dd");
                      const shifts = shiftsByCell.get(`${s.id}|${dateStr}`) ?? [];
                      return (
                        <td key={dateStr} className="p-1.5 align-top border-l border-border">
                          <div className="space-y-1">
                            {shifts.map((sh) => (
                              <button
                                key={sh.id}
                                onClick={() => setEditing({ staff_id: s.id, shift_date: dateStr, existing: sh })}
                                className="w-full text-left rounded bg-primary/10 hover:bg-primary/20 text-primary px-1.5 py-1 text-xs leading-tight"
                              >
                                <div className="font-medium">
                                  {sh.start_time?.slice(0, 5) ?? "—"} – {sh.end_time?.slice(0, 5) ?? "—"}
                                </div>
                                {sh.property_id && (
                                  <div className="text-[10px] opacity-70 truncate">
                                    {data.properties.find((p) => p.id === sh.property_id)?.name}
                                  </div>
                                )}
                              </button>
                            ))}
                            <button
                              onClick={() => setEditing({ staff_id: s.id, shift_date: dateStr })}
                              className="w-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded py-1 transition-colors"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ShiftEditDialog
          token={token}
          editing={editing}
          properties={data.properties}
          staffName={data.staff.find((s) => s.id === editing.staff_id)?.full_name ?? ""}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function FullScreen({ msg, sub }: { msg: string; sub?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold mb-2">{msg}</h1>
        {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function ShiftEditDialog({
  token, editing, properties, staffName, onClose, onSaved,
}: {
  token: string;
  editing: EditingState;
  properties: Property[];
  staffName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ex = editing.existing;
  const [startTime, setStartTime] = useState(ex?.start_time?.slice(0, 5) ?? "09:00");
  const [endTime, setEndTime] = useState(ex?.end_time?.slice(0, 5) ?? "17:00");
  const [propertyId, setPropertyId] = useState<string>(ex?.property_id ?? "__none__");
  const [notes, setNotes] = useState(ex?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const callMutate = async (action: "create" | "update" | "delete", body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("staff-schedule-share-mutate", {
        body: { token, action, shift: body },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success(action === "delete" ? "Shift removed" : "Shift saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const payload = {
      staff_id: editing.staff_id,
      shift_date: editing.shift_date,
      start_time: startTime + ":00",
      end_time: endTime + ":00",
      property_id: propertyId === "__none__" ? null : propertyId,
      notes: notes || null,
      status: "scheduled",
    };
    if (ex) callMutate("update", { ...payload, id: ex.id });
    else callMutate("create", payload);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col max-w-md">
        <DialogHeader>
          <DialogTitle>{ex ? "Edit shift" : "Add shift"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {staffName} · {format(parseISO(editing.shift_date), "EEE d MMM")}
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-base" />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-base" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Property</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No property</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base" />
          </div>
        </div>
        <div className="border-t border-border pt-3 flex gap-2">
          {ex && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => callMutate("delete", { id: ex.id })}
              disabled={busy}
            >
              <Trash2 size={14} />
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
