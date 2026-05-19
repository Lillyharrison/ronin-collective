import { useState, useEffect } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { useVendors, VENDOR_CATEGORIES, type Vendor, type VendorContact } from "@/hooks/useVendors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Download, Phone, Mail, Globe, MapPin,
  ChevronRight, ChevronDown, Pencil, Trash2, UserPlus,
  Building2, X, Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VendorFormModal } from "@/components/vendors/VendorFormModal";
import { VendorDetailPanel } from "@/components/vendors/VendorDetailPanel";

export function VendorsSection() {
  const { t } = useLanguage();
  const { isMasterAdmin, isAdmin, isManager, canEdit: permCanEdit } = usePermissions();
  const { registerBackHandler } = useNavigation();
  const canEdit = isMasterAdmin || isAdmin || isManager || permCanEdit("vendors");
  const { vendors, loading, createVendor, updateVendor, deleteVendor, createContact, updateContact, deleteContact } = useVendors();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useLocalStorage<string>("vendors.categoryFilter", "all");
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
    return matchSearch && matchCat;
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

        {/* Search */}
        <div className="relative">
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
            {usedCategories.map((cat) => {
              const label = VENDOR_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
                  className={cn(
                    "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize",
                    categoryFilter === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-2">
        {loading ? (
          <div className="space-y-2 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
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
          filtered.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              canEdit={canEdit}
              onSelect={() => setSelectedVendor(vendor)}
              onEdit={() => setEditingVendor(vendor)}
              onDelete={() => deleteVendor(vendor.id)}
            />
          ))
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

function VendorCard({
  vendor,
  canEdit,
  onSelect,
  onEdit,
  onDelete,
}: {
  vendor: Vendor;
  canEdit: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const catLabel = VENDOR_CATEGORIES.find((c) => c.value === vendor.category)?.label ?? vendor.category;

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:bg-accent/40 transition-colors group"
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-base">
        {vendor.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">{vendor.name}</span>
          {!vendor.is_active && (
            <Badge variant="outline" className="text-xs py-0 px-1.5 text-muted-foreground">Inactive</Badge>
          )}
        </div>
        {vendor.company && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{vendor.company}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="text-xs py-0 px-1.5 capitalize">{catLabel}</Badge>
          {vendor.contacts && vendor.contacts.length > 0 && (
            <span className="text-xs text-muted-foreground">{vendor.contacts.length} contact{vendor.contacts.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Quick info */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        {vendor.phone && <span className="text-xs text-muted-foreground">{vendor.phone}</span>}
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </button>
  );
}
