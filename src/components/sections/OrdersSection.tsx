import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Package, Check, ExternalLink, Truck, Calendar,
  MapPin, ChevronRight, ShoppingBag,
} from "lucide-react";
import { OrderDetailModal, Order } from "@/components/orders/OrderDetailModal";
import { ShoppingList } from "@/components/orders/ShoppingList";

type MainTab = "pending" | "delivered" | "shopping";

/* ─── Pending row ────────────────────────────────────────────────────────────── */
function PendingRow({ order, onOpen, onMarkDelivered }: {
  order: Order;
  onOpen: (o: Order) => void;
  onMarkDelivered: (id: string) => void;
}) {
  const { language } = useLanguage();
  const isL = language === "es";
  const [delivering, setDelivering] = useState(false);
  const { isAdmin, isMasterAdmin, isManager } = usePermissions();
  const canEdit = isAdmin || isMasterAdmin || isManager;

  const deliveryDate = order.expected_delivery ? new Date(order.expected_delivery) : null;
  const isOverdue = deliveryDate && deliveryDate < new Date();

  const handleDeliver = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDelivering(true);
    await supabase.from("orders").update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
    } as any).eq("id", order.id);
    setDelivering(false);
    onMarkDelivered(order.id);
  };

  return (
    <tr
      onClick={() => onOpen(order)}
      className="border-b border-border hover:bg-muted/40 cursor-pointer transition-colors group"
    >
      {/* Item */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingCart size={13} className="text-[hsl(var(--gold))] flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">{order.title}</span>
        </div>
        {order.description && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{order.description}</p>
        )}
      </td>

      {/* Expected delivery */}
      <td className="px-4 py-3 whitespace-nowrap">
        {deliveryDate ? (
          <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-status-urgent font-semibold" : "text-muted-foreground")}>
            <Calendar size={10} className="flex-shrink-0" />
            {deliveryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {isOverdue && " ⚠"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic">{isL ? "Sin fecha" : "No date"}</span>
        )}
      </td>

      {/* Destination */}
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
        {order.carrier ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Truck size={10} /> {order.carrier}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Tracking # */}
      <td className="px-4 py-3 whitespace-nowrap">
        {order.tracking_number ? (
          <span className="text-xs font-mono text-muted-foreground">{order.tracking_number}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Link */}
      <td className="px-4 py-3">
        {order.tracking_url ? (
          <a
            href={order.tracking_url}
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

      {/* Mark delivered */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <button
              onClick={handleDeliver}
              disabled={delivering}
              title={isL ? "Marcar como entregado" : "Mark as delivered"}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--status-done)/0.1)] text-status-done border border-[hsl(var(--status-done)/0.25)] hover:bg-[hsl(var(--status-done)/0.2)] transition-colors active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              <Check size={10} /> {delivering ? "…" : (isL ? "Entregar" : "Deliver")}
            </button>
          )}
          <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        </div>
      </td>
    </tr>
  );
}

/* ─── Delivered row ──────────────────────────────────────────────────────────── */
function DeliveredRow({ order, onOpen }: { order: Order; onOpen: (o: Order) => void }) {
  const { language } = useLanguage();
  const isL = language === "es";
  const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : null;

  return (
    <tr
      onClick={() => onOpen(order)}
      className="border-b border-border hover:bg-muted/40 cursor-pointer transition-colors group opacity-70"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Check size={13} className="text-status-done flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">{order.title}</span>
        </div>
        {order.description && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{order.description}</p>
        )}
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
        {order.carrier ? (
          <span className="text-xs text-muted-foreground">{order.carrier}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {order.tracking_number ? (
          <span className="text-xs font-mono text-muted-foreground">{order.tracking_number}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {order.tracking_url ? (
          <a
            href={order.tracking_url}
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
  const { userId } = usePermissions() as any;
  const isL = language === "es";

  const [orders, setOrders]       = useState<Order[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modalOrder, setModalOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>("pending");

  const fetchOrders = async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, title, description, property_id, status, expected_delivery, delivered_at, carrier, tracking_number, tracking_url, packing_list, notes, created_at, property:properties(name)")
      .order("expected_delivery", { ascending: true, nullsFirst: false });
    if (error) console.error(error);
    setOrders((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, [userId]);

  const pending   = orders.filter(o => o.status === "pending_delivery");
  const delivered = orders.filter(o => o.status === "delivered");

  const tableHeaders = [
    isL ? "Artículo" : "Item",
    activeTab === "pending" ? (isL ? "Fecha estimada" : "Est. Delivery") : (isL ? "Entregado" : "Delivered"),
    isL ? "Destino" : "Destination",
    isL ? "Transportista" : "Carrier",
    isL ? "N° Seguimiento" : "Tracking #",
    isL ? "Enlace" : "Link",
    "",
  ];

  const displayed = activeTab === "pending" ? pending : delivered;

  return (
    <div className="animate-fade-in pb-6">
      {/* Header */}
      <div className="bg-charcoal px-5 pt-6 pb-4 border-b border-charcoal-light">
        <h1 className="font-display text-3xl text-cream leading-tight">
          {isL ? "Pedidos" : "Orders"} <span className="text-gold">&</span>{" "}
          {isL ? "Entregas" : "Deliveries"}
        </h1>
        <p className="text-cream/40 text-xs mt-1 tracking-wide">
          {isL ? "Pedidos, entregas pendientes y lista de compras" : "Purchase orders, pending deliveries & shopping list"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-3 border-b border-border">
        <button
          onClick={() => setActiveTab("pending")}
          className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "pending" ? "bg-[hsl(var(--gold))] text-charcoal" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <Package size={12} />
          {isL ? "Pendiente" : "Pending"} {pending.length > 0 && `(${pending.length})`}
        </button>
        <button
          onClick={() => setActiveTab("delivered")}
          className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "delivered" ? "bg-[hsl(var(--status-done))] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <Check size={12} />
          {isL ? "Entregados" : "Delivered"} {delivered.length > 0 && `(${delivered.length})`}
        </button>
        <button
          onClick={() => setActiveTab("shopping")}
          className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "shopping" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <ShoppingBag size={12} />
          {isL ? "Lista" : "List"}
        </button>
      </div>

      {/* Shopping list sub-section */}
      {activeTab === "shopping" && <ShoppingList />}

      {/* Delivery table */}
      {activeTab !== "shopping" && (
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
                  ? (isL ? "Cuando marques un pedido de tarea como completado, aparecerá aquí automáticamente." : "When you complete a task marked as an order, it appears here automatically.")
                  : (isL ? "Las entregas confirmadas aparecerán aquí como historial permanente." : "Confirmed deliveries appear here as a permanent record.")}
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
                  ? pending.map(o => (
                      <PendingRow
                        key={o.id}
                        order={o}
                        onOpen={setModalOrder}
                        onMarkDelivered={() => fetchOrders()}
                      />
                    ))
                  : delivered.map(o => (
                      <DeliveredRow key={o.id} order={o} onOpen={setModalOrder} />
                    ))
                }
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Order detail modal */}
      {modalOrder && (
        <OrderDetailModal
          order={modalOrder}
          onClose={() => setModalOrder(null)}
          onSaved={fetchOrders}
        />
      )}
    </div>
  );
}
