import { useState, useEffect, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { useVendors, VENDOR_CATEGORIES, type Vendor, type VendorContact } from "@/hooks/useVendors";
import { useScopedProperties } from "@/hooks/useScopedProperties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Search, Download, ArrowUpDown, ArrowUp, ArrowDown,
  Building2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VendorFormModal } from "@/components/vendors/VendorFormModal";
import { VendorDetailPanel } from "@/components/vendors/VendorDetailPanel";

export function VendorsSection() {
  const { t } = useLanguage();
  const { isMasterAdmin, isAdmin, isManager, canEdit: permCanEdit } = usePermissions();
  const { registerBackHandler } = useNavigation();
  const { properties } = useScopedProperties();
  const canEdit = isMasterAdmin || isAdmin || isManager || permCanEdit("vendors");
  const { vendors, loading, createVendor, updateVendor, deleteVendor, createContact, updateContact, deleteContact } = useVendors();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useLocalStorage<string>("vendors.categoryFilter", "all");
  const [propertyFilter, setPropertyFilter] = useLocalStorage<string>("vendors.propertyFilter", "all");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Register back handler when a vendor detail panel is open
  useEffect(() => {
    if (selectedVendor) {
      registerBackHandler(() => {
        setSelectedVendor(null);
        return true;
      });
    } else {
      registerBackHandler(null);
    }
    return () => { registerBackHandler(null); };
  }, [selectedVendor, registerBackHandler]);

  const filtered = vendors.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      v.name.toLowerCase().includes(q) ||
      v.company?.toLowerCase().includes(q) ||
      v.description?.toLowerCase().includes(q) ||
      v.category.toLowerCase().includes(q);
    const matchCat = categoryFilter === "all" || v.category === categoryFilter;
    const matchProp =
      propertyFilter === "all" ||
      (propertyFilter === "none" ? (v.property_ids ?? []).length === 0 : (v.property_ids ?? []).includes(propertyFilter));
    return matchSearch && matchCat && matchProp;
  });

  const exportCSV = () => {
    const rows: string[] = [];
    rows.push(["Vendor", "Company", "Category", "Phone", "Email", "Website", "Description", "Address", "Contact Name", "Contact Title", "Contact Phone", "Contact Email"].join(","));
    vendors.forEach((v) => {
      if (!v.contacts?.length) {
        rows.push([v.name, v.company ?? "", v.category, v.phone ?? "", v.email ?? "", v.website ?? "", v.description ?? "", v.address ?? "", "", "", "", ""].map((s) => `"${s.replace(/"/g, '""')}"`).join(","));
      } else {
        v.contacts.forEach((c) => {
          rows.push([v.name, v.company ?? "", v.category, v.phone ?? "", v.email ?? "", v.website ?? "", v.description ?? "", v.address ?? "", c.name, c.job_title ?? "", c.phone ?? "", c.email ?? ""].map((s) => `"${s.replace(/"/g, '""')}"`).join(","));
        });
      }
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const usedCategories = Array.from(new Set(vendors.map((v) => v.category)));

  return (
    <div className="animate-fade-in flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Vendors</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{vendors.length} contacts</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={exportCSV} title="Export CSV">
              <Download className="h-4 w-4" />
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setShowAddModal(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
          </div>
        </div>

        {/* Search + Property filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="h-9 w-[160px] flex-shrink-0">
              <SelectValue placeholder="Property" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              <SelectItem value="none">Unlinked</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Category filter pills */}
        {usedCategories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              All
            </button>
            {VENDOR_CATEGORIES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setCategoryFilter(value === categoryFilter ? "all" : value)}
                className={cn(
                  "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  categoryFilter === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sortable table list */}
      <div className="flex-1 overflow-auto px-4 pb-24">
        {loading ? (
          <div className="space-y-2 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No vendors found</p>
            {canEdit && !search && (
              <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4" />
                Add your first vendor
              </Button>
            )}
          </div>
        ) : (
          <VendorTable vendors={filtered} onSelect={setSelectedVendor} properties={properties} />
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingVendor) && (
        <VendorFormModal
          vendor={editingVendor ?? undefined}
          onClose={() => { setShowAddModal(false); setEditingVendor(null); }}
          onSave={async (data) => {
            if (editingVendor) {
              await updateVendor(editingVendor.id, data);
              setEditingVendor(null);
            } else {
              await createVendor(data);
              setShowAddModal(false);
            }
          }}
        />
      )}

      {/* Detail Panel */}
      {selectedVendor && (
        <VendorDetailPanel
          vendor={vendors.find((v) => v.id === selectedVendor.id) ?? selectedVendor}
          canEdit={canEdit}
          onClose={() => setSelectedVendor(null)}
          onEdit={() => { setEditingVendor(selectedVendor); setSelectedVendor(null); }}
          onDelete={async () => { await deleteVendor(selectedVendor.id); setSelectedVendor(null); }}
          onAddContact={createContact}
          onUpdateContact={updateContact}
          onDeleteContact={deleteContact}
        />
      )}
    </div>
  );
}

type SortCol = "name" | "company" | "category" | "description" | "phone" | "properties";

function VendorTable({
  vendors,
  onSelect,
  properties,
}: {
  vendors: Vendor[];
  onSelect: (v: Vendor) => void;
  properties: { id: string; name: string }[];
}) {
  const [sortCol, setSortCol] = useState<SortCol>("company");
  const [sortAsc, setSortAsc] = useState(true);

  const propNameById = useMemo(() => {
    const m = new Map<string, string>();
    properties.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [properties]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const sorted = useMemo(() => {
    const arr = [...vendors];
    const dir = sortAsc ? 1 : -1;
    const propText = (v: Vendor) =>
      (v.property_ids ?? [])
        .map((id) => propNameById.get(id) ?? "")
        .filter(Boolean)
        .sort()
        .join(", ")
        .toLowerCase();
    arr.sort((a, b) => {
      const av = sortCol === "properties" ? propText(a) : (a[sortCol] ?? "").toString().toLowerCase();
      const bv = sortCol === "properties" ? propText(b) : (b[sortCol] ?? "").toString().toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [vendors, sortCol, sortAsc, propNameById]);

  const columns: { key: SortCol; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "category", label: "Category" },
    { key: "properties", label: "Properties" },
    { key: "description", label: "What they do" },
    { key: "phone", label: "Phone" },
  ];

  return (
    <table className="w-full min-w-[820px] text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/30 sticky top-0">
          {columns.map((c) => (
            <th
              key={c.key}
              onClick={() => handleSort(c.key)}
              className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors"
            >
              <span className="inline-flex items-center gap-1">
                {c.label}
                {sortCol === c.key
                  ? (sortAsc ? <ArrowUp size={10} /> : <ArrowDown size={10} />)
                  : <ArrowUpDown size={10} className="opacity-30" />}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((v) => {
          const catLabel = VENDOR_CATEGORIES.find((c) => c.value === v.category)?.label ?? v.category;
          const linkedProps = (v.property_ids ?? [])
            .map((id) => propNameById.get(id))
            .filter(Boolean) as string[];
          return (
            <tr
              key={v.id}
              onClick={() => onSelect(v)}
              className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate max-w-[180px]">{v.name}</span>
                  {!v.is_active && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">Inactive</Badge>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[180px]">{v.company ?? "—"}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <Badge variant="secondary" className="text-[11px] py-0 px-1.5 capitalize">{catLabel}</Badge>
              </td>
              <td className="px-3 py-2.5">
                {linkedProps.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1 max-w-[220px]">
                    {linkedProps.map((name) => (
                      <Badge key={name} variant="outline" className="text-[10px] py-0 px-1.5">{name}</Badge>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                <span className="line-clamp-2 max-w-[280px]">{v.description ?? "—"}</span>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{v.phone ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
