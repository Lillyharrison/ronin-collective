/**
 * OrderLibraryTab — top-level container for the read-only library grid.
 *
 * Mounted by OrdersSection as a tab. Handles search, status filter,
 * and category filter. Tile clicks open the detail modal.
 *
 * Step 4 will add the create/edit modal launched from `onEdit`.
 */
import { useMemo, useState } from "react";
import { Search, Plus, BookOpen, LayoutGrid, List } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { cn } from "@/lib/utils";
import { useOrderLibrary, type OrderLibraryItem } from "@/hooks/useOrderLibrary";
import { findLibraryMatches } from "@/lib/libraryFuzzyMatch";
import { LibraryItemCard } from "./LibraryItemCard";
import { LibraryItemRow } from "./LibraryItemRow";
import { LibraryItemDetailModal } from "./LibraryItemDetailModal";

const CATEGORIES = [
  { key: "all",      label: "All",                 labelEs: "Todos",            emoji: "📚" },
  { key: "food",     label: "Food & Drink",        labelEs: "Comida y bebida",  emoji: "🍎" },
  { key: "cleaning", label: "Cleaning",            labelEs: "Limpieza",         emoji: "🧹" },
  { key: "supplies", label: "Supplies",            labelEs: "Suministros",      emoji: "📦" },
  { key: "personal", label: "Personal Care",       labelEs: "Cuidado personal", emoji: "🧴" },
  { key: "tech",     label: "Tech & Electronics",  labelEs: "Tecnología",       emoji: "💡" },
  { key: "other",    label: "Other",               labelEs: "Otro",             emoji: "🛒" },
];

type StatusFilter = "preferred" | "all" | "no_longer_preferred";

export function OrderLibraryTab() {
  const { language } = useLanguage();
  const isL = language === "es";
  const { isAdmin, isMasterAdmin, canEdit } = usePermissions();
  const canEditLibrary = isAdmin || isMasterAdmin || canEdit("orders");

  const { items, loading } = useOrderLibrary();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("preferred");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<OrderLibraryItem | null>(null);
  const [viewMode, setViewMode] = useLocalStorage<"grid" | "list">(
    "order-library-view-mode",
    "grid",
  );

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter((i) => i.category === categoryFilter);
    if (query.trim()) {
      const matches = findLibraryMatches(query, list, { minScore: 0.4, limit: 50 });
      list = matches.map((m) => m.item);
    }
    return list;
  }, [items, statusFilter, categoryFilter, query]);

  return (
    <div className="px-3 sm:px-4 py-3">
      {/* Search + add */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isL ? "Buscar en la biblioteca…" : "Search the library…"}
            className="w-full h-10 pl-9 pr-3 text-base sm:text-sm rounded-xl border border-border bg-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {canEditLibrary && (
          <button
            type="button"
            disabled
            title={isL ? "Próximamente" : "Coming in step 4"}
            className="h-10 px-3 rounded-xl bg-[hsl(var(--gold))] text-charcoal text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{isL ? "Nuevo" : "New"}</span>
          </button>
        )}
      </div>

      {/* Status pill filter */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        {(["preferred", "all", "no_longer_preferred"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold border transition-colors",
              statusFilter === s
                ? "bg-foreground text-background border-foreground"
                : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {s === "preferred" && (isL ? "Preferidos" : "Preferred")}
            {s === "all"       && (isL ? "Todos" : "All")}
            {s === "no_longer_preferred" && (isL ? "Antiguos" : "Deprecated")}
          </button>
        ))}
      </div>

      {/* Category chips + view toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategoryFilter(c.key)}
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors flex items-center gap-1",
                categoryFilter === c.key
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted",
              )}
            >
              <span>{c.emoji}</span>
              {isL ? c.labelEs : c.label}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="shrink-0 flex items-center rounded-full border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-label={isL ? "Vista cuadrícula" : "Grid view"}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              viewMode === "grid"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid size={13} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            aria-label={isL ? "Vista lista" : "List view"}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
              viewMode === "list"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <List size={13} />
          </button>
        </div>
      </div>

      {/* Grid or list */}
      {loading ? (
        <div className={cn(
          viewMode === "grid"
            ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2"
            : "flex flex-col gap-2",
        )}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl bg-card border border-border animate-pulse",
                viewMode === "grid" ? "aspect-[3/4]" : "h-20",
              )}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasQuery={!!query.trim() || statusFilter !== "all" || categoryFilter !== "all"}
          isL={isL}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2">
          {filtered.map((item) => (
            <LibraryItemCard key={item.id} item={item} onOpen={setSelected} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      <LibraryItemDetailModal
        item={selected}
        onClose={() => setSelected(null)}
        canEdit={canEditLibrary}
      />
    </div>
  );
}

function EmptyState({ hasQuery, isL }: { hasQuery: boolean; isL: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <BookOpen size={40} className="text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">
        {hasQuery
          ? isL ? "No se encontraron artículos." : "No items match your filters."
          : isL ? "Tu biblioteca está vacía." : "Your library is empty."}
      </p>
      <p className="text-xs text-muted-foreground/60 max-w-xs">
        {hasQuery
          ? isL ? "Prueba con otra búsqueda o cambia los filtros." : "Try a different search or change the filters."
          : isL
            ? "Pronto podrás agregar artículos que pides regularmente."
            : "Soon you'll be able to add items you order regularly."}
      </p>
    </div>
  );
}
