/**
 * LibraryItemDetailModal — read-only view of a library item with primary
 * action "Add to shopping list". Edit/delete actions arrive in Step 4.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Lock, RefreshCw, Package, ShoppingBag } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { AddToShoppingListSheet } from "./AddToShoppingListSheet";
import type { OrderLibraryItem } from "@/hooks/useOrderLibrary";

interface Props {
  item: OrderLibraryItem | null;
  onClose: () => void;
  onEdit?: (item: OrderLibraryItem) => void;
  canEdit: boolean;
}

export function LibraryItemDetailModal({ item, onClose, onEdit, canEdit }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";
  const [showAdd, setShowAdd] = useState(false);

  if (!item) return null;
  const isDeprecated = item.status === "no_longer_preferred";

  return (
    <>
      <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg pr-8">{item.name}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pt-2">
            {/* Image */}
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted/30 p-4">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className={cn("h-full w-full object-contain", isDeprecated && "grayscale")}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package size={56} className="text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* Status + sub policy */}
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border",
                  isDeprecated
                    ? "bg-muted text-muted-foreground border-border"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isDeprecated ? "bg-muted-foreground/60" : "bg-emerald-500",
                  )}
                />
                {isDeprecated
                  ? isL ? "Ya no preferido" : "No longer preferred"
                  : isL ? "Preferido" : "Preferred"}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border",
                  item.substitutions_allowed
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
                )}
              >
                {item.substitutions_allowed ? <RefreshCw size={11} /> : <Lock size={11} />}
                {item.substitutions_allowed
                  ? isL ? "Sustituciones permitidas" : "Substitutions allowed"
                  : isL ? "Sin sustituciones" : "No substitutions"}
              </span>
            </div>

            {/* Default quantity */}
            {item.default_quantity && (
              <Field label={isL ? "Cantidad estándar" : "Default quantity"}>
                {item.default_quantity}
              </Field>
            )}

            {/* Size */}
            {item.size && (
              <Field label={isL ? "Tamaño" : "Size"}>
                {item.size}
              </Field>
            )}

            {/* Purchase */}
            {item.purchase && (
              <Field label={isL ? "Compra" : "Purchase"}>
                {item.purchase}
              </Field>
            )}

            {/* Notes */}
            {item.notes && (
              <Field label={isL ? "Notas" : "Notes"}>
                <p className="whitespace-pre-wrap">{item.notes}</p>
              </Field>
            )}

            {/* Aliases */}
            {item.search_aliases.length > 0 && (
              <Field label={isL ? "Conocido como" : "Also known as"}>
                <div className="flex flex-wrap gap-1.5">
                  {item.search_aliases.map((a) => (
                    <span
                      key={a}
                      className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </Field>
            )}

            {/* Website */}
            {item.website_url && (
              <Field label={isL ? "Enlace" : "Link"}>
                <a
                  href={item.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-accent underline underline-offset-2 break-all"
                >
                  <ExternalLink size={12} />
                  {item.website_url}
                </a>
              </Field>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-border">
            {canEdit && onEdit && (
              <Button variant="outline" onClick={() => onEdit(item)} className="flex-1">
                {isL ? "Editar" : "Edit"}
              </Button>
            )}
            <Button onClick={() => setShowAdd(true)} className="flex-1 gap-1.5">
              <ShoppingBag size={14} />
              {isL ? "Agregar a la lista" : "Add to list"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showAdd && (
        <AddToShoppingListSheet
          item={item}
          open={showAdd}
          onClose={() => setShowAdd(false)}
          onAdded={onClose}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}
