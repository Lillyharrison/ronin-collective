import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fireConfetti } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import { Check, Send, CheckCircle2, X, Globe } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEntryTranslation, useBatchTranslation } from "@/hooks/useEntryTranslation";

interface Template {
  id: string;
  title: string;
  icon: string;
  color: string;
  sections: string[] | null;
}
interface Item {
  id: string;
  title: string;
  icon: string;
  color: string;
  section: string | null;
  is_required: boolean;
  sort_order: number;
  photo_url: string | null;
  notes: string | null;
}
interface Session {
  id: string;
  template_id: string;
  property_id: string | null;
  assignee_name: string | null;
  checked_item_ids: string[];
  notes: string | null;
  status: "in_progress" | "submitted";
  submitted_at: string | null;
}

export default function SharedChecklist() {
  const { token } = useParams<{ token: string }>();
  const { language, setLanguage, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<Template | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const { data: sess, error: sErr } = await supabase
        .from("checklist_public_sessions")
        .select("*")
        .eq("share_token", token)
        .maybeSingle();
      if (sErr || !sess) {
        setError(t("invalidShareLink"));
        setLoading(false);
        return;
      }
      const { data: tpl } = await supabase
        .from("checklist_templates")
        .select("id, title, icon, color, sections")
        .eq("id", sess.template_id)
        .maybeSingle();
      const { data: its } = await supabase
        .from("checklist_items")
        .select("id, title, icon, color, section, is_required, sort_order, photo_url, notes")
        .eq("template_id", sess.template_id)
        .order("sort_order");
      if (sess.property_id) {
        const { data: prop } = await supabase
          .from("properties")
          .select("name")
          .eq("id", sess.property_id)
          .maybeSingle();
        setPropertyName(prop?.name ?? null);
      }
      setSession(sess as Session);
      setTemplate((tpl as Template) ?? null);
      setItems((its as Item[]) ?? []);
      setName(sess.assignee_name ?? "");
      setNotes(sess.notes ?? "");
      setLoading(false);
    })();
  }, [token]);

  const checkedSet = useMemo(
    () => new Set(session?.checked_item_ids ?? []),
    [session?.checked_item_ids]
  );

  const isSubmitted = session?.status === "submitted";

  // Persist a state change to DB (debounce-free; called on each toggle/blur)
  const persist = async (next: Partial<Session>) => {
    if (!session || isSubmitted) return;
    const merged = { ...session, ...next };
    setSession(merged);
    await supabase
      .from("checklist_public_sessions")
      .update({
        checked_item_ids: merged.checked_item_ids,
        assignee_name: merged.assignee_name,
        notes: merged.notes,
      })
      .eq("id", session.id);
  };

  const toggleItem = (id: string) => {
    if (!session || isSubmitted) return;
    const set = new Set(session.checked_item_ids);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    persist({ checked_item_ids: Array.from(set) });
  };

  const submit = async () => {
    if (!session) return;
    if (!name.trim()) {
      toast.error(t("pleaseAddName"));
      return;
    }
    setSubmitting(true);
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/checklist-public-submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          share_token: token,
          assignee_name: name.trim(),
          notes: notes.trim() || null,
          checked_item_ids: session.checked_item_ids,
        }),
      }
    );
    setSubmitting(false);
    if (!res.ok) {
      const txt = await res.text();
      toast.error(t("submissionFailed") + ": " + txt);
      return;
    }
    setSession({ ...session, status: "submitted", submitted_at: new Date().toISOString(), assignee_name: name.trim(), notes });
    fireConfetti();
  };

  // Group items by section
  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const key = it.section ?? "__ungrouped__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    // Order by template.sections then any extras
    const ordered: { name: string | null; items: Item[] }[] = [];
    const declared = template?.sections ?? [];
    for (const s of declared) {
      if (map.has(s)) {
        ordered.push({ name: s, items: map.get(s)! });
        map.delete(s);
      }
    }
    // Remaining (custom/extra sections then ungrouped last)
    for (const [k, v] of map.entries()) {
      if (k === "__ungrouped__") continue;
      ordered.push({ name: k, items: v });
    }
    if (map.has("__ungrouped__")) {
      ordered.push({ name: null, items: map.get("__ungrouped__")! });
    }
    return ordered;
  }, [items, template?.sections]);

  // Translate display strings (hooks must run unconditionally, before any return)
  const { translated: tplTitleArr } = useEntryTranslation(language, [template?.title ?? ""]);
  const displayTplTitle = tplTitleArr[0] || template?.title || "";
  const { items: translatedItems } = useBatchTranslation(language, items, ["title", "notes"]);
  const translatedById = useMemo(() => {
    const m = new Map<string, Item>();
    translatedItems.forEach(it => m.set(it.id, it));
    return m;
  }, [translatedItems]);


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[hsl(var(--gold))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error || !template || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">{error ?? t("checklistNotFound")}</p>
      </div>
    );
  }

  const total = items.length;
  const done = items.filter((i) => checkedSet.has(i.id)).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-[hsl(var(--status-done)/0.15)] flex items-center justify-center mb-4">
            <CheckCircle2 size={32} className="text-[hsl(var(--status-done))]" />
          </div>
          <h1 className="text-xl font-display text-foreground mb-2">{t("submittedThankYou")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("submittedThankYouBody")}
          </p>
          {session.assignee_name && (
            <p className="text-xs text-muted-foreground mt-3">{t("submittedBy")} {session.assignee_name}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-charcoal border-b border-charcoal-light px-5 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{template.icon}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-cream text-base font-semibold leading-tight truncate">{displayTplTitle}</h1>
              {propertyName && <p className="text-cream/50 text-xs truncate">{propertyName}</p>}
            </div>
            <button
              type="button"
              onClick={() => setLanguage(language === "es" ? "en" : "es")}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider text-cream/70 hover:text-cream hover:bg-charcoal-light transition-colors border border-charcoal-light"
              aria-label="Toggle language"
            >
              <Globe size={12} />
              {language === "es" ? "EN" : "ES"}
            </button>
            <span className="text-xs text-cream/60 font-mono whitespace-nowrap">{done}/{total}</span>
          </div>
          <div className="mt-3 h-1.5 bg-charcoal-light rounded-full overflow-hidden">
            <div className="h-full bg-[hsl(var(--gold))] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 pb-32">
        {/* Name input */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("yourName")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => persist({ assignee_name: name.trim() })}
            placeholder={t("yourNamePlaceholder")}
            className="w-full mt-2 text-base bg-background border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[hsl(var(--gold))]"
          />
        </div>

        {/* Items grouped by section */}
        <div className="space-y-5">
          {grouped.map((group, gi) => (
            <div key={gi}>
              {group.name && (
                <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--gold))] mb-2 px-1">{group.name}</p>
              )}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {group.items.map((item, idx) => {
                  const checked = checkedSet.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "w-full flex items-start gap-3 px-4 py-3 transition-all",
                        idx > 0 && "border-t border-border",
                        checked && "opacity-60"
                      )}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleItem(item.id)}
                        className={cn(
                          "w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-5 transition-all",
                          checked
                            ? "bg-[hsl(var(--status-done))] border-[hsl(var(--status-done))]"
                            : "border-border"
                        )}
                        aria-label={checked ? "Mark incomplete" : "Mark complete"}
                      >
                        {checked && <Check size={14} className="text-white" strokeWidth={3} />}
                      </button>

                      {/* Tile (image or icon, always 56px) */}
                      {item.photo_url ? (
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(item.photo_url)}
                          className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border border-border"
                          aria-label="View reference photo"
                        >
                          <img src={item.photo_url} alt="reference" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-14 h-14 flex-shrink-0 rounded-lg border border-border bg-muted/20 flex items-center justify-center text-2xl">
                          {item.icon}
                        </div>
                      )}

                      {/* Label + notes — tappable to toggle */}
                      <button
                        type="button"
                        onClick={() => toggleItem(item.id)}
                        className="flex-1 min-w-0 text-left pt-1"
                      >
                        <p className={cn("text-base leading-snug", checked && "line-through")}>
                          {item.title}
                          {item.is_required && <span className="ml-1 text-[hsl(var(--status-urgent))]">*</span>}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic leading-snug">{item.notes}</p>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">{t("emptyChecklist")}</p>
          )}
        </div>

        {/* Notes */}
        <div className="bg-card border border-border rounded-xl p-4 mt-5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("notesOptional")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => persist({ notes: notes.trim() })}
            placeholder={t("notesPlaceholder")}
            rows={3}
            className="w-full mt-2 text-base bg-background border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[hsl(var(--gold))] resize-none"
          />
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          {t("progressAutoSaved")}
        </p>
      </main>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 bg-charcoal border-t border-charcoal-light px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={submit}
            disabled={submitting || total === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[hsl(var(--gold))] text-charcoal text-base font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <Send size={16} />
            {submitting ? t("sending") : t("completeAndSend")}
          </button>
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <img
            src={lightboxUrl}
            alt="reference"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
