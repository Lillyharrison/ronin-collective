import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrderLibrary, type OrderLibraryItem } from "@/hooks/useOrderLibrary";
import { findLibraryMatches } from "@/lib/libraryFuzzyMatch";
import { AddToShoppingListSheet } from "@/components/orders/library/AddToShoppingListSheet";
import { cn } from "@/lib/utils";
import { Plus, Trash2, ShoppingBag, Tag, X, BookOpen, Search, Package, ExternalLink, Check, UserCircle2 } from "lucide-react";

interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  is_checked: boolean;
  notes: string | null;
  quantity: string | null;
  created_at: string;
  created_by: string | null;
  library_item_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

interface ProfileLite { id: string; full_name: string | null; avatar_url: string | null }

const CATEGORIES: { key: string; label: string; labelEs: string; emoji: string; color: string }[] = [
  { key: "food",      label: "Food & Drink",      labelEs: "Comida y bebida",     emoji: "🍎", color: "bg-green-500/10 text-green-700 border-green-500/20" },
  { key: "cleaning",  label: "Cleaning",           labelEs: "Limpieza",            emoji: "🧹", color: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  { key: "supplies",  label: "Supplies",           labelEs: "Suministros",         emoji: "📦", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  { key: "personal",  label: "Personal Care",      labelEs: "Cuidado personal",    emoji: "🧴", color: "bg-pink-500/10 text-pink-700 border-pink-500/20" },
  { key: "laundry",   label: "Laundry",            labelEs: "Lavandería",          emoji: "🧺", color: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20" },
  { key: "tech",      label: "Tech & Electronics", labelEs: "Tecnología",          emoji: "💡", color: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
  { key: "other",     label: "Other",              labelEs: "Otro",                emoji: "🛒", color: "bg-muted text-muted-foreground border-border" },
];


function getCategoryMeta(key: string) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function ShoppingList() {
  const { language } = useLanguage();
  const { userId, isAdmin, isMasterAdmin, isManager } = usePermissions();
  const { items: libraryItems } = useOrderLibrary();
  const isL = language === "es";
  const canDelete = isAdmin || isMasterAdmin || isManager;
  const canApprove = canDelete;

  const [items, setItems]       = useState<ShoppingItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [newName, setNewName]   = useState("");
  const [newCat, setNewCat]     = useState("other");
  const [newQty, setNewQty]     = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [adding, setAdding]     = useState(false);
  const [filterChecked, setFilterChecked] = useState(false);
  const [libQuery, setLibQuery]   = useState("");
  const [libPick, setLibPick]     = useState<OrderLibraryItem | null>(null);
  const [profiles, setProfiles]   = useState<Record<string, ProfileLite>>({});

  const libMatches = useMemo(() => {
    if (!libQuery.trim()) return [];
    return findLibraryMatches(libQuery, libraryItems, { minScore: 0.4, limit: 6 });
  }, [libQuery, libraryItems]);

  const libraryById = useMemo(() => {
    const m: Record<string, OrderLibraryItem> = {};
    for (const it of libraryItems) m[it.id] = it;
    return m;
  }, [libraryItems]);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shopping_list_items")
      .select("id, name, category, is_checked, notes, quantity, created_at, created_by, library_item_id, approved_by, approved_at")
      .order("category", { ascending: true })
      .order("is_checked", { ascending: true })
      .order("created_at", { ascending: true });
    const list = (data as ShoppingItem[]) ?? [];
    setItems(list);
    setLoading(false);

    // Fetch profile names for created_by + approved_by
    const ids = Array.from(new Set(list.flatMap(i => [i.created_by, i.approved_by]).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids);
      const map: Record<string, ProfileLite> = {};
      for (const p of (profs ?? []) as ProfileLite[]) map[p.id] = p;
      setProfiles(map);
    }
  };


  useEffect(() => { fetchItems(); }, []);

  const handleAdd = async () => {
    if (!newName.trim() || !userId) return;
    setAdding(true);
    await supabase.from("shopping_list_items").insert({
      name:       newName.trim(),
      category:   newCat,
      quantity:   newQty.trim() || null,
      notes:      newNotes.trim() || null,
      created_by: userId,
    });
    setNewName("");
    setNewQty("");
    setNewNotes("");
    setNewCat("other");
    setShowAdd(false);
    setAdding(false);
    fetchItems();
  };

  const toggleCheck = async (item: ShoppingItem) => {
    await supabase.from("shopping_list_items").update({ is_checked: !item.is_checked }).eq("id", item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_checked: !i.is_checked } : i));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("shopping_list_items").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const clearChecked = async () => {
    const checkedIds = items.filter(i => i.is_checked).map(i => i.id);
    if (!checkedIds.length) return;
    if (!window.confirm(isL ? `¿Eliminar ${checkedIds.length} elemento(s) marcados?` : `Remove ${checkedIds.length} checked item(s)?`)) return;
    await supabase.from("shopping_list_items").delete().in("id", checkedIds);
    setItems(prev => prev.filter(i => !i.is_checked));
  };

  // Group by category
  const displayed = filterChecked ? items.filter(i => !i.is_checked) : items;
  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: displayed.filter(i => i.category === cat.key),
  })).filter(g => g.items.length > 0);

  const checkedCount = items.filter(i => i.is_checked).length;

  return (
    <>
    <div>
      {/* Sub-header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ShoppingBag size={15} className="text-[hsl(var(--gold))]" />
          <span className="text-sm font-semibold text-foreground">
            {isL ? "Lista de compras" : "Shopping List"}
          </span>
          {items.length > 0 && (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
              {items.length - checkedCount} {isL ? "pendiente" : "pending"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {checkedCount > 0 && canDelete && (
            <button
              onClick={clearChecked}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors underline"
            >
              {isL ? `Limpiar ${checkedCount} marcado(s)` : `Clear ${checkedCount} checked`}
            </button>
          )}
          <button
            onClick={() => setFilterChecked(v => !v)}
            className={cn(
              "text-[10px] px-2.5 py-1 rounded-lg border transition-colors font-medium",
              filterChecked ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"
            )}
          >
            {isL ? "Solo pendiente" : "Hide checked"}
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1 bg-[hsl(var(--gold))] text-charcoal text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
          >
            {showAdd ? <X size={12} /> : <Plus size={12} />}
            {showAdd ? (isL ? "Cancelar" : "Cancel") : (isL ? "Añadir" : "Add")}
          </button>
        </div>
      </div>

      {/* Library search */}
      <div className="px-4 py-3 border-b border-border bg-muted/20">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <BookOpen size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--gold))]" />
          <input
            type="search"
            value={libQuery}
            onChange={(e) => setLibQuery(e.target.value)}
            placeholder={isL ? "Buscar en la biblioteca…" : "Search the library to add…"}
            className="w-full h-10 pl-9 pr-9 text-base sm:text-sm rounded-xl border border-border bg-background placeholder:text-muted-foreground/60 outline-none focus:border-primary"
          />
        </div>
        {libMatches.length > 0 && (
          <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            {libMatches.map(({ item }) => (
              <button
                key={item.id}
                onClick={() => { setLibPick(item); setLibQuery(""); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/40 transition-colors"
              >
                <div className="h-8 w-8 shrink-0 rounded-md border border-border bg-muted/30 overflow-hidden p-0.5">
                  {item.image_url
                    ? <img src={item.image_url} alt="" className="h-full w-full object-contain" />
                    : <div className="flex h-full w-full items-center justify-center"><Package size={12} className="text-muted-foreground/40" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  {item.default_quantity && (
                    <p className="text-[10px] text-muted-foreground truncate">{item.default_quantity}{item.size ? ` · ${item.size}` : ""}</p>
                  )}
                </div>
                <Plus size={14} className="text-[hsl(var(--gold))] flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>


      {/* Add item form */}
      {showAdd && (
        <div className="px-4 py-3 bg-[hsl(var(--gold)/0.05)] border-b border-[hsl(var(--gold)/0.15)] space-y-2.5">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              placeholder={isL ? "Nombre del artículo…" : "Item name…"}
              className="flex-1 text-sm bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
            />
            <input
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              placeholder={isL ? "Cant." : "Qty."}
              className="w-20 text-sm bg-muted border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setNewCat(cat.key)}
                className={cn(
                  "flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
                  newCat === cat.key ? cat.color : "bg-muted text-muted-foreground border-border"
                )}
              >
                {cat.emoji} {isL ? cat.labelEs : cat.label}
              </button>
            ))}
          </div>
          <input
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            placeholder={isL ? "Notas (opcional)…" : "Notes (optional)…"}
            className="w-full text-xs bg-muted border border-border rounded-xl px-3 py-2 outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="w-full py-2.5 rounded-xl bg-[hsl(var(--gold))] text-charcoal text-sm font-semibold active:scale-95 transition-transform disabled:opacity-60"
          >
            {adding ? "…" : (isL ? "Añadir a la lista" : "Add to list")}
          </button>
        </div>
      )}

      {/* List grouped by category */}
      <div className="px-4 pt-3 pb-6 space-y-4">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-10 rounded-xl bg-card border border-border animate-pulse" />)
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <ShoppingBag size={32} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground text-center">
              {filterChecked
                ? (isL ? "¡Todo listo!" : "All done!")
                : (isL ? "La lista de compras está vacía" : "Shopping list is empty")}
            </p>
            <p className="text-xs text-muted-foreground/60 text-center">
              {isL ? "Añade artículos arriba o pídele a Ronin que los agregue" : "Add items above or ask Ronin to add them"}
            </p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.key}>
              {/* Category header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", group.color)}>
                  {group.emoji} {isL ? group.labelEs : group.label}
                </span>
                <span className="text-[10px] text-muted-foreground">({group.items.length})</span>
              </div>
              {/* Items */}
              <div className="space-y-1.5">
                {group.items.map(item => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all",
                      item.is_checked
                        ? "bg-muted/30 border-border opacity-50"
                        : "bg-card border-border hover:border-[hsl(var(--gold)/0.3)]"
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleCheck(item)}
                      className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                        item.is_checked
                          ? "bg-[hsl(var(--status-done))] border-[hsl(var(--status-done))]"
                          : "border-border hover:border-[hsl(var(--gold))]"
                      )}
                    >
                      {item.is_checked && <X size={10} className="text-white" strokeWidth={3} />}
                    </button>

                    {/* Name + details */}
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "text-sm font-medium",
                        item.is_checked ? "line-through text-muted-foreground" : "text-foreground"
                      )}>
                        {item.name}
                      </span>
                      {(item.quantity || item.notes) && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.quantity && <span className="font-medium">{item.quantity}</span>}
                          {item.quantity && item.notes && " · "}
                          {item.notes}
                        </p>
                      )}
                    </div>

                    {/* Delete */}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    {libPick && (
      <AddToShoppingListSheet
        item={libPick}
        open={!!libPick}
        onClose={() => setLibPick(null)}
        onAdded={fetchItems}
      />
    )}
    </>
  );
}
