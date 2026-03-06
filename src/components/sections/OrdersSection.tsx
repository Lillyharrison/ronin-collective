import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Truck, Package, Link as LinkIcon, FileText,
  Calendar, MapPin, User, Check, ChevronDown, ChevronUp, ExternalLink,
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
}

function getTracking(attachments: TaskAttachment[]): TrackingEntry | null {
  const t = (attachments as any[]).find((a: any) => a.type === "tracking");
  return t ?? null;
}

function TrackingPanel({ order, onSaved }: { order: OrderTask; onSaved: () => void }) {
  const { language } = useLanguage();
  const isL = language === "es";
  const { isAdmin, isMasterAdmin, isManager } = usePermissions();
  const canEdit = isAdmin || isMasterAdmin || isManager;

  const existing = getTracking(order.attachments);
  const [trackingNumber, setTrackingNumber] = useState(existing?.tracking_number ?? "");
  const [trackingUrl, setTrackingUrl] = useState(existing?.tracking_url ?? "");
  const [carrier, setCarrier] = useState(existing?.carrier ?? "");
  const [packingList, setPackingList] = useState(existing?.packing_list ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const trackingEntry: TrackingEntry = {
      type: "tracking",
      tracking_number: trackingNumber || undefined,
      tracking_url: trackingUrl || undefined,
      carrier: carrier || undefined,
      packing_list: packingList || undefined,
      notes: notes || undefined,
    };
    // Remove existing tracking entry, add updated one
    const otherAttachments = order.attachments.filter((a: any) => a.type !== "tracking");
    const updatedAttachments = [...otherAttachments, trackingEntry];
    await supabase.from("tasks").update({ attachments: updatedAttachments as any }).eq("id", order.id);
    setSaving(false);
    onSaved();
  };

  const hasTracking = !!(existing?.tracking_number || existing?.tracking_url || existing?.carrier);

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Truck size={12} />
          {isL ? "Seguimiento del envío" : "Shipping & Tracking"}
          {hasTracking && (
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--status-done))]" />
          )}
        </span>
        {expanded ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2.5 px-1">
          {/* View-only tracking link if set */}
          {existing?.tracking_url && !canEdit && (
            <a
              href={existing.tracking_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs text-accent underline"
            >
              <ExternalLink size={11} /> {isL ? "Ver seguimiento" : "Track shipment"}
            </a>
          )}

          {canEdit ? (
            <>
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
                    placeholder="UPS, FedEx..."
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
                  {isL ? "Notas" : "Notes"}
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder={isL ? "Instrucciones de entrega, etc…" : "Delivery instructions, etc…"}
                  className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground resize-none"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2 rounded-xl bg-[hsl(var(--gold))] text-charcoal text-xs font-semibold active:scale-95 transition-transform disabled:opacity-60"
              >
                {saving ? "…" : (isL ? "Guardar detalles" : "Save details")}
              </button>
            </>
          ) : (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {existing?.carrier && <p><span className="font-medium text-foreground">{isL ? "Transportista:" : "Carrier:"}</span> {existing.carrier}</p>}
              {existing?.tracking_number && <p><span className="font-medium text-foreground">{isL ? "N° seguimiento:" : "Tracking #:"}</span> {existing.tracking_number}</p>}
              {existing?.packing_list && <p className="whitespace-pre-line"><span className="font-medium text-foreground">{isL ? "Lista de empaque:" : "Packing list:"}</span> {existing.packing_list}</p>}
              {existing?.notes && <p className="whitespace-pre-line"><span className="font-medium text-foreground">{isL ? "Notas:" : "Notes:"}</span> {existing.notes}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onOpen }: { order: OrderTask; onOpen: (o: OrderTask) => void }) {
  const { language } = useLanguage();
  const isL = language === "es";
  const deliveryDate = order.due_date ? new Date(order.due_date) : null;
  const isOverdue = deliveryDate && deliveryDate < new Date() && order.status !== "completed";

  return (
    <div
      className={cn(
        "bg-card border rounded-2xl p-4 space-y-3 cursor-pointer hover:border-[hsl(var(--gold)/0.4)] transition-colors",
        order.status === "completed" ? "border-[hsl(var(--status-done)/0.3)] opacity-70" : "border-border"
      )}
      onClick={() => onOpen(order)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingCart size={14} className="text-[hsl(var(--gold))] flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground leading-snug truncate">{order.title_en}</p>
        </div>
        <span className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0",
          order.status === "completed" ? "bg-[hsl(var(--status-done)/0.12)] text-status-done border-[hsl(var(--status-done)/0.3)]" :
          order.status === "in_progress" ? "bg-accent/10 text-accent border-accent/30" :
          order.status === "urgent" ? "bg-[hsl(var(--status-urgent)/0.12)] text-status-urgent border-status-urgent/30" :
          "bg-muted text-muted-foreground border-border"
        )}>
          {order.status === "completed" ? (isL ? "ENTREGADO" : "DELIVERED") :
           order.status === "in_progress" ? (isL ? "EN TRÁNSITO" : "IN TRANSIT") :
           order.status === "urgent" ? (isL ? "URGENTE" : "URGENT") :
           (isL ? "PENDIENTE" : "PENDING")}
        </span>
      </div>

      {order.description_en && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{order.description_en}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {deliveryDate && (
          <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border",
            isOverdue ? "bg-[hsl(var(--status-urgent)/0.1)] text-status-urgent border-status-urgent/30"
                      : "bg-muted text-muted-foreground border-border")}>
            <Calendar size={9} />
            {deliveryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {isOverdue && " ⚠️"}
          </span>
        )}
        {order.property?.name && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
            <MapPin size={9} /> {order.property.name}
          </span>
        )}
        {order.assignee?.full_name && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
            <User size={9} /> {order.assignee.full_name}
          </span>
        )}
        {getTracking(order.attachments) && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-[hsl(var(--gold)/0.1)] text-[hsl(var(--gold))] border-[hsl(var(--gold)/0.3)]">
            <Truck size={9} /> {isL ? "Seguimiento añadido" : "Tracking added"}
          </span>
        )}
      </div>
    </div>
  );
}

export function OrdersSection() {
  const { language } = useLanguage();
  const { userId, isAdmin, isMasterAdmin, isManager, permLoading } = usePermissions() as any;
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
      .order("due_date", { ascending: true });

    if (error) console.error(error);
    const raw = (data ?? []) as any[];

    // Enrich assignees
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

  const pending = orders.filter(o => o.status !== "completed");
  const completed = orders.filter(o => o.status === "completed");
  const displayed = activeTab === "pending" ? pending : completed;

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

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-3 border-b border-border">
        <button
          onClick={() => setActiveTab("pending")}
          className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "pending" ? "bg-[hsl(var(--gold))] text-charcoal" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <Package size={12} />
          {isL ? "Pendientes" : "Pending"} {pending.length > 0 && `(${pending.length})`}
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={cn("flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "completed" ? "bg-[hsl(var(--status-done))] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <Check size={12} />
          {isL ? "Entregados" : "Delivered"} {completed.length > 0 && `(${completed.length})`}
        </button>
      </div>

      {/* Order list */}
      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-card border border-border animate-pulse" />)
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <ShoppingCart size={36} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground text-center">
              {activeTab === "pending"
                ? (isL ? "No hay pedidos pendientes" : "No pending orders")
                : (isL ? "No hay entregas completadas" : "No completed deliveries")}
            </p>
            <p className="text-xs text-muted-foreground/60 text-center">
              {isL ? "Crea una tarea de tipo \"Pedido\" para que aparezca aquí" : "Create a task with category \"Order\" for it to appear here"}
            </p>
          </div>
        ) : (
          displayed.map(order => (
            <div key={order.id}>
              <OrderCard order={order} onOpen={openOrder} />
              <TrackingPanel order={order} onSaved={fetchOrders} />
            </div>
          ))
        )}
      </div>

      {/* Task modal for editing the order */}
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
