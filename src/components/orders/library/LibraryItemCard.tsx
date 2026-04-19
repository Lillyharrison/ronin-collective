/**
 * LibraryItemCard — tile representation of an order library item.
 *
 * Used in the read-only library grid. Tap to open detail modal.
 * Visual signals:
 *  - Image (or placeholder)
 *  - Status dot: green = preferred, muted = no_longer_preferred
 *  - Substitution policy badge: 🔒 not allowed / 🔄 allowed
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
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-transform active:scale-[0.98]",
        isDeprecated && "opacity-70",
      )}
    >
      {/* Image area */}
      <div className="relative aspect-square w-full bg-muted/40">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            className={cn(
              "h-full w-full object-cover",
              isDeprecated && "grayscale",
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package size={36} className="text-muted-foreground/30" />
          </div>
        )}

        {/* Status dot */}
        <span
          className={cn(
            "absolute left-2 top-2 inline-block h-2.5 w-2.5 rounded-full border-2 border-card shadow-sm",
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
            "absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm backdrop-blur",
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
          {item.substitutions_allowed
            ? <RefreshCw size={9} />
            : <Lock size={9} />}
        </span>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1 p-3">
        <span
          className={cn(
            "line-clamp-2 text-sm font-semibold text-foreground",
            isDeprecated && "line-through",
          )}
        >
          {item.name}
        </span>
        {item.default_quantity && (
          <span className="text-[11px] text-muted-foreground">
            {item.default_quantity}
          </span>
        )}
      </div>
    </button>
  );
}
