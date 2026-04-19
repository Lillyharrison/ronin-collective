/**
 * LibraryItemRow — true list row (dense, single-line, table-like).
 *
 * Mirrors the compact list density used in Maintenance/other sections:
 * small 32px thumbnail, single-line title, inline meta column, and a
 * trailing quick-link button. Designed for scanning many items quickly.
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
        "group flex items-center gap-2.5 rounded-md border-b border-border bg-card px-2 py-1.5 text-left cursor-pointer transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isDeprecated && "opacity-60",
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          isDeprecated ? "bg-muted-foreground/50" : "bg-emerald-500",
        )}
        title={
          isDeprecated
            ? isL ? "Ya no preferido" : "No longer preferred"
            : isL ? "Preferido" : "Preferred"
        }
      />

      {/* Tiny thumbnail */}
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border/50 bg-muted/30 p-0.5">
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

      {/* Name (single line, truncates) */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm font-medium text-foreground",
          isDeprecated && "line-through",
        )}
      >
        {item.name}
      </span>

      {/* Inline meta — hidden on narrow widths */}
      {item.default_quantity && (
        <span className="hidden sm:inline shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {isL ? "Cant" : "Qty"} {item.default_quantity}
        </span>
      )}

      {/* Substitution icon */}
      <span
        className={cn(
          "hidden sm:inline-flex shrink-0 items-center justify-center",
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
        {item.substitutions_allowed ? <RefreshCw size={11} /> : <Lock size={11} />}
      </span>

      {/* Quick link */}
      {item.website_url ? (
        <a
          href={item.website_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={isL ? "Abrir enlace" : "Open link"}
          title={isL ? "Abrir enlace" : "Open link"}
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ExternalLink size={13} />
        </a>
      ) : (
        <span className="h-7 w-7 shrink-0" />
      )}
    </div>
  );
}
