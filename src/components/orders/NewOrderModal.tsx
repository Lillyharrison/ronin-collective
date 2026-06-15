/**
 * NewOrderModal — create an order directly from the Orders section.
 *
 * Mirrors the minimal info needed: title, description, property, status,
 * and optional tracking fields. Defaults to status="not_placed" so it
 * shows up as an open order awaiting placement.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useScopedProperties } from "@/hooks/useScopedProperties";
import { filterAssignableStaff } from "@/lib/assignableStaff";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function NewOrderModal({ open, onClose, onSaved }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";
  const { userId } = usePermissions();
  const { properties } = useScopedProperties();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [propertyId, setPropertyId] = useState<string>("none");
  const [status, setStatus] = useState<"not_placed" | "placed">("not_placed");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("none");
  const [staff, setStaff] = useState<{ id: string; full_name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("profiles").select("id, full_name, level").order("full_name").then(({ data }) => {
      setStaff(filterAssignableStaff((data as any[]) ?? []) as any);
    });
  }, [open]);

  const reset = () => {
    setTitle(""); setDescription(""); setPropertyId("none");
    setStatus("not_placed"); setExpectedDelivery("");
    setCarrier(""); setTrackingNumber(""); setTrackingUrl(""); setAssignedTo("none");
  };

  const handleSave = async () => {
    if (!title.trim() || !userId) return;
    setSaving(true);
    const { error } = await supabase.from("orders").insert({
      title: title.trim(),
      description: description.trim() || null,
      property_id: propertyId === "none" ? null : propertyId,
      status,
      expected_delivery: expectedDelivery || null,
      carrier: carrier.trim() || null,
      tracking_number: trackingNumber.trim() || null,
      tracking_url: trackingUrl.trim() || null,
      assigned_to: assignedTo === "none" ? null : assignedTo,
      created_by: userId,
    } as any);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Could not create order.");
      return;
    }
    toast.success(isL ? "Pedido creado" : "Order created");
    reset();
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isL ? "Nuevo pedido" : "New order"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pt-1 pr-1">
          <div>
            <Label className="text-xs">{isL ? "Artículo" : "Item"}</Label>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={isL ? "p. ej. Filtros HVAC" : "e.g. HVAC filters"} />
          </div>

          <div>
            <Label className="text-xs">{isL ? "Descripción" : "Description"}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder={isL ? "Detalles del pedido…" : "Order details…"} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{isL ? "Propiedad" : "Property"}</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isL ? "Sin propiedad" : "No property"}</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{isL ? "Estado" : "Status"}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "not_placed" | "placed")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_placed">{isL ? "No colocado" : "Not placed"}</SelectItem>
                  <SelectItem value="placed">{isL ? "Colocado" : "Placed"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{isL ? "Fecha estimada de entrega" : "Expected delivery"}</Label>
              <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{isL ? "Asignado a" : "Assigned to"}</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isL ? "Sin asignar" : "Unassigned"}</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{isL ? "Transportista" : "Carrier"}</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="UPS, FedEx…" />
            </div>
            <div>
              <Label className="text-xs">{isL ? "N° seguimiento" : "Tracking #"}</Label>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="1Z999AA1…" />
            </div>
          </div>

          <div>
            <Label className="text-xs">{isL ? "Enlace de seguimiento" : "Tracking link"}</Label>
            <Input type="url" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>

        <DialogFooter className="pt-3 border-t flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {isL ? "Cancelar" : "Cancel"}
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {isL ? "Crear pedido" : "Create order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
