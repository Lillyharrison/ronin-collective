import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Package, Check, ExternalLink, Truck, Calendar,
  MapPin, ChevronRight, ShoppingBag, Clock, AlertCircle,
} from "lucide-react";
import { OrderDetailModal, Order } from "@/components/orders/OrderDetailModal";
import { ShoppingList } from "@/components/orders/ShoppingList";
import { OrderLibraryTab } from "@/components/orders/library/OrderLibraryTab";
import { BookOpen } from "lucide-react";

type MainTab = "pending" | "delivered" | "shopping" | "library";

/* ─── Status badge ───────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const { language } = useLanguage();
  const isL = language === "es";

  if (status === "not_placed") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 uppercase tracking-wide whitespace-nowrap">
        <Clock size={8} /> {isL ? "No colocado" : "Not placed"}
      </span>
    );
  }
  if (status === "placed") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wide whitespace-nowrap">
        <Package size={8} /> {isL ? "Colocado" : "Placed"}
      </span>
    );
  }
  // Legacy: pending_delivery
  if (status === "pending_delivery") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wide whitespace-nowrap">
        <Truck size={8} /> {isL ? "En tránsito" : "In transit"}
      </span>
    );
  }
  return null;
}

/* ─── Pending row ────────────────────────────────────────────────────────────── */
function PendingRow({ order, onOpen, onMarkDelivered }: {
  order: Order;
  onOpen: (o: Order) => void;
  onMarkDelivered: (id: string) => void;
}) {
  const { language } = useLanguage();
  const isL = language === "es";
  const [delivering, setDelivering] = useState(false);
  const { isAdmin, isMasterAdmin, isManager, canEdit } = usePermissions();
  const canEdit_orders = isAdmin || isMasterAdmin || isManager || canEdit("orders");

  const deliveryDate = order.expected_delivery ? new Date(order.expected_delivery) : null;
  const isOverdue = deliveryDate && deliveryDate < new Date() && order.status !== "not_placed";
  const isNotPlaced = order.status === "not_placed";

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
      className={cn(
        "border-b border-border hover:bg-muted/40 cursor-pointer transition-colors group",
        isNotPlaced && "bg-amber-500/[0.03]"
      )}
    >
      {/* Item */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {isNotPlaced
            ? <AlertCircle size={13} className="text-amber-500 flex-shrink-0" />
            : <ShoppingCart size={13} className="text-[hsl(var(--gold))] flex-shrink-0" />}
          <span className="text-sm font-medium text-foreground truncate max-w-[140px]">{order.title}</span>
          <StatusBadge status={order.status} />
        </div>
        {order.description && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px] pl-5">{order.description}</p>
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
          <span className="text-xs text-muted-foreground/40 italic">{isNotPlaced ? "—" : (isL ? "Sin fecha" : "No date")}</span>
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

      {/* Actions */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          {canEdit_orders && !isNotPlaced && (
            <button
              onClick={handleDeliver}
              disabled={delivering}
              title={isL ? "Marcar como entregado" : "Mark as delivered"}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--status-done)/0.1)] text-status-done border border-[hsl(var(--status-done)/0.25)] hover:bg-[hsl(var(--status-done)/0.2)] transition-colors active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              <Check size={10} /> {delivering ? "…" : (isL ? "Entregar" : "Deliver")}
            </button>
          )}
          {isNotPlaced && (
            <span className="text-[10px] text-amber-500/70 italic whitespace-nowrap">
              {isL ? "Tarea abierta" : "Task open"}
            </span>
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

/* ─── Pending tile (mobile) ──────────────────────────────────────────────────── */
function PendingTile({ order, onOpen, onMarkDelivered }: {
  order: Order;
  onOpen: (o: Order) => void;
  onMarkDelivered: (id: string) => void;
}) {
  const { language } = useLanguage();
  const isL = language === "es";
  const [delivering, setDelivering] = useState(false);
  const { isAdmin, isMasterAdmin, isManager, canEdit } = usePermissions();
  const canEdit_orders = isAdmin || isMasterAdmin || isManager || canEdit("orders");

  const deliveryDate = order.expected_delivery ? new Date(order.expected_delivery) : null;
  const isOverdue = deliveryDate && deliveryDate < new Date() && order.status !== "not_placed";
  const isNotPlaced = order.status === "not_placed";

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
    <button
      onClick={() => onOpen(order)}
      className={cn(
        "w-full text-left rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform shadow-sm",
        isNotPlaced && "bg-amber-500/[0.04] border-amber-500/30"
      )}
    >
      <div className="flex items-start gap-2">
        {isNotPlaced
          ? <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          : <ShoppingCart size={16} className="text-[hsl(var(--gold))] flex-shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{order.title}</span>
            <StatusBadge status={order.status} />
          </div>
          {order.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{order.description}</p>
          )}
        </div>
        <ChevronRight size={16} className="text-muted-foreground/40 flex-shrink-0 mt-0.5" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
        {deliveryDate && (
          <div className={cn("flex items-center gap-1", isOverdue ? "text-status-urgent font-semibold" : "text-muted-foreground")}>
            <Calendar size={11} />
            {deliveryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {isOverdue && " ⚠"}
          </div>
        )}
        {order.property?.name && (
          <div className="flex items-center gap-1 text-muted-foreground truncate">
            <MapPin size={11} className="flex-shrink-0" />
            <span className="truncate">{order.property.name}</span>
          </div>
        )}
        {order.carrier && (
          <div className="flex items-center gap-1 text-muted-foreground truncate">
            <Truck size={11} className="flex-shrink-0" />
            <span className="truncate">{order.carrier}</span>
          </div>
        )}
        {order.tracking_number && (
          <div className="flex items-center gap-1 text-muted-foreground font-mono truncate">
            <span className="truncate">#{order.tracking_number}</span>
          </div>
        )}
      </div>

      {(order.tracking_url || canEdit_orders || isNotPlaced) && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
          {order.tracking_url ? (
            <a
              href={order.tracking_url}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-accent underline underline-offset-2"
            >
              <ExternalLink size={11} /> {isL ? "Ver" : "Track"}
            </a>
          ) : <span />}
          {canEdit_orders && !isNotPlaced && (
            <button
              onClick={handleDeliver}
              disabled={delivering}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[hsl(var(--status-done)/0.1)] text-status-done border border-[hsl(var(--status-done)/0.25)] active:scale-95 disabled:opacity-50"
            >
              <Check size={12} /> {delivering ? "…" : (isL ? "Entregar" : "Deliver")}
            </button>
          )}
          {isNotPlaced && (
            <span className="text-[10px] text-amber-500/80 italic">
              {isL ? "Tarea abierta" : "Task open"}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/* ─── Delivered tile (mobile) ────────────────────────────────────────────────── */
function DeliveredTile({ order, onOpen }: { order: Order; onOpen: (o: Order) => void }) {
  const { language } = useLanguage();
  const isL = language === "es";
  const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : null;

  return (
    <button
      onClick={() => onOpen(order)}
      className="w-full text-left rounded-2xl border border-border bg-card p-3 opacity-80 active:scale-[0.99] transition-transform shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Check size={16} className="text-status-done flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground block truncate">{order.title}</span>
          {order.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{order.description}</p>
          )}
        </div>
        <ChevronRight size={16} className="text-muted-foreground/40 flex-shrink-0 mt-0.5" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
        {deliveredAt && (
          <div className="flex items-center gap-1 text-status-done">
            <Check size={11} />
            {deliveredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
        {order.property?.name && (
          <div className="flex items-center gap-1 text-muted-foreground truncate">
            <MapPin size={11} className="flex-shrink-0" />
            <span className="truncate">{order.property.name}</span>
          </div>
        )}
        {order.carrier && (
          <div className="flex items-center gap-1 text-muted-foreground truncate">
            <Truck size={11} className="flex-shrink-0" />
            <span className="truncate">{order.carrier}</span>
          </div>
        )}
        {order.tracking_number && (
          <div className="flex items-center gap-1 text-muted-foreground font-mono truncate">
            <span className="truncate">#{order.tracking_number}</span>
          </div>
        )}
      </div>

      {order.tracking_url && (
        <div className="mt-3 pt-3 border-t border-border">
          <a
            href={order.tracking_url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-accent underline underline-offset-2"
          >
            <ExternalLink size={11} /> {isL ? "Ver" : "Track"}
          </a>
        </div>
      )}
    </button>
  );
}

/* ─── Main section ───────────────────────────────────────────────────────────── */
export function OrdersSection() {
  const { language } = useLanguage();
  const isL = language === "es";

  const PAGE_SIZE = 50;
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [hasMore, setHasMore]       = useState(false);
  const [page, setPage]             = useState(0);
  const [modalOrder, setModalOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab]   = useState<MainTab>("pending");

  const fetchOrders = async (pageIndex = 0) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, title, description, property_id, status, expected_delivery, delivered_at, carrier, tracking_number, tracking_url, packing_list, notes, created_at, property:properties(name)")
      .order("created_at", { ascending: false })
      .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);
    if (error) console.error(error);
    const rows = (data as any[]) ?? [];
    setHasMore(rows.length === PAGE_SIZE);
    setOrders(prev => pageIndex === 0 ? rows : [...prev, ...rows]);
    setPage(pageIndex);
    setLoading(false);
  };

  const loadMore = () => { if (!loading && hasMore) fetchOrders(page + 1); };

  useEffect(() => { fetchOrders(0); }, []);

  // pending = not_placed + placed + pending_delivery (legacy)
  const pending   = orders.filter(o => o.status !== "delivered");
  const delivered = orders.filter(o => o.status === "delivered");

  // Count breakdown for badge
  const notPlacedCount = pending.filter(o => o.status === "not_placed").length;

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
          {isL ? "Pedidos" : "Orders"}
          {pending.length > 0 && (
            <span className={cn(
              "ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold",
              activeTab === "pending" ? "bg-charcoal/20 text-charcoal" : "bg-muted-foreground/20 text-muted-foreground"
            )}>
              {pending.length}
            </span>
          )}
          {notPlacedCount > 0 && activeTab !== "pending" && (
            <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
          )}
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
          {isL ? "Lista de compras" : "Shopping List"}
        </button>
        <button
          onClick={() => setActiveTab("library")}
          className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "library" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <BookOpen size={12} />
          {isL ? "Biblioteca" : "Library"}
        </button>
      </div>

      {/* Shopping list */}
      {activeTab === "shopping" && <ShoppingList />}

      {/* Library */}
      {activeTab === "library" && <OrderLibraryTab />}

      {/* Legend for pending tab */}
      {activeTab === "pending" && !loading && pending.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-b border-border text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> {isL ? "No colocado (tarea abierta)" : "Not placed (task open)"}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> {isL ? "Colocado / en tránsito" : "Placed / in transit"}</span>
        </div>
      )}

      {/* Delivery table */}
      {(activeTab === "pending" || activeTab === "delivered") && (
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
                  ? (isL ? "No hay pedidos" : "No orders yet")
                  : (isL ? "No hay entregas completadas" : "No completed deliveries")}
              </p>
              <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
                {activeTab === "pending"
                  ? (isL ? "Activa el toggle 'Pedido' al crear una tarea para que aparezca aquí." : "Enable the 'Order' toggle when creating a task to track it here.")
                  : (isL ? "Las entregas confirmadas aparecerán aquí como historial permanente." : "Confirmed deliveries appear here as a permanent record.")}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: tiles */}
              <div className="sm:hidden px-3 py-3 space-y-2">
                {activeTab === "pending"
                  ? pending.map(o => (
                      <PendingTile
                        key={o.id}
                        order={o}
                        onOpen={setModalOrder}
                        onMarkDelivered={() => fetchOrders()}
                      />
                    ))
                  : delivered.map(o => (
                      <DeliveredTile key={o.id} order={o} onOpen={setModalOrder} />
                    ))
                }
              </div>

              {/* Desktop: table */}
              <table className="hidden sm:table w-full min-w-[640px]">
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
            </>
          )}
          {/* Load more */}
          {hasMore && !loading && (
            <div className="flex justify-center py-4">
              <button
                onClick={loadMore}
                className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                {isL ? "Cargar más" : "Load more"}
              </button>
            </div>
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
