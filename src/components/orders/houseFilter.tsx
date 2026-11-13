import { useEffect, useState } from "react";
import { X } from "lucide-react";

/** Orders shown for a house filter; no filter = every order, including ones with no house. */
export function filterOrdersByHouse<T extends { property_id: string | null }>(orders: T[], houseId: string | null): T[] {
  return houseId ? orders.filter(o => o.property_id === houseId) : orders;
}

export function orderCounts<T extends { status: string }>(orders: T[]) {
  const pending = orders.filter(o => o.status !== "delivered");
  return {
    pending,
    delivered: orders.filter(o => o.status === "delivered"),
    notPlaced: pending.filter(o => o.status === "not_placed").length,
  };
}

/**
 * Reads the house chosen elsewhere ONCE on arrival, keeps it as a local
 * visible filter, and clears the global value so it never lingers.
 * Local state is dropped automatically when the person leaves Orders.
 */
export function useArrivalHouseFilter(activePropertyId: string | null, setActivePropertyId: (id: string | null) => void) {
  const [houseId, setHouseId] = useState<string | null>(activePropertyId);
  useEffect(() => {
    if (activePropertyId) {
      setHouseId(activePropertyId);
      setActivePropertyId(null);
    }
  }, [activePropertyId]); // eslint-disable-line react-hooks/exhaustive-deps
  return [houseId, setHouseId] as const;
}

export function HouseFilterChip({ houseName, isES, onClear }: { houseName: string; isES: boolean; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3">
      <span className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 pl-3 pr-1 text-sm text-gold">
        {isES ? `Mostrando ${houseName}` : `Showing ${houseName}`}
        <button aria-label={isES ? "Quitar filtro de casa" : "Clear house filter"} onClick={onClear}
          className="h-11 w-11 -my-2 flex items-center justify-center"><X size={14} /></button>
      </span>
      <button onClick={onClear} className="min-h-11 px-2 text-sm text-muted-foreground underline">
        {isES ? "Todas las casas" : "All houses"}
      </button>
    </div>
  );
}
