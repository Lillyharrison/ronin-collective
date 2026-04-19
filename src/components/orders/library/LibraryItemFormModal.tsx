/**
 * LibraryItemFormModal — create or edit an Order Library item.
 *
 * Used by OrderLibraryTab for both "New" and "Edit" flows. Includes
 * a destructive Delete action when editing an existing item.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Upload, Loader2, Package } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  useOrderLibrary,
  type OrderLibraryItem,
  type LibraryStatus,
} from "@/hooks/useOrderLibrary";

interface Props {
  open: boolean;
  item: OrderLibraryItem | null; // null = create mode
  onClose: () => void;
}

const CATEGORY_OPTIONS = [
  { key: "food",     label: "Food & Drink",       labelEs: "Comida y bebida" },
  { key: "cleaning", label: "Cleaning",           labelEs: "Limpieza" },
  { key: "supplies", label: "Supplies",           labelEs: "Suministros" },
  { key: "personal", label: "Personal Care",      labelEs: "Cuidado personal" },
  { key: "laundry",  label: "Laundry",            labelEs: "Lavandería" },
  { key: "tech",     label: "Tech & Electronics", labelEs: "Tecnología" },
  { key: "other",    label: "Other",              labelEs: "Otro" },
];

export function LibraryItemFormModal({ open, item, onClose }: Props) {
  const { language } = useLanguage();
  const isL = language === "es";
  const { createItem, updateItem, deleteItem, uploadImage } = useOrderLibrary();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("supplies");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [defaultQty, setDefaultQty] = useState("");
  const [status, setStatus] = useState<LibraryStatus>("preferred");
  const [subAllowed, setSubAllowed] = useState(false);
  const [aliases, setAliases] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Hydrate when item changes
  useEffect(() => {
    if (item) {
      setName(item.name);
      setCategory(item.category);
      setImageUrl(item.image_url);
      setWebsiteUrl(item.website_url ?? "");
      setNotes(item.notes ?? "");
      setDefaultQty(item.default_quantity ?? "");
      setStatus(item.status);
      setSubAllowed(item.substitutions_allowed);
      setAliases((item.search_aliases ?? []).join(", "));
    } else {
      setName("");
      setCategory("supplies");
      setImageUrl(null);
      setWebsiteUrl("");
      setNotes("");
      setDefaultQty("");
      setStatus("preferred");
      setSubAllowed(false);
      setAliases("");
    }
  }, [item, open]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const url = await uploadImage(file);
    if (url) setImageUrl(url);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const aliasArr = aliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const payload = {
      name: name.trim(),
      category,
      image_url: imageUrl,
      website_url: websiteUrl.trim() || null,
      notes: notes.trim() || null,
      default_quantity: defaultQty.trim() || null,
      status,
      substitutions_allowed: subAllowed,
      search_aliases: aliasArr,
    };
    const result = item
      ? await updateItem(item.id, payload)
      : await createItem(payload);
    setSaving(false);
    if (result) onClose();
  };

  const handleDelete = async () => {
    if (!item) return;
    setSaving(true);
    const ok = await deleteItem(item.id);
    setSaving(false);
    if (ok) {
      setConfirmDelete(false);
      onClose();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {item
                ? isL ? "Editar artículo" : "Edit library item"
                : isL ? "Nuevo artículo" : "New library item"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 pt-1 pr-1">
            {/* Image */}
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30 p-1">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package size={24} className="text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">{isL ? "Imagen" : "Image"}</Label>
                <div className="flex gap-2">
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-accent">
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    {isL ? "Subir" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                    />
                  </label>
                  {imageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setImageUrl(null)}
                      className="h-8 px-2 text-xs"
                    >
                      {isL ? "Quitar" : "Remove"}
                    </Button>
                  )}
                </div>
                <Input
                  placeholder={isL ? "o pega URL de imagen" : "or paste image URL"}
                  value={imageUrl ?? ""}
                  onChange={(e) => setImageUrl(e.target.value || null)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">{isL ? "Nombre" : "Name"}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{isL ? "Categoría" : "Category"}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {isL ? c.labelEs : c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{isL ? "Estado" : "Status"}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as LibraryStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preferred">
                      {isL ? "Preferido" : "Preferred"}
                    </SelectItem>
                    <SelectItem value="no_longer_preferred">
                      {isL ? "Ya no preferido" : "No longer preferred"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">{isL ? "Cantidad estándar" : "Default quantity"}</Label>
              <Input
                value={defaultQty}
                onChange={(e) => setDefaultQty(e.target.value)}
                placeholder={isL ? "p. ej. 4" : "e.g. 4"}
              />
            </div>

            <div>
              <Label className="text-xs">{isL ? "Enlace" : "Website / link"}</Label>
              <Input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div>
              <Label className="text-xs">{isL ? "Notas" : "Notes"}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </div>

            <div>
              <Label className="text-xs">
                {isL ? "Alias (separados por coma)" : "Aliases (comma separated)"}
              </Label>
              <Input
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                placeholder={isL ? "p. ej. TP, papel higiénico" : "e.g. TP, toilet paper"}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">
                  {isL ? "Permitir sustituciones" : "Allow substitutions"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isL
                    ? "Si una marca no está disponible, se puede sustituir."
                    : "If brand is unavailable, a substitute may be used."}
                </p>
              </div>
              <Switch checked={subAllowed} onCheckedChange={setSubAllowed} />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:gap-2 pt-3 border-t">
            {item ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={14} className="mr-1.5" />
                {isL ? "Eliminar" : "Delete"}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                {isL ? "Cancelar" : "Cancel"}
              </Button>
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {isL ? "Guardar" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isL ? "¿Eliminar artículo?" : "Delete this item?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isL
                ? "Esta acción no se puede deshacer."
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isL ? "Cancelar" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isL ? "Eliminar" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
