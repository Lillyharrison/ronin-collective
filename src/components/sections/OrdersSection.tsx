import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Package, Check, ExternalLink, Truck, Calendar,
  MapPin, ChevronRight,
} from "lucide-react";
import { TaskModal, FullTask, TaskAttachment } from "@/components/tasks/TaskModal";

interface OrderTask {
  id: string;
  title_en: string;
  description_en: string | null;
  status: "pending" | "in_progress" | "completed" | "urgent";
  due_date: string | null;
  assigned_to: string | null;
  property_id: string | null;
  category: string | null;
  attachments: TaskAttachment[];
  priority: number;
  is_draft: boolean;
  ai_suggested: boolean;
  assignee?: { full_name: string | null } | null;
  property?: { name: string } | null;
}

interface TrackingEntry {
  type: "tracking";
  tracking_number?: string;
  tracking_url?: string;
  carrier?: string;
  packing_list?: string;
  notes?: string;
  delivered_at?: string;
}

function getTracking(attachments: TaskAttachment[]): TrackingEntry | null {
  const t = (attachments as any[]).find((a: any) => a.type === "tracking");
  return t ?? null;
}

function StatusBadge({ status, isL }: { status: string; isL: boolean }) {
  return (
    <span className={cn(
      "text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap",
      status === "completed"
        ? "bg-[hsl(var(--status-done)/0.12)] text-status-done border-[hsl(var(--status-done)/0.3)]"
        : status === "in_progress"
        ? "bg-accent/10 text-accent border-accent/30"
        : status === "urgent"
        ? "bg-[hsl(var(--status-urgent)/0.12)] text-status-urgent border-status-urgent/30"
        : "bg-muted text-muted-foreground border-border"
    )}>
      {status === "completed" ? (isL ? "ENTREGADO" : "DELIVERED")
        : status === "in_progress" ? (isL ? "EN TRÁNSITO" : "IN TRANSIT")
        : status === "urgent" ? (isL ? "URGENTE" : "URGENT")
        : (isL ? "PENDIENTE" : "PENDING")}
    </span>
  );
}

/* ─── Pending delivery table row ────────────────────────────────────────────── */
function PendingRow({ order, onOpen }: { order: OrderTask; onOpen: (o: OrderTask) => void }) {
  const { language } = useLanguage();
  const isL = language === "es";
  const tracking = getTracking(order.attachments);
  const deliveryDate = order.due_date ? new Date(order.due_date) : null;
  const isOverdue = deliveryDate && deliveryDate < new Date();

  return (
    <tr
      onClick={() => onOpen(order)}
      className="border-b border-border hover:bg-muted/40 cursor-pointer transition-colors group"
    >
      {/* Item */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingCart size={13} className="text-[hsl(var(--gold))] flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">{order.title_en}</span>
        </div>
        {order.description_en && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{order.description_en}</p>
        )}
      </td>

      {/* Delivery date */}
      <td className="px-4 py-3 whitespace-nowrap">
        {deliveryDate ? (
          <span className={cn(
            "flex items-center gap-1 text-xs",
            isOverdue ? "text-status-urgent font-semibold" : "text-muted-foreground"
          )}>
            <Calendar size={10} className="flex-shrink-0" />
            {deliveryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {isOverdue && " ⚠"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic">{isL ? "Sin fecha" : "No date"}</span>
        )}
      </td>

      {/* Destination / Property */}
      <td className="px-4 py-3 whitespace-nowrap">
        {order.property?.name ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={10} /> {order.property.name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Carrier */}
      <td className="px-4 py-3 whitespace-nowrap">
        {tracking?.carrier ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Truck size={10} /> {tracking.carrier}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Tracking # */}
      <td className="px-4 py-3 whitespace-nowrap">
        {tracking?.tracking_number ? (
          <span className="text-xs font-mono text-muted-foreground">{tracking.tracking_number}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Link */}
      <td className="px-4 py-3">
        {tracking?.tracking_url ? (
          <a
            href={tracking.tracking_url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-accent underline underline-offset-2 hover:text-accent/80"
          >
            <ExternalLink size={10} /> {isL ? "Ver" : "Track"}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Open arrow */}
      <td className="px-3 py-3">
        <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </td>
    </tr>
  );
}

/* ─── Delivered table row ────────────────────────────────────────────────────── */
function DeliveredRow({ order, onOpen }: { order: OrderTask; onOpen: (o: OrderTask) => void }) {
  const { language } = useLanguage();
  const isL = language === "es";
  const tracking = getTracking(order.attachments);
  const deliveredAt = tracking?.delivered_at ? new Date(tracking.delivered_at) : null;

  return (
    <tr
      onClick={() => onOpen(order)}
      className="border-b border-border hover:bg-muted/40 cursor-pointer transition-colors group opacity-70"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Check size={13} className="text-status-done flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">{order.title_en}</span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {deliveredAt ? (
          <span className="text-xs text-status-done flex items-center gap-1">
            <Check size={10} />
            {deliveredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {order.property?.name ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={10} /> {order.property.name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {tracking?.carrier ? (
          <span className="text-xs text-muted-foreground">{tracking.carrier}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {tracking?.tracking_number ? (
          <span className="text-xs font-mono text-muted-foreground">{tracking.tracking_number}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {tracking?.tracking_url ? (
          <a
            href={tracking.tracking_url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-accent underline"
          >
            <ExternalLink size={10} /> {isL ? "Ver" : "Track"}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </td>
    </tr>
  );
}

/* ─── Main section ───────────────────────────────────────────────────────────── */
export function OrdersSection() {
  const { language } = useLanguage();
  const { userId, permLoading } = usePermissions() as any;
  const isL = language === "es";

  const [orders, setOrders] = useState<OrderTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOrder, setModalOrder] = useState<FullTask | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");

  const fetchOrders = async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select(`id, title_en, description_en, status, due_date, assigned_to, property_id, category, attachments, priority, is_draft, ai_suggested, property:properties(name)`)
      .eq("category", "order")
      .eq("is_draft", false)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error) console.error(error);
    const raw = (data ?? []) as any[];

    const ids = [...new Set(raw.map((t: any) => t.assigned_to).filter(Boolean))] as string[];
    let nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      (profiles ?? []).forEach((p: any) => { if (p.full_name) nameMap[p.id] = p.full_name; });
    }
    const enriched: OrderTask[] = raw.map((t: any) => ({
      ...t,
      assignee: t.assigned_to ? { full_name: nameMap[t.assigned_to] ?? null } : null,
    }));
    setOrders(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, [userId]);

  const openOrder = (o: OrderTask) => {
    setModalOrder({
      id: o.id,
      title_en: o.title_en,
      description_en: o.description_en,
      status: o.status,
      priority: o.priority,
      due_date: o.due_date,
      assigned_to: o.assigned_to,
      property_id: o.property_id,
      is_draft: o.is_draft,
      ai_suggested: o.ai_suggested,
      attachments: o.attachments,
      category: "order",
    });
  };

  const isDelivered = (o: OrderTask) => (o.attachments as any[]).some((a: any) => a.type === "tracking" && a.delivered_at);
  const pendingDelivery = orders.filter(o => o.status === "completed" && !isDelivered(o));
  const delivered = orders.filter(o => o.status === "completed" && isDelivered(o));
  const active = orders.filter(o => o.status !== "completed");

  const tableHeaders = [
    isL ? "Artículo" : "Item",
    isL ? (activeTab === "pending" ? "Fecha estimada" : "Entregado") : (activeTab === "pending" ? "Est. Delivery" : "Delivered"),
    isL ? "Destino" : "Destination",
    isL ? "Transportista" : "Carrier",
    isL ? "N° Seguimiento" : "Tracking #",
    isL ? "Enlace" : "Link",
    "",
  ];

  const displayed = activeTab === "pending" ? pendingDelivery : delivered;

  return (
    <div className="animate-fade-in pb-6">
      {/* Header */}
      <div className="bg-charcoal px-5 pt-6 pb-4 border-b border-charcoal-light">
        <h1 className="font-display text-3xl text-cream leading-tight">
          {isL ? "Pedidos" : "Orders"} <span className="text-gold">&</span>{" "}
          {isL ? "Entregas" : "Deliveries"}
        </h1>
        <p className="text-cream/40 text-xs mt-1 tracking-wide">
          {isL ? "Pedidos, entregas pendientes y seguimiento" : "Purchase orders, pending deliveries & tracking"}
        </p>
      </div>

      {/* Active orders strip (not yet completed) */}
      {active.length > 0 && (
        <div className="px-4 pt-4">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
            {isL ? "Pedidos activos (en proceso)" : "Active orders (being processed)"}
          </p>
          <div className="flex flex-col gap-2">
            {active.map(o => (
              <button
                key={o.id}
                onClick={() => openOrder(o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-card border border-border rounded-xl hover:border-[hsl(var(--gold)/0.4)] transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShoppingCart size={13} className="text-[hsl(var(--gold))] flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{o.title_en}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={o.status} isL={isL} />
                  <ChevronRight size={13} className="text-muted-foreground/40" />
                </div>
              </button>
            ))}
          </div>
          <div className="border-b border-border mt-4" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-3 border-b border-border">
        <button
          onClick={() => setActiveTab("pending")}
          className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "pending" ? "bg-[hsl(var(--gold))] text-charcoal" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <Package size={12} />
          {isL ? "Entrega pendiente" : "Pending Delivery"} {pendingDelivery.length > 0 && `(${pendingDelivery.length})`}
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "completed" ? "bg-[hsl(var(--status-done))] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <Check size={12} />
          {isL ? "Entregados" : "Delivered"} {delivered.length > 0 && `(${delivered.length})`}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="px-4 pt-4 space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-card border border-border animate-pulse" />)}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <ShoppingCart size={36} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground text-center">
              {activeTab === "pending"
                ? (isL ? "No hay pedidos pendientes de entrega" : "No pending deliveries")
                : (isL ? "No hay entregas completadas" : "No completed deliveries")}
            </p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
              {activeTab === "pending"
                ? (isL ? "Cuando marques un pedido como completado, aparecerá aquí. Ábrelo para añadir datos de envío." : "When you mark an order complete it appears here. Open it to add shipping details.")
                : (isL ? "Las entregas confirmadas aparecerán aquí." : "Confirmed deliveries will appear here.")}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeTab === "pending"
                ? displayed.map(o => <PendingRow key={o.id} order={o} onOpen={openOrder} />)
                : displayed.map(o => <DeliveredRow key={o.id} order={o} onOpen={openOrder} />)
              }
            </tbody>
          </table>
        )}
      </div>

      {/* Task modal */}
      {modalOrder !== undefined && (
        <TaskModal
          task={modalOrder}
          defaultDraft={false}
          onClose={() => setModalOrder(undefined)}
          onSaved={fetchOrders}
        />
      )}
    </div>
  );
}
