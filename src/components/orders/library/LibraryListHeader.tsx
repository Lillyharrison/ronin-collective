/**
 * LibraryListHeader — sortable column headers for the library list view.
 *
 * Click a header to sort by that column; click again to flip direction.
 * Grid template is shared with LibraryItemRow via LIBRARY_ROW_GRID so the
 * columns align perfectly.
 */
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { LIBRARY_ROW_GRID } from "./LibraryItemRow";

export type LibrarySortKey = "status" | "name" | "qty" | "size" | "sub" | "purchase" | "notes";
export type SortDir = "asc" | "desc";

interface Props {
  sortKey: LibrarySortKey;
  sortDir: SortDir;
  onSort: (key: LibrarySortKey) => void;
}

export function LibraryListHeader({ sortKey, sortDir, onSort }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";

  const col = (key: LibrarySortKey, label: string, align: "left" | "center" = "left") => (
    <button
      type="button"
      onClick={() => onSort(key)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors",
        align === "center" && "justify-center",
      )}
    >
      <span>{label}</span>
      {sortKey === key &&
        (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
    </button>
  );

  return (
    <div
      className={cn(
        "grid items-center gap-2 px-2 py-1.5 border-b border-border bg-muted/40 sticky top-0 z-[1]",
        LIBRARY_ROW_GRID,
      )}
    >
      {col("status", "·", "center")}
      <span /> {/* thumbnail column — no header */}
      {col("name", isL ? "Artículo" : "Item")}
      {col("qty", isL ? "Cant" : "Qty")}
      {col("size", isL ? "Tamaño" : "Size")}
      {col("sub", isL ? "Sust" : "Sub", "center")}
      {col("purchase", isL ? "Compra" : "Purchase")}
      {col("notes", isL ? "Notas" : "Notes")}
      <span /> {/* link column — no header */}
    </div>
  );
}
