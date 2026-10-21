/**
 * Order list: a checklist made of Order Library items. Staff tick what's
 * needed (qty / comment / photo), then send — the server creates one Order
 * plus a task + notification for each chosen recipient.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ChecklistTemplate } from "@/hooks/useChecklists";
import { filterAssignableStaff } from "@/lib/assignableStaff";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Check, Camera, Send, Settings, Search, Plus, X, Trash2, Loader2, ExternalLink,
} from "lucide-react";

interface LibItem { id: string; name: string; category: string; image_url: string | null; size: string | null; default_quantity: string | null; website_url: string | null; status: string }
interface ListRow { id: string; library_item_id: string; sort_order: number }
interface DraftLine { id: string; library_item_id: string; quantity: string | null; comment: string | null; photo_url: string | null }
interface Person { id: string; full_name: string | null }

interface Props { template: ChecklistTemplate & { order_recipient_ids?: string[] }; propertyName?: string; onClose?: () => void; onSent?: (id: string) => void }

export function OrderListDetailPage({ template, propertyName, onClose, onSent }: Props) {
  const { closeChecklistDetail, registerBackHandler } = useNavigation();
  const close = onClose ?? closeChecklistDetail;
  const { isMasterAdmin, isAdmin, userId } = usePermissions();
  const { language } = useLanguage();
  const es = language === "es";
  const canBuild = isMasterAdmin || isAdmin;

  const [rows, setRows] = useState<ListRow[]>([]);
  const [lib, setLib] = useState<Map<string, LibItem>>(new Map());
  const [draft, setDraft] = useState<Map<string, DraftLine>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [busyItem, setBusyItem] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    registerBackHandler(() => { setEditing(false); return true; });
    return () => registerBackHandler(null);
  }, [editing, registerBackHandler]);

  const load = useCallback(async () => {
    const [{ data: r }, { data: d }] = await Promise.all([
      supabase.from("order_list_items").select("id, library_item_id, sort_order").eq("template_id", template.id).order("sort_order").limit(500),
      supabase.from("order_list_draft_lines").select("id, library_item_id, quantity, comment, photo_url").eq("template_id", template.id).limit(500),
    ]);
    const listRows = (r ?? []) as ListRow[];
    setRows(listRows);
    setDraft(new Map(((d ?? []) as DraftLine[]).map(x => [x.library_item_id, x])));
    const ids = listRows.map(x => x.library_item_id);
    if (ids.length) {
      const { data: li } = await supabase.from("order_library_items")
        .select("id, name, category, image_url, size, default_quantity, website_url, status").in("id", ids).limit(500);
      setLib(new Map(((li ?? []) as LibItem[]).map(x => [x.id, x])));
    } else setLib(new Map());
    setLoading(false);
  }, [template.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel(`order-draft-${template.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_list_draft_lines", filter: `template_id=eq.${template.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [template.id, load]);

  const grouped = useMemo(() => {
    const g = new Map<string, { row: ListRow; item: LibItem }[]>();
    rows.forEach(row => {
      const item = lib.get(row.library_item_id);
      if (!item) return;
      const k = item.category || "Other";
      const entries = g.get(k) ?? [];
      entries.push({ row, item });
      g.set(k, entries);
    });
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, lib]);

  const toggle = async (item: LibItem) => {
    setBusyItem(item.id);
    const existing = draft.get(item.id);
    if (existing) {
      const { error } = await supabase.from("order_list_draft_lines").delete().eq("id", existing.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("order_list_draft_lines").insert({
        template_id: template.id, library_item_id: item.id, quantity: item.default_quantity, updated_by: userId,
      });
      if (error) toast.error(error.message);
    }
    await load();
    setBusyItem(null);
  };

  const saveLine = async (line: DraftLine, patch: Partial<DraftLine>) => {
    const { data, error } = await supabase.from("order_list_draft_lines")
      .update({ ...patch, updated_by: userId }).eq("id", line.id).select("id");
    if (error || !data?.length) { toast.error(error?.message ?? (es ? "No se pudo guardar" : "Could not save")); return; }
    setDraft(prev => new Map(prev).set(line.library_item_id, { ...line, ...patch }));
  };

  const uploadPhoto = async (line: DraftLine, file: File) => {
    if (!userId) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `order-requests/${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("order-library").upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("order-library").getPublicUrl(path);
    await saveLine(line, { photo_url: data.publicUrl });
  };

  const send = async () => {
    if (draft.size === 0) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("order-list-submit", {
      body: { template_id: template.id, note: note.trim() || null },
    });
    setSending(false);
    if (error || data?.error) {
      let msg = data?.error;
      try { msg = msg ?? (await (error as any)?.context?.json())?.error; } catch { /* ignore */ }
      toast.error(msg ?? (es ? "No se pudo enviar" : "Could not send order request"));
      return;
    }
    toast.success(es ? "Pedido enviado" : `Order request sent (${data.count} items)`);
    setNote("");
    await load();
    if (typeof data.order_id === "string") onSent?.(data.order_id);
  };

  const recipients = template.order_recipient_ids ?? [];

  return (
    <div className="animate-fade-in pb-40">
      <div className="bg-charcoal px-4 pt-4 pb-4 border-b border-charcoal-light">
        <Button variant="ghost" onClick={close} className="flex items-center gap-1 text-cream/60 text-sm mb-2 min-h-[44px]">
          <ArrowLeft size={16} /> {es ? "Volver" : "Back"}
        </Button>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl text-cream leading-tight">{template.title}</h1>
            <p className="text-cream/50 text-xs mt-1">
              🛒 {es ? "Lista de pedido" : "Order list"}{propertyName ? ` · ${propertyName}` : ""}
            </p>
          </div>
          {canBuild && (
            <button onClick={() => setEditing(true)} className="min-h-[44px] px-3 rounded-xl border border-gold/40 text-gold text-sm flex items-center gap-1.5">
              <Settings size={14} /> {es ? "Editar" : "Edit list"}
            </button>
          )}
        </div>
        {canBuild && recipients.length === 0 && (
          <p className="text-xs text-[hsl(var(--status-progress))] mt-2">
            {es ? "Elige quién recibe el pedido en Editar." : "Choose who receives the order in Edit list before staff can send."}
          </p>
        )}
      </div>

      <div className="px-4 mt-4 space-y-5">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)
        ) : rows.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            {es ? "Aún no hay artículos." : "No items yet."} {canBuild && (es ? "Pulsa Editar para añadir de la biblioteca." : "Tap Edit list to add items from the library.")}
          </div>
        ) : grouped.map(([cat, entries]) => (
          <div key={cat}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{cat}</p>
            <div className="space-y-2">
              {entries.map(({ item }) => {
                const line = draft.get(item.id);
                const on = !!line;
                return (
                  <div key={item.id} className={cn("bg-card border rounded-xl", on ? "border-gold/60" : "border-border")}>
                    <button
                      onClick={() => toggle(item)}
                      disabled={busyItem === item.id}
                      className="w-full flex items-center gap-3 p-3 text-left min-h-[56px]"
                    >
                      <span className={cn("w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0",
                        on ? "bg-gold border-gold text-charcoal" : "border-border")}>
                        {busyItem === item.id ? <Loader2 size={14} className="animate-spin" /> : on && <Check size={16} />}
                      </span>
                      {item.image_url && <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
                      <span className="flex-1 min-w-0">
                        <span className="block text-base text-foreground leading-snug">{item.name}</span>
                        {(item.size || item.default_quantity) && (
                          <span className="block text-xs text-muted-foreground">{[item.size, item.default_quantity && `${es ? "Cant." : "Qty"} ${item.default_quantity}`].filter(Boolean).join(" · ")}</span>
                        )}
                      </span>
                    </button>
                    {line && <LineEditor line={line} es={es} onSave={p => saveLine(line, p)} onPhoto={f => uploadPhoto(line, f)} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 md:left-64 bg-background/95 backdrop-blur border-t border-border p-3 space-y-2 z-20">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={es ? "Nota general (opcional)" : "Overall note for the manager (optional)"}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-base"
          />
          <button
            onClick={send}
            disabled={sending || draft.size === 0 || recipients.length === 0}
            className="w-full min-h-[48px] rounded-xl bg-gold text-charcoal font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {es ? `Enviar pedido (${draft.size})` : `Send order request (${draft.size})`}
          </button>
        </div>
      )}

      {editing && (
        <OrderListEditor
          template={template}
          currentIds={rows.map(r => r.library_item_id)}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
          onDeleted={close}
        />
      )}
    </div>
  );
}

function LineEditor({ line, es, onSave, onPhoto }: { line: DraftLine; es: boolean; onSave: (p: Partial<DraftLine>) => void; onPhoto: (f: File) => void }) {
  const [qty, setQty] = useState(line.quantity ?? "");
  const [comment, setComment] = useState(line.comment ?? "");
  useEffect(() => { setQty(line.quantity ?? ""); setComment(line.comment ?? ""); }, [line.quantity, line.comment]);
  return (
    <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
      <div className="flex gap-2">
        <input
          value={qty}
          onChange={e => setQty(e.target.value)}
          onBlur={() => qty !== (line.quantity ?? "") && onSave({ quantity: qty || null })}
          placeholder={es ? "Cant." : "Qty"}
          className="w-20 bg-background border border-border rounded-lg px-2 py-2 text-base"
        />
        <input
          value={comment}
          onChange={e => setComment(e.target.value)}
          onBlur={() => comment !== (line.comment ?? "") && onSave({ comment: comment || null })}
          placeholder={es ? "Comentario" : "Comment"}
          className="flex-1 min-w-0 bg-background border border-border rounded-lg px-2 py-2 text-base"
        />
        <label className="w-11 h-11 flex-shrink-0 rounded-lg border border-border flex items-center justify-center cursor-pointer text-muted-foreground">
          <Camera size={16} />
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ""; }} />
        </label>
      </div>
      {line.photo_url && (
        <div className="relative inline-block">
          <img src={line.photo_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
          <button onClick={() => onSave({ photo_url: null })} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-charcoal text-cream flex items-center justify-center">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function OrderListEditor({ template, currentIds, onClose, onSaved, onDeleted }: {
  template: ChecklistTemplate & { order_recipient_ids?: string[] }; currentIds: string[]; onClose: () => void; onSaved: () => void; onDeleted: () => void;
}) {
  const [allLib, setAllLib] = useState<LibItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentIds));
  const [recips, setRecips] = useState<Set<string>>(new Set(template.order_recipient_ids ?? []));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("order_library_items")
      .select("id, name, category, image_url, size, default_quantity, website_url, status")
      .order("name").limit(1000)
      .then(({ data }) => setAllLib((data ?? []) as LibItem[]));
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role")
        .in("role", ["master_admin", "admin", "manager"]).limit(200);
      const ids = Array.from(new Set((roles ?? []).map(r => r.user_id)));
      if (!ids.length) return;
      const { data: profs } = await supabase.from("profiles").select("id, full_name, level").in("id", ids);
      setPeople(filterAssignableStaff((profs ?? []) as any[]).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    })();
  }, []);

  const filtered = allLib.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.category.toLowerCase().includes(q.toLowerCase()));

  const save = async () => {
    setSaving(true);
    const toAdd = [...selected].filter(id => !currentIds.includes(id));
    const toRemove = currentIds.filter(id => !selected.has(id));
    const { data: upd, error: tErr } = await supabase.from("checklist_templates")
      .update({ order_recipient_ids: [...recips] }).eq("id", template.id).select("id");
    if (tErr || !upd?.length) { toast.error(tErr?.message ?? "Could not save recipients"); setSaving(false); return; }
    if (toRemove.length) {
      const { error } = await supabase.from("order_list_items").delete().eq("template_id", template.id).in("library_item_id", toRemove);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    if (toAdd.length) {
      const { error } = await supabase.from("order_list_items").insert(
        toAdd.map((id, i) => ({ template_id: template.id, library_item_id: id, sort_order: currentIds.length + i })));
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    (template as any).order_recipient_ids = [...recips];
    setSaving(false);
    toast.success("List saved");
    onSaved();
  };

  const deleteList = async () => {
    if (!window.confirm(`Delete "${template.title}"? Past orders are kept.`)) return;
    const { data, error } = await supabase.from("checklist_templates").delete().eq("id", template.id).select("id");
    if (error || !data?.length) { toast.error(error?.message ?? "Could not delete"); return; }
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-background w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-display text-lg">Edit order list</h2>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Send orders to</p>
            <div className="flex flex-wrap gap-2">
              {people.map(p => {
                const on = recips.has(p.id);
                return (
                  <button key={p.id}
                    onClick={() => setRecips(prev => { const n = new Set(prev); on ? n.delete(p.id) : n.add(p.id); return n; })}
                    className={cn("px-3 min-h-[40px] rounded-full border text-sm", on ? "bg-gold text-charcoal border-gold" : "border-border text-foreground")}>
                    {on && <Check size={12} className="inline mr-1" />}{p.full_name ?? "Unnamed"}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Items from library ({selected.size} selected)
            </p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search library…"
                className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-base" />
            </div>
            <div className="space-y-1">
              {filtered.map(i => {
                const on = selected.has(i.id);
                return (
                  <button key={i.id}
                    onClick={() => setSelected(prev => { const n = new Set(prev); on ? n.delete(i.id) : n.add(i.id); return n; })}
                    className={cn("w-full flex items-center gap-3 p-2 rounded-lg text-left min-h-[48px]", on ? "bg-gold/10" : "hover:bg-muted")}>
                    <span className={cn("w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0", on ? "bg-gold border-gold text-charcoal" : "border-border")}>
                      {on ? <Check size={14} /> : <Plus size={12} className="text-muted-foreground" />}
                    </span>
                    {i.image_url && <img src={i.image_url} alt="" className="w-8 h-8 rounded object-cover" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-foreground truncate">{i.name}</span>
                      <span className="block text-xs text-muted-foreground">{i.category}{i.size ? ` · ${i.size}` : ""}{i.status === "no_longer_preferred" ? " · no longer preferred" : ""}</span>
                    </span>
                    {i.website_url && <ExternalLink size={12} className="text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-border flex gap-2">
          <button onClick={deleteList} className="w-11 h-11 rounded-xl border border-border text-[hsl(var(--status-urgent))] flex items-center justify-center"><Trash2 size={16} /></button>
          <button onClick={save} disabled={saving} className="flex-1 min-h-[44px] rounded-xl bg-gold text-charcoal font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "Save list"}
          </button>
        </div>
      </div>
    </div>
  );
}
