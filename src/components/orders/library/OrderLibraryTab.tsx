/**
 * OrderLibraryTab — top-level container for the library grid/list.
 *
 * Mounts list-view by default, includes a legend explaining the status
 * dot and substitution badges, and exposes a category dropdown.
 * Edit/delete handled by LibraryItemFormModal.
 */
import { useMemo, useState } from "react";
import { Search, Plus, BookOpen, LayoutGrid, List, Lock, RefreshCw, CheckSquare, X, Download, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { cn } from "@/lib/utils";
import { useOrderLibrary, type OrderLibraryItem } from "@/hooks/useOrderLibrary";
import { findLibraryMatches } from "@/lib/libraryFuzzyMatch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LibraryItemCard } from "./LibraryItemCard";
import { LibraryItemRow } from "./LibraryItemRow";
import { LibraryListHeader, type LibrarySortKey, type SortDir } from "./LibraryListHeader";
import { LibraryItemDetailModal } from "./LibraryItemDetailModal";
import { LibraryItemFormModal } from "./LibraryItemFormModal";
import { exportLibraryItemsPDF } from "./libraryExportPDF";

const CATEGORIES = [
  { key: "all",      label: "All categories",      labelEs: "Todas las categorías", emoji: "📚" },
  { key: "food",     label: "Food & Drink",        labelEs: "Comida y bebida",  emoji: "🍎" },
  { key: "cleaning", label: "Cleaning",            labelEs: "Limpieza",         emoji: "🧹" },
  { key: "supplies", label: "Supplies",            labelEs: "Suministros",      emoji: "📦" },
  { key: "personal", label: "Personal Care",       labelEs: "Cuidado personal", emoji: "🧴" },
  { key: "laundry",  label: "Laundry",             labelEs: "Lavandería",       emoji: "🧺" },
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
  const [editing, setEditing] = useState<OrderLibraryItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useLocalStorage<"grid" | "list">(
    "order-library-view-mode",
    "list",
  );
  const [sortKey, setSortKey] = useLocalStorage<LibrarySortKey>(
    "order-library-sort-key",
    "name",
  );
  const [sortDir, setSortDir] = useLocalStorage<SortDir>(
    "order-library-sort-dir",
    "asc",
  );

  // Multi-select for PDF export
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleItemClick = (item: OrderLibraryItem) => {
    if (selectionMode) toggleSelected(item.id);
    else setSelected(item);
  };

  const handleSort = (key: LibrarySortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter((i) => i.category === categoryFilter);
    if (query.trim()) {
      const matches = findLibraryMatches(query, list, { minScore: 0.4, limit: 50 });
      list = matches.map((m) => m.item);
    }
    // Sort (only applied to list view; grid view keeps default order)
    if (viewMode === "list") {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        switch (sortKey) {
          case "status":
            return (a.status === b.status ? 0 : a.status === "preferred" ? -1 : 1) * dir;
          case "qty":
            return (a.default_quantity ?? "").localeCompare(b.default_quantity ?? "", undefined, { numeric: true }) * dir;
          case "size":
            return (a.size ?? "").localeCompare(b.size ?? "", undefined, { numeric: true }) * dir;
          case "sub":
            return ((a.substitutions_allowed ? 0 : 1) - (b.substitutions_allowed ? 0 : 1)) * dir;
          case "purchase":
            return (a.purchase ?? "").localeCompare(b.purchase ?? "") * dir;
          case "notes":
            return (a.notes ?? "").localeCompare(b.notes ?? "") * dir;
          case "name":
          default:
            return a.name.localeCompare(b.name) * dir;
        }
      });
    }
    return list;
  }, [items, statusFilter, categoryFilter, query, viewMode, sortKey, sortDir]);

  const handleEditFromDetail = (item: OrderLibraryItem) => {
    setSelected(null);
    setEditing(item);
  };

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
            onClick={() => setCreating(true)}
            className="h-10 px-3 rounded-xl bg-[hsl(var(--gold))] text-charcoal text-xs font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{isL ? "Nuevo" : "New"}</span>
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground/80">
          {isL ? "Clave" : "Key"}:
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {isL ? "Preferido" : "Preferred"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
          {isL ? "Antiguo" : "Deprecated"}
        </span>
        <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400">
          <RefreshCw size={10} />
          {isL ? "Sustitución OK" : "Sub OK"}
        </span>
        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <Lock size={10} />
          {isL ? "Sin sustitución" : "No sub"}
        </span>
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

      {/* Category dropdown + view toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  <span className="inline-flex items-center gap-1.5">
                    <span>{c.emoji}</span>
                    {isL ? c.labelEs : c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
                viewMode === "grid" ? "h-32" : "h-20",
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
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <LibraryListHeader sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <div className="flex flex-col">
            {filtered.map((item) => (
              <LibraryItemRow key={item.id} item={item} onOpen={setSelected} />
            ))}
          </div>
        </div>
      )}

      {/* Detail modal */}
      <LibraryItemDetailModal
        item={selected}
        onClose={() => setSelected(null)}
        onEdit={canEditLibrary ? handleEditFromDetail : undefined}
        canEdit={canEditLibrary}
      />

      {/* Create / edit modal */}
      {canEditLibrary && (
        <LibraryItemFormModal
          open={creating || !!editing}
          item={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
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
