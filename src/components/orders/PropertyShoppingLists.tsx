import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useScopedProperties } from "@/hooks/useScopedProperties";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ChecklistTemplate } from "@/hooks/useChecklists";
import { OrderListDetailPage } from "@/components/checklists/OrderListDetailPage";
import { ShoppingList } from "@/components/orders/ShoppingList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ShoppingBag, ChevronRight, MapPin } from "lucide-react";
import { toast } from "sonner";

type ShoppingTemplate = ChecklistTemplate & { order_recipient_ids: string[] };

export function PropertyShoppingLists({ onSent }: { onSent: (id: string) => void }) {
  const { userId, isAdmin, isMasterAdmin } = usePermissions();
  const { activePropertyId } = useNavigation();
  const { properties } = useScopedProperties();
  const { language } = useLanguage();
  const es = language === "es";
  const [params, setParams] = useSearchParams();
  const [property, setProperty] = useState(activePropertyId ?? "all");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [createProperty, setCreateProperty] = useState(activePropertyId ?? "");
  const [saving, setSaving] = useState(false);
  const [general, setGeneral] = useState(false);
  const { data: lists = [], isLoading, error, refetch } = useQuery({
    queryKey: ["property-shopping-lists", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("checklist_templates")
        .select("id,title,category,subcategory,icon,color,property_id,is_universal,is_published,sort_order,recurrence,recurrence_day,assigned_role,assigned_department,notify_on_day,only_when_occupied,cover_image_url,manual_link_url,manual_link_label,order_recipient_ids")
        .eq("kind", "order_list").order("title").limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as ShoppingTemplate[];
    },
  });
  const selected = lists.find(l => l.id === params.get("list"));
  const closeList = () => { const next = new URLSearchParams(params); next.delete("list"); setParams(next); refetch(); };
  const create = async () => {
    if (!title.trim() || !createProperty || !userId) return;
    setSaving(true);
    const { data, error } = await supabase.from("checklist_templates").insert({
      title: title.trim(), category: "cleaning", subcategory: "stocking", icon: "🛒", color: "gold",
      property_id: createProperty, kind: "order_list", is_published: true, created_by: userId,
    }).select("id").single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message ?? "Could not create list"); return; }
    await refetch();
    setCreating(false); setTitle("");
    const next = new URLSearchParams(params); next.set("list", data.id); setParams(next);
  };
  if (selected) return <OrderListDetailPage template={selected}
    propertyName={properties.find(p => p.id === selected.property_id)?.name}
    onClose={closeList} onSent={onSent} />;
  if (general) return <><Button variant="ghost" className="m-4" onClick={() => setGeneral(false)}>{es ? "Volver a las listas" : "Back to lists"}</Button><ShoppingList /></>;
  return <div className="px-4 py-4 space-y-4">
    <div className="flex flex-wrap gap-3 items-center justify-between">
      <select aria-label={es ? "Propiedad" : "Property"} value={property} onChange={e => setProperty(e.target.value)} className="bg-background border border-input rounded-md px-3 min-h-11 text-base max-w-full">
        <option value="all">{es ? "Todas las propiedades" : "All properties"}</option>
        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {(isAdmin || isMasterAdmin) && <Button className="min-h-11" onClick={() => { setCreateProperty(property === "all" ? activePropertyId ?? "" : property); setCreating(true); }}><Plus />{es ? "Nueva lista" : "New shopping list"}</Button>}
    </div>
    {error ? <p className="text-destructive">{es ? "No se pudieron cargar las listas." : "Could not load shopping lists."}</p> : isLoading ? <div className="h-20 bg-muted animate-pulse rounded-md" /> :
      lists.filter(l => property === "all" || l.property_id === property).map(l => <Button key={l.id} variant="outline" className="w-full h-auto min-h-20 justify-start text-left p-4 whitespace-normal" onClick={() => { const next = new URLSearchParams(params); next.set("list", l.id); setParams(next); }}>
        <ShoppingBag className="text-gold" />
        <span className="flex-1 min-w-0"><span className="block text-base font-semibold">{l.title}</span><span className="flex items-center gap-1 text-sm text-muted-foreground mt-1"><MapPin size={12} />{properties.find(p => p.id === l.property_id)?.name}</span></span><ChevronRight />
      </Button>)}
    {!isLoading && !error && lists.filter(l => property === "all" || l.property_id === property).length === 0 && <p className="text-muted-foreground py-6">{es ? "No hay listas para esta propiedad." : "No shopping lists for this property yet."}</p>}
    <div className="pt-4 border-t border-border"><Button variant="ghost" className="min-h-11" onClick={() => setGeneral(true)}><ShoppingBag />{es ? "Lista general de compras" : "General shopping list"}<ChevronRight /></Button></div>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
      <DialogHeader><DialogTitle>{es ? "Nueva lista de compras" : "New shopping list"}</DialogTitle></DialogHeader>
      <div className="flex-1 overflow-y-auto space-y-4 py-4">
        <label className="block space-y-2"><span>{es ? "Nombre" : "List name"}</span><Input value={title} onChange={e => setTitle(e.target.value)} className="text-base" /></label>
        <label className="block space-y-2"><span>{es ? "Propiedad" : "Property"}</span><select value={createProperty} onChange={e => setCreateProperty(e.target.value)} className="w-full bg-background border border-input rounded-md min-h-11 px-3 text-base"><option value="">{es ? "Selecciona una propiedad" : "Select a property"}</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </div>
      <div className="border-t border-border pt-4 flex gap-2"><Button variant="outline" onClick={() => setCreating(false)}>{es ? "Cancelar" : "Cancel"}</Button><Button className="flex-1" disabled={saving || !title.trim() || !createProperty} onClick={create}>{saving ? "…" : es ? "Crear lista" : "Create list"}</Button></div>
    </DialogContent></Dialog>
  </div>;
}