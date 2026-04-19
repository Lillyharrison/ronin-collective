/**
 * LibraryItemRow — list-view representation of an order library item.
 *
 * Horizontal row with a small thumbnail, name, key metadata, and
 * inline status indicators. Used when the user toggles list view in
 * OrderLibraryTab.
 */
import { Package, Lock, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { OrderLibraryItem } from "@/hooks/useOrderLibrary";

interface Props {
  item: OrderLibraryItem;
  onOpen: (item: OrderLibraryItem) => void;
}

export function LibraryItemRow({ item, onOpen }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";
  const isDeprecated = item.status === "no_longer_preferred";

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-2 text-left shadow-sm transition-colors hover:bg-accent/30 active:scale-[0.99]",
        isDeprecated && "opacity-70",
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-muted/30 p-1">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            className={cn("h-full w-full object-contain", isDeprecated && "grayscale")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package size={20} className="text-muted-foreground/30" />
          </div>
        )}
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
            isDeprecated ? "bg-muted-foreground/50" : "bg-emerald-500",
          )}
        />
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-semibold text-foreground",
              isDeprecated && "line-through",
            )}
          >
            {item.name}
          </span>
          {item.website_url && (
            <ExternalLink size={11} className="shrink-0 text-muted-foreground/50" />
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {item.default_quantity && (
            <span className="font-medium">
              {isL ? "Cant" : "Qty"}: {item.default_quantity}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-0.5",
              item.substitutions_allowed
                ? "text-blue-600 dark:text-blue-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {item.substitutions_allowed ? <RefreshCw size={9} /> : <Lock size={9} />}
            {item.substitutions_allowed
              ? isL ? "Sust." : "Sub OK"
              : isL ? "Sin sust." : "No sub"}
          </span>
        </div>

        {item.notes && (
          <p className="mt-0.5 text-[11px] text-muted-foreground/80 whitespace-pre-wrap leading-snug">
            {item.notes}
          </p>
        )}
      </div>
    </button>
  );
}
