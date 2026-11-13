import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildCartLinks, splitForAmazon, type LibInfo, type ListLine } from "@/lib/amazonCart";
import { Copy, ExternalLink, ShoppingCart, Check } from "lucide-react";
import { toast } from "sonner";

interface View {
  lines: ListLine[];
  lib: Map<string, LibInfo>;
  house: { name: string; address: string } | null;
  onMarkPlaced?: () => void;
}

/** Pure view (testable): button with count + dialog. */
export function AmazonCartView({ lines, lib, house, onMarkPlaced }: View) {
  const { language } = useLanguage();
  const es = language === "es";
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const { amazon, other } = useMemo(() => splitForAmazon(lines, lib), [lines, lib]);
  const links = useMemo(() => buildCartLinks(amazon), [amazon]);
  const multiSite = new Set(links.map(l => l.site)).size > 1;
  if (!lines.length) return null;
  const address = house ? `${house.name}, ${house.address}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); toast.success(es ? "Dirección copiada" : "Address copied"); }
    catch { toast.error(es ? "No se pudo copiar" : "Could not copy"); }
  };
  return <>
    <Button variant="outline" className="w-full min-h-11 h-auto whitespace-normal" onClick={() => setOpen(true)}>
      <ShoppingCart />
      <span className="text-left">{es ? "Enviar al carrito de Amazon" : "Send to Amazon cart"}
        <span className="block text-xs text-muted-foreground font-normal">
          {es ? `${amazon.length} de ${lines.length} artículos tienen código de Amazon` : `${amazon.length} of ${lines.length} items have an Amazon code`}
        </span></span>
    </Button>
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setOpened(false); }}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col max-w-full sm:max-w-lg">
        <DialogHeader><DialogTitle>{es ? "Enviar al carrito de Amazon" : "Send to Amazon cart"}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 py-2 text-base sm:text-sm break-words">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p><span className="font-semibold">{es ? "Entregar en:" : "Deliver to:"}</span> {address || (es ? "Sin dirección" : "No address")}</p>
            {address && <Button size="sm" variant="outline" className="min-h-11" onClick={copy}><Copy />{es ? "Copiar dirección" : "Copy address"}</Button>}
          </div>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>{es ? "Usa solo la lista de esta casa de una vez." : "Use only this house's list in one go."}</li>
            <li>{es ? "Vacía primero tu carrito de Amazon si aún tiene artículos de otra casa." : "Empty your Amazon cart first if it still holds items for another house."}</li>
            <li>{es ? "Elige la dirección de arriba al pagar." : "Choose the address above at checkout."}</li>
          </ol>
          <section>
            <h3 className="font-semibold mb-1">{es ? "Van a Amazon" : "Going to Amazon"} ({amazon.length})</h3>
            {amazon.length ? <ul className="space-y-1">{amazon.map((a, i) => <li key={i} className="flex justify-between gap-2"><span className="min-w-0">{a.name}</span><span className="tabular-nums shrink-0">× {a.quantity}</span></li>)}</ul>
              : <p className="text-muted-foreground">{es ? "Ningún artículo tiene código de Amazon." : "No items have an Amazon code."}</p>}
          </section>
          {other.length > 0 && <section>
            <h3 className="font-semibold mb-1">{es ? "No incluidos (sin código de Amazon)" : "Not included (no Amazon code)"} ({other.length})</h3>
            <ul className="space-y-1">{other.map((o, i) => <li key={i} className="flex justify-between gap-2 items-center">
              <span className="min-w-0">{o.name}{o.quantity ? ` × ${o.quantity}` : ""}</span>
              {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-primary underline min-h-11">{es ? "Enlace" : "Link"}<ExternalLink size={14} /></a>}
            </li>)}</ul>
          </section>}
          <p className="text-muted-foreground text-sm">{es ? "Pagarás tú mismo en Amazon. No se pide nada hasta que lo hagas." : "You will check out on Amazon yourself. Nothing is ordered until you do."}</p>
        </div>
        <div className="border-t border-border pt-3 space-y-2">
          {links.map(l => <Button key={l.url} asChild className="w-full min-h-11 h-auto whitespace-normal">
            <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>
              <ExternalLink />{es ? "Abrir Amazon con estos artículos" : "Open Amazon with these items"}
              {multiSite ? ` (${l.site.replace(/^www\./, "")})` : ""}{l.parts > 1 ? (es ? ` · Parte ${l.part} de ${l.parts}` : ` · Part ${l.part} of ${l.parts}`) : ""}
            </a></Button>)}
          {opened && onMarkPlaced && <Button variant="outline" className="w-full min-h-11" onClick={() => { setOpen(false); onMarkPlaced(); }}>
            <Check />{es ? "Después de pagar: marcar como colocado" : "After checkout: mark as placed"}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

/** Loads the order's submitted list, its library codes and the house address. */
export function AmazonCartButton({ orderId, propertyId, onMarkPlaced }: { orderId: string; propertyId: string | null; onMarkPlaced?: () => void }) {
  const { data } = useQuery({
    queryKey: ["amazon-cart", orderId, propertyId],
    queryFn: async () => {
      const { data: sub } = await supabase.from("order_list_submissions").select("lines").eq("order_id", orderId).limit(1).maybeSingle();
      const lines = ((sub?.lines as unknown as ListLine[]) ?? []).filter(l => l && l.name);
      const ids = [...new Set(lines.map(l => l.library_item_id).filter(Boolean) as string[])];
      const [{ data: li }, { data: prop }] = await Promise.all([
        ids.length ? supabase.from("order_library_items").select("id, asin, website_url, default_quantity").in("id", ids).limit(500) : Promise.resolve({ data: [] }),
        propertyId ? supabase.from("properties").select("name, address").eq("id", propertyId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const lib = new Map<string, LibInfo>(((li ?? []) as Array<LibInfo & { id: string }>).map(r => [r.id, r]));
      return { lines, lib, house: (prop as { name: string; address: string } | null) ?? null };
    },
  });
  if (!data?.lines.length) return null;
  return <AmazonCartView {...data} onMarkPlaced={onMarkPlaced} />;
}
