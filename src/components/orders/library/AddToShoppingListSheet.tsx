/**
 * AddToShoppingListSheet — confirms quantity + notes before adding a
 * library item to the global shopping list. Stores `library_item_id`
 * so the shopping list can render the "from library" chip.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { logger } from "@/lib/logger";
import type { OrderLibraryItem } from "@/hooks/useOrderLibrary";

interface Props {
  item: OrderLibraryItem;
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
}

export function AddToShoppingListSheet({ item, open, onClose, onAdded }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";

  const [quantity, setQuantity] = useState(item.default_quantity ?? "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    setSubmitting(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      toast.error(isL ? "Inicia sesión." : "You must be signed in.");
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.from("shopping_list_items").insert({
      name: item.name,
      category: item.category,
      quantity: quantity.trim() || null,
      notes: notes.trim() || item.notes || null,
      library_item_id: item.id,
      created_by: userId,
    });
    setSubmitting(false);
    if (error) {
      logger.error("[AddToShoppingListSheet] insert failed", error);
      toast.error(error.message ?? (isL ? "No se pudo agregar." : "Could not add to list."));
      return;
    }
    toast.success(isL ? "Agregado a la lista de compras." : "Added to shopping list.");
    onAdded?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {isL ? "Agregar a lista de compras" : "Add to shopping list"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pt-2">
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <p className="font-semibold text-foreground">{item.name}</p>
            {item.notes && (
              <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qty">{isL ? "Cantidad" : "Quantity"}</Label>
            <Input
              id="qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={isL ? "ej. 12 unidades" : "e.g. 12 units"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">
              {isL ? "Notas adicionales" : "Additional notes"}{" "}
              <span className="text-xs text-muted-foreground">({isL ? "opcional" : "optional"})</span>
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={isL ? "Algo específico para esta compra…" : "Anything specific for this order…"}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">
            {isL ? "Cancelar" : "Cancel"}
          </Button>
          <Button onClick={handleAdd} disabled={submitting} className="flex-1">
            {submitting ? (isL ? "Agregando…" : "Adding…") : (isL ? "Agregar" : "Add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
