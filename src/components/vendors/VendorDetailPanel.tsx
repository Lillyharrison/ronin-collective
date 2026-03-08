import { useState } from "react";
import { type Vendor, type VendorContact, VENDOR_CATEGORIES } from "@/hooks/useVendors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  X, Phone, Mail, Globe, MapPin, Pencil, Trash2,
  UserPlus, ChevronLeft, ExternalLink, Copy, Check,
  Building2, Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VendorDetailPanelProps {
  vendor: Vendor;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onAddContact: (data: Omit<VendorContact, "id" | "created_at">) => Promise<boolean>;
  onUpdateContact: (id: string, data: Partial<VendorContact>) => Promise<boolean>;
  onDeleteContact: (id: string) => Promise<boolean>;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
}

export function VendorDetailPanel({
  vendor,
  canEdit,
  onClose,
  onEdit,
  onDelete,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
}: VendorDetailPanelProps) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContact, setEditingContact] = useState<VendorContact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const catLabel = VENDOR_CATEGORIES.find((c) => c.value === vendor.category)?.label ?? vendor.category;

  const handleDelete = async () => {
    if (!confirm(`Delete ${vendor.name}? This will remove all associated contacts.`)) return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">{vendor.name}</h2>
            {vendor.company && <p className="text-xs text-muted-foreground truncate">{vendor.company}</p>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-1">
              <button onClick={onEdit} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={handleDelete} disabled={deleting} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero row */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                {vendor.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="capitalize">{catLabel}</Badge>
                  {!vendor.is_active && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                </div>
                {vendor.description && (
                  <p className="text-sm text-muted-foreground">{vendor.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contact rows */}
          {(vendor.phone || vendor.email || vendor.website || vendor.address) && (
            <div className="px-5 space-y-2 pb-4">
              {vendor.phone && (
                <ContactRow icon={<Phone className="h-4 w-4" />} value={vendor.phone} href={`tel:${vendor.phone}`} />
              )}
              {vendor.email && (
                <ContactRow icon={<Mail className="h-4 w-4" />} value={vendor.email} href={`mailto:${vendor.email}`} />
              )}
              {vendor.website && (
                <ContactRow icon={<Globe className="h-4 w-4" />} value={vendor.website} href={vendor.website} external />
              )}
              {vendor.address && (
                <ContactRow icon={<MapPin className="h-4 w-4" />} value={vendor.address} />
              )}
            </div>
          )}

          {vendor.notes && (
            <div className="px-5 pb-4">
              <p className="text-xs text-muted-foreground bg-muted rounded-xl p-3">{vendor.notes}</p>
            </div>
          )}

          <Separator />

          {/* Sub-contacts */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Contacts</h3>
              {canEdit && !showAddContact && (
                <button
                  onClick={() => { setShowAddContact(true); setEditingContact(null); }}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add contact
                </button>
              )}
            </div>

            {/* Inline add/edit contact form */}
            {(showAddContact || editingContact) && (
              <ContactForm
                initial={editingContact ?? undefined}
                vendorId={vendor.id}
                onSave={async (data) => {
                  if (editingContact) {
                    await onUpdateContact(editingContact.id, data);
                    setEditingContact(null);
                  } else {
                    await onAddContact({ ...data, vendor_id: vendor.id });
                    setShowAddContact(false);
                  }
                }}
                onCancel={() => { setShowAddContact(false); setEditingContact(null); }}
              />
            )}

            {/* Contact list */}
            {vendor.contacts?.length === 0 && !showAddContact ? (
              <p className="text-xs text-muted-foreground text-center py-4">No contacts yet</p>
            ) : (
              vendor.contacts?.map((c) => (
                editingContact?.id === c.id ? null : (
                  <div key={c.id} className="flex items-start gap-3 bg-muted/40 rounded-xl p-3">
                    <div className="relative flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xs font-semibold">
                      {c.name.charAt(0).toUpperCase()}
                      {c.is_primary && <Star className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 fill-primary text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium">{c.name}</span>
                        {c.is_primary && <Star className="h-3 w-3 fill-primary text-primary" />}
                      </div>
                      {c.job_title && <p className="text-xs text-muted-foreground">{c.job_title}</p>}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                            <Phone className="h-3 w-3" />{c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                            <Mail className="h-3 w-3" />{c.email}
                          </a>
                        )}
                      </div>
                      {c.notes && <p className="text-xs text-muted-foreground mt-1 italic">{c.notes}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex-shrink-0 flex gap-1">
                        <button onClick={() => { setEditingContact(c); setShowAddContact(false); }} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => onDeleteContact(c.id)} className="p-1 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              ))
            )}
          </div>

          <div className="pb-6" />
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon, value, href, external }: { icon: React.ReactNode; value: string; href?: string; external?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-shrink-0 text-muted-foreground">{icon}</span>
      {href ? (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className="text-sm text-primary hover:underline flex-1 min-w-0 truncate flex items-center gap-1"
        >
          {value}
          {external && <ExternalLink className="h-3 w-3 flex-shrink-0" />}
        </a>
      ) : (
        <span className="text-sm text-foreground flex-1 min-w-0 truncate">{value}</span>
      )}
      <button onClick={() => copyToClipboard(value)} className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors">
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ContactForm({
  initial,
  vendorId,
  onSave,
  onCancel,
}: {
  initial?: Partial<VendorContact>;
  vendorId: string;
  onSave: (data: Omit<VendorContact, "id" | "created_at" | "vendor_id">) => Promise<void>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    job_title: initial?.job_title ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    notes: initial?.notes ?? "",
    is_primary: initial?.is_primary ?? false,
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        job_title: form.job_title.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        is_primary: form.is_primary,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3 space-y-3">
      <p className="text-xs font-semibold text-foreground">{initial?.id ? "Edit contact" : "New contact"}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Name *</Label>
          <Input className="h-8 text-sm" placeholder="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Job title</Label>
          <Input className="h-8 text-sm" placeholder="e.g. Site Manager" value={form.job_title} onChange={(e) => set("job_title", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <Input className="h-8 text-sm" placeholder="+1 555 000" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Email</Label>
          <Input className="h-8 text-sm" type="email" placeholder="email@..." value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => set("is_primary", e.target.checked)} className="rounded" />
          Primary contact
        </label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
