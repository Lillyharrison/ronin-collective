import { useState } from "react";
import { VENDOR_CATEGORIES, type Vendor } from "@/hooks/useVendors";
import { useScopedProperties } from "@/hooks/useScopedProperties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface VendorFormModalProps {
  vendor?: Vendor;
  onClose: () => void;
  onSave: (data: Omit<Vendor, "id" | "created_at" | "updated_at" | "contacts">) => Promise<void>;
}

export function VendorFormModal({ vendor, onClose, onSave }: VendorFormModalProps) {
  const isEdit = !!vendor;
  const { properties } = useScopedProperties();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: vendor?.name ?? "",
    company: vendor?.company ?? "",
    email: vendor?.email ?? "",
    phone: vendor?.phone ?? "",
    website: vendor?.website ?? "",
    category: vendor?.category ?? "general",
    description: vendor?.description ?? "",
    notes: vendor?.notes ?? "",
    address: vendor?.address ?? "",
    is_active: vendor?.is_active ?? true,
    logo_url: vendor?.logo_url ?? "",
    created_by: vendor?.created_by ?? null,
    property_ids: vendor?.property_ids ?? [],
  });

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const togglePropertyId = (id: string) => {
    setForm((f) => ({
      ...f,
      property_ids: f.property_ids.includes(id)
        ? f.property_ids.filter((p) => p !== id)
        : [...f.property_ids, id],
    }));
  };

  const handleSave = async () => {
    if (!form.company.trim()) return;
    setSaving(true);
    try {
      const company = form.company.trim();
      const name = form.name.trim() || company; // satisfy legacy NOT NULL on name
      await onSave({
        ...form,
        name,
        company,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        address: form.address.trim() || null,
        logo_url: form.logo_url.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold">{isEdit ? "Edit Vendor" : "Add Vendor"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Company <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Smith Landscaping" value={form.company} onChange={(e) => set("company", e.target.value)} />
              <p className="text-xs text-muted-foreground">This is the main identifier — individual technicians can be added as contacts below.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Primary Contact Name</Label>
              <Input placeholder="Optional — e.g. John Smith" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENDOR_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="+1 (555) 000-0000" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="name@company.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Website</Label>
              <Input placeholder="https://..." value={form.website} onChange={(e) => set("website", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>What they do for us</Label>
              <Textarea
                placeholder="Brief description of services..."
                className="resize-none"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input placeholder="Street, City, State" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Linked Properties</Label>
              <p className="text-xs text-muted-foreground">Select the properties this vendor services.</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {properties.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">No properties available</span>
                )}
                {properties.map((p) => {
                  const selected = form.property_ids.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePropertyId(p.id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border hover:bg-accent"
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Internal notes..."
                className="resize-none"
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
            {isEdit && (
              <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Show in vendor lists</p>
                </div>
                <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-border bg-background">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Vendor"}
          </Button>
        </div>
      </div>
    </div>
  );
}
