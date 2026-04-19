/**
 * LibraryItemCard — compact tile for an order library item.
 *
 * Fixed-height image area (h-20) so all tiles share an identical icon
 * footprint regardless of how much text content sits below.
 */
import { Package, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { OrderLibraryItem } from "@/hooks/useOrderLibrary";

interface Props {
  item: OrderLibraryItem;
  onOpen: (item: OrderLibraryItem) => void;
}

export function LibraryItemCard({ item, onOpen }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";
  const isDeprecated = item.status === "no_longer_preferred";

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-transform active:scale-[0.98]",
        isDeprecated && "opacity-70",
      )}
    >
      {/* Fixed-height icon area */}
      <div className="relative h-20 w-full bg-muted/30 p-2">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            className={cn(
              "h-full w-full object-contain",
              isDeprecated && "grayscale",
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package size={24} className="text-muted-foreground/30" />
          </div>
        )}

        {/* Status dot */}
        <span
          className={cn(
            "absolute left-1.5 top-1.5 inline-block h-2 w-2 rounded-full border-2 border-card shadow-sm",
            isDeprecated ? "bg-muted-foreground/50" : "bg-emerald-500",
          )}
          title={
            isDeprecated
              ? isL ? "Ya no preferido" : "No longer preferred"
              : isL ? "Preferido" : "Preferred"
          }
        />

        {/* Substitution badge */}
        <span
          className={cn(
            "absolute right-1.5 top-1.5 inline-flex items-center justify-center rounded-full p-1 shadow-sm backdrop-blur",
            item.substitutions_allowed
              ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          )}
          title={
            item.substitutions_allowed
              ? isL ? "Sustituciones permitidas" : "Substitutions allowed"
              : isL ? "Sin sustituciones" : "No substitutions"
          }
        >
          {item.substitutions_allowed ? <RefreshCw size={8} /> : <Lock size={8} />}
        </span>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-0.5 px-2 py-1.5 border-t border-border/50">
        <span
          className={cn(
            "line-clamp-2 text-[11px] font-semibold leading-tight text-foreground",
            isDeprecated && "line-through",
          )}
        >
          {item.name}
        </span>
        {item.default_quantity && (
          <span className="text-[10px] text-muted-foreground leading-tight">
            {isL ? "Cant" : "Qty"}: {item.default_quantity}
          </span>
        )}
        {item.notes && (
          <span className="line-clamp-2 text-[9px] text-muted-foreground/80 leading-snug whitespace-pre-wrap">
            {item.notes}
          </span>
        )}
      </div>
    </button>
  );
}
