/**
 * LibraryItemRow — sortable list row.
 *
 * Renders one row of the column-aligned library list. Column widths are
 * fixed via inline grid template so they line up with the header in
 * `LibraryListHeader`. Click anywhere (except the link) to open detail.
 */
import { Package, Lock, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { OrderLibraryItem } from "@/hooks/useOrderLibrary";

interface Props {
  item: OrderLibraryItem;
  onOpen: (item: OrderLibraryItem) => void;
}

/** Shared grid template — KEEP IN SYNC with LibraryListHeader. */
export const LIBRARY_ROW_GRID =
  "grid-cols-[16px_36px_minmax(140px,1.4fr)_70px_44px_minmax(110px,0.9fr)_minmax(140px,1.6fr)_36px]";

export function LibraryItemRow({ item, onOpen }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";
  const isDeprecated = item.status === "no_longer_preferred";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
      className={cn(
        "grid items-start gap-2 px-2 py-2 border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        LIBRARY_ROW_GRID,
        isDeprecated && "opacity-60",
      )}
    >
      {/* Status dot */}
      <span className="flex h-5 items-center justify-center">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            isDeprecated ? "bg-muted-foreground/50" : "bg-emerald-500",
          )}
          title={
            isDeprecated
              ? isL ? "Ya no preferido" : "No longer preferred"
              : isL ? "Preferido" : "Preferred"
          }
        />
      </span>

      {/* Thumbnail */}
      <div className="h-9 w-9 overflow-hidden rounded border border-border/50 bg-muted/30 p-0.5">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            className={cn("h-full w-full object-contain", isDeprecated && "grayscale")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package size={14} className="text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={cn(
          "min-w-0 self-center text-sm font-medium text-foreground truncate",
          isDeprecated && "line-through",
        )}
        title={item.name}
      >
        {item.name}
      </span>

      {/* Quantity */}
      <span className="self-center text-[12px] text-muted-foreground tabular-nums truncate">
        {item.default_quantity ?? "—"}
      </span>

      {/* Substitution */}
      <span
        className={cn(
          "self-center inline-flex items-center justify-center",
          item.substitutions_allowed
            ? "text-blue-600 dark:text-blue-400"
            : "text-amber-600 dark:text-amber-400",
        )}
        title={
          item.substitutions_allowed
            ? isL ? "Sustitución permitida" : "Substitution allowed"
            : isL ? "Sin sustitución" : "No substitution"
        }
      >
        {item.substitutions_allowed ? <RefreshCw size={12} /> : <Lock size={12} />}
      </span>

      {/* Purchase */}
      <span className="self-center text-[11px] text-muted-foreground/90 truncate" title={item.purchase ?? undefined}>
        {item.purchase ?? "—"}
      </span>

      {/* Notes */}
      <span className="text-[11px] text-muted-foreground/90 leading-snug whitespace-pre-wrap line-clamp-3">
        {item.notes ?? ""}
      </span>

      {/* Link */}
      <span className="flex h-5 items-center justify-center">
        {item.website_url ? (
          <a
            href={item.website_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={isL ? "Abrir enlace" : "Open link"}
            title={isL ? "Abrir enlace" : "Open link"}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ExternalLink size={13} />
          </a>
        ) : null}
      </span>
    </div>
  );
}
