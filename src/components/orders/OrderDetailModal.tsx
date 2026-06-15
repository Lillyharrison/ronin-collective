import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { filterAssignableStaff } from "@/lib/assignableStaff";
import { cn } from "@/lib/utils";
import {
  X, Truck, Link as LinkIcon, FileText, Check, Calendar,
  MapPin, ExternalLink, Trash2, Save, UserCircle2,
} from "lucide-react";

export interface Order {
  id: string;
  title: string;
  description: string | null;
  property_id: string | null;
  status: string;
  expected_delivery: string | null;
  delivered_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  packing_list: string | null;
  notes: string | null;
  created_at: string;
  assigned_to: string | null;
  property?: { name: string } | null;
  assignee?: { full_name: string | null } | null;
}

interface Props {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}

export function OrderDetailModal({ order, onClose, onSaved }: Props) {
  const { language } = useLanguage();
  const { isAdmin, isMasterAdmin, isManager } = usePermissions();
  const isL = language === "es";
  const canEdit = isAdmin || isMasterAdmin || isManager;

  const [carrier, setCarrier]               = useState(order.carrier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? "");
  const [trackingUrl, setTrackingUrl]       = useState(order.tracking_url ?? "");
  const [packingList, setPackingList]       = useState(order.packing_list ?? "");
  const [notes, setNotes]                   = useState(order.notes ?? "");
  const [expectedDelivery, setExpectedDelivery] = useState(
    order.expected_delivery ? order.expected_delivery.slice(0, 10) : ""
  );
  const [assignedTo, setAssignedTo] = useState<string>(order.assigned_to ?? "");
  const [staff, setStaff] = useState<{ id: string; full_name: string | null }[]>([]);
  const [saving, setSaving]       = useState(false);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    supabase.from("profiles").select("id, full_name, level").order("full_name").then(({ data }) => {
      setStaff(filterAssignableStaff((data as any[]) ?? []) as any);
    });
  }, [canEdit]);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("orders").update({
      carrier:          carrier || null,
      tracking_number:  trackingNumber || null,
      tracking_url:     trackingUrl || null,
      packing_list:     packingList || null,
      notes:            notes || null,
      expected_delivery: expectedDelivery || null,
      assigned_to:      assignedTo || null,
    } as any).eq("id", order.id);
    setSaving(false);
    onSaved();
    onClose();
  };

  const handleMarkDelivered = async () => {
    setDelivering(true);
    await supabase.from("orders").update({
      status:       "delivered",
      delivered_at: new Date().toISOString(),
      carrier:      carrier || null,
      tracking_number: trackingNumber || null,
      tracking_url:    trackingUrl || null,
      packing_list:    packingList || null,
      notes:           notes || null,
    } as any).eq("id", order.id);
    setDelivering(false);
    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    if (!window.confirm(isL ? "¿Eliminar este pedido?" : "Delete this order?")) return;
    await supabase.from("orders").delete().eq("id", order.id);
    onSaved();
    onClose();
  };

  const isPending = order.status === "pending_delivery";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl z-10 flex flex-col h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0",
              isPending
                ? "bg-[hsl(var(--gold)/0.12)] text-[hsl(var(--gold))] border-[hsl(var(--gold)/0.3)]"
                : "bg-[hsl(var(--status-done)/0.12)] text-status-done border-[hsl(var(--status-done)/0.3)]"
            )}>
              {isPending ? (isL ? "PENDIENTE" : "PENDING DELIVERY") : (isL ? "ENTREGADO" : "DELIVERED")}
            </span>
            <h2 className="font-display text-base font-semibold text-foreground truncate">{order.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {order.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{order.description}</p>
          )}

          {/* Meta pills */}
          <div className="flex flex-wrap gap-2">
            {order.property?.name && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-muted text-muted-foreground border-border">
                <MapPin size={10} /> {order.property.name}
              </span>
            )}
            {order.assignee?.full_name && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-muted text-muted-foreground border-border">
                <UserCircle2 size={10} /> {order.assignee.full_name}
              </span>
            )}
            {order.delivered_at && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-[hsl(var(--status-done)/0.1)] text-status-done border-[hsl(var(--status-done)/0.3)]">
                <Check size={10} /> {isL ? "Entregado" : "Delivered"} {new Date(order.delivered_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>

          {/* Tracking section */}
          <div className="space-y-3 px-3 py-3 bg-[hsl(var(--gold)/0.05)] border border-[hsl(var(--gold)/0.2)] rounded-xl">
            <p className="text-[10px] font-semibold text-[hsl(var(--gold))] uppercase tracking-wider flex items-center gap-1.5">
              <Truck size={11} /> {isL ? "Detalles de envío" : "Shipping & Tracking"}
            </p>

            {canEdit ? (
              <>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Calendar size={9} /> {isL ? "Fecha estimada de entrega" : "Expected delivery date"}
                  </label>
                  <input
                    type="date"
                    value={expectedDelivery}
                    onChange={e => setExpectedDelivery(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <UserCircle2 size={9} /> {isL ? "Asignado a" : "Assigned to"}
                  </label>
                  <select
                    value={assignedTo}
                    onChange={e => setAssignedTo(e.target.value)}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary text-foreground"
                  >
                    <option value="">{isL ? "Sin asignar" : "Unassigned"}</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name ?? "—"}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">
                      {isL ? "N° de seguimiento" : "Tracking #"}
                    </label>
                    <input
                      value={trackingNumber}
                      onChange={e => setTrackingNumber(e.target.value)}
                      placeholder="1Z999AA1..."
                      className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">
                      {isL ? "Transportista" : "Carrier"}
                    </label>
                    <input
                      value={carrier}
                      onChange={e => setCarrier(e.target.value)}
                      placeholder="UPS, FedEx, DHL..."
                      className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <LinkIcon size={9} /> {isL ? "Enlace de seguimiento" : "Tracking link"}
                  </label>
                  <input
                    value={trackingUrl}
                    onChange={e => setTrackingUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                {trackingUrl && (
                  <a href={trackingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-accent underline">
                    <ExternalLink size={10} /> {isL ? "Abrir enlace" : "Open tracking link"}
                  </a>
                )}
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <FileText size={9} /> {isL ? "Lista de empaque" : "Packing list"}
                  </label>
                  <textarea
                    value={packingList}
                    onChange={e => setPackingList(e.target.value)}
                    placeholder={isL ? "Artículos incluidos…" : "Items included…"}
                    rows={2}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground resize-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-1">
                    {isL ? "Notas de entrega" : "Delivery notes"}
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    placeholder={isL ? "Instrucciones, etc…" : "Delivery instructions, etc…"}
                    className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground resize-none"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {order.expected_delivery && <p><span className="font-medium text-foreground">{isL ? "Fecha estimada:" : "Expected:"}</span> {new Date(order.expected_delivery).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
                {order.carrier && <p><span className="font-medium text-foreground">{isL ? "Transportista:" : "Carrier:"}</span> {order.carrier}</p>}
                {order.tracking_number && <p><span className="font-medium text-foreground">{isL ? "N° seguimiento:" : "Tracking #:"}</span> {order.tracking_number}</p>}
                {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent underline"><ExternalLink size={10} /> {isL ? "Ver seguimiento" : "Track shipment"}</a>}
                {order.packing_list && <p className="whitespace-pre-line"><span className="font-medium text-foreground">{isL ? "Empaque:" : "Packing list:"}</span> {order.packing_list}</p>}
                {order.notes && <p className="whitespace-pre-line"><span className="font-medium text-foreground">{isL ? "Notas:" : "Notes:"}</span> {order.notes}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 flex-shrink-0 space-y-2">
          {/* Mark as delivered — prominent button when pending */}
          {isPending && canEdit && (
            <button
              onClick={handleMarkDelivered}
              disabled={delivering}
              className="w-full py-2.5 rounded-xl bg-[hsl(var(--status-done))] text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              <Check size={15} />
              {delivering ? "…" : (isL ? "✓ Marcar como entregado" : "✓ Mark as Delivered")}
            </button>
          )}
          <div className="flex gap-2">
            {(isAdmin || isMasterAdmin || isManager) && (
              <button
                onClick={handleDelete}
                className="p-2.5 rounded-xl border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {isL ? "Cerrar" : "Close"}
            </button>
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors active:scale-95"
              >
                <Save size={13} />
                {saving ? "…" : (isL ? "Guardar" : "Save")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
