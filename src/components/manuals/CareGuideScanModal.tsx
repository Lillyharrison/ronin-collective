import { useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Loader2, Upload, X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Box { x: number; y: number; w: number; h: number }
interface Draft { title: string; fabric_code: string; composition: string; daily_care: string[]; care_rules: string[]; specs_line: string; swatch_box: Box }

const toBase64 = (file: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = rej;
  r.readAsDataURL(file);
});

async function cropSwatch(file: File, b: Box): Promise<Blob | null> {
  if (!file.type.startsWith("image/") || b.w <= 0.02 || b.h <= 0.02) return null;
  const img = await createImageBitmap(file);
  // Inset slightly so the swatch edge/border isn't included.
  const inset = 0.03;
  const sx = (b.x + b.w * inset) * img.width, sy = (b.y + b.h * inset) * img.height;
  const sw = b.w * (1 - 2 * inset) * img.width, sh = b.h * (1 - 2 * inset) * img.height;
  if (sw < 10 || sh < 10) return null;
  const c = document.createElement("canvas");
  c.width = Math.round(sw); c.height = Math.round(sh);
  c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
}

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input value={v} onChange={e => onChange(items.map((x, j) => j === i ? e.target.value : x))} className="text-base" />
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Remove line" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={16} /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}><Plus size={14} className="mr-1" />Add line</Button>
    </div>
  );
}

export function CareGuideScanModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const swatchRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [swatch, setSwatch] = useState<Blob | null>(null);
  const swatchUrl = swatch ? URL.createObjectURL(swatch) : null;

  const reset = () => { setFile(null); setDraft(null); setSwatch(null); };

  const read = async (f: File) => {
    setFile(f); setDraft(null); setSwatch(null); setReading(true);
    try {
      const fileBase64 = await toBase64(f);
      const { data, error } = await supabase.functions.invoke("extract-care-guide", { body: { fileBase64, mimeType: f.type, fileName: f.name } });
      if (error) {
        const msg = error instanceof FunctionsHttpError ? (await error.context.json().catch(() => null))?.error : error.message;
        toast.error(msg ?? "Couldn't read this sheet");
        return;
      }
      const d = data as Draft;
      setDraft({ ...d, daily_care: d.daily_care ?? [], care_rules: d.care_rules ?? [] });
      setSwatch(await cropSwatch(f, d.swatch_box));
    } finally { setReading(false); }
  };

  const save = async () => {
    if (!draft?.title.trim()) { toast.error("Add a title"); return; }
    setSaving(true);
    try {
      const icon = "🧵";
      const card_images: { url: string; side: "front" }[] = [];
      if (swatch) {
        const path = `swatches/${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("manuals").upload(path, swatch, { contentType: "image/jpeg" });
        if (!error) card_images.push({ url: supabase.storage.from("manuals").getPublicUrl(path).data.publicUrl, side: "front" });
      }
      const titleFull = draft.fabric_code ? `${draft.title.trim()} — ${draft.fabric_code.trim()}` : draft.title.trim();
      const { data: tpl, error } = await supabase.from("checklist_templates").insert({
        title: titleFull, category: "care_guide", icon, color: "gold", is_universal: true, is_published: false, card_images,
      }).select("id").single();
      if (error || !tpl) { toast.error("Care guide was not saved"); return; }
      let order = 0;
      const rows = [
        ...(draft.composition ? [{ title: `Composition: ${draft.composition}`, color: "basic", container: "Fabric" }] : []),
        ...draft.daily_care.filter(s => s.trim()).map(s => ({ title: s.trim(), color: "basic", container: null as string | null })),
        ...draft.care_rules.filter(s => s.trim()).map(s => ({ title: s.trim(), color: "deep", container: "Care symbols" })),
        ...(draft.specs_line.trim() ? [{ title: draft.specs_line.trim(), color: "deep", container: "Ratings" }] : []),
      ].map(r => ({ ...r, template_id: tpl.id, icon: "▸", is_required: false, sort_order: order++ }));
      if (rows.length) {
        const { error: itemsErr } = await supabase.from("checklist_items").insert(rows);
        if (itemsErr) { toast.error("Guide created but some lines failed to save"); }
      }
      toast.success("Draft care guide created — add the item photo for the back");
      reset(); onOpenChange(false); onCreated(tpl.id);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Scan manufacturer sheet</DialogTitle>
          <DialogDescription>Upload a fabric or spec sheet and we'll draft the care guide for you to check.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 text-base">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={reading}
            className="w-full h-28 rounded-xl border-2 border-dashed border-border hover:border-gold/40 bg-muted/30 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {reading ? <><Loader2 className="animate-spin" /><span>Reading the sheet…</span></>
              : <><Upload size={22} /><span>{file ? `Replace (${file.name})` : "Tap to upload sheet (image or PDF)"}</span></>}
          </button>

          {draft && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fabric swatch (front of card)</p>
                <div className="flex items-center gap-3">
                  {swatchUrl ? <img src={swatchUrl} alt="Fabric swatch" className="w-20 h-20 rounded-lg object-cover border border-border" />
                    : <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center text-2xl">🧵</div>}
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => swatchRef.current?.click()}>{swatchUrl ? "Use a different swatch" : "Add swatch image"}</Button>
                    {swatchUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setSwatch(null)}><X size={14} className="mr-1" />No swatch</Button>}
                  </div>
                </div>
                {!swatchUrl && file?.type === "application/pdf" && <p className="text-sm text-muted-foreground">Swatches can't be cut from PDFs automatically — add a screenshot of it instead.</p>}
                <input ref={swatchRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setSwatch(f); }} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</p>
                <Input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className="text-base" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fabric code</p>
                  <Input value={draft.fabric_code} onChange={e => setDraft({ ...draft, fabric_code: e.target.value })} className="text-base" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Composition</p>
                  <Input value={draft.composition} onChange={e => setDraft({ ...draft, composition: e.target.value })} className="text-base" />
                </div>
              </div>
              <ListEditor label="Daily care (Basic column)" items={draft.daily_care} onChange={v => setDraft({ ...draft, daily_care: v })} />
              <ListEditor label="Care symbols (Deep column)" items={draft.care_rules} onChange={v => setDraft({ ...draft, care_rules: v })} />
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ratings line</p>
                <Input value={draft.specs_line} onChange={e => setDraft({ ...draft, specs_line: e.target.value })} className="text-base" />
              </div>
            </>
          )}
        </div>
        <div className="shrink-0 flex gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1" disabled={!draft || saving} onClick={save}>{saving ? "Saving…" : "Create care guide"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
