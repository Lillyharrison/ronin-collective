import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistTemplate, ChecklistItem } from "@/hooks/useChecklists";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  template: ChecklistTemplate;
  items: ChecklistItem[];
  isAdmin: boolean;
  onTemplateChange: (sections: string[]) => void;
  onItemsChange: (items: ChecklistItem[]) => void;
}

/**
 * Renders a row above the item list with section pills + admin controls
 * (add, rename, delete sections). Also exposes a per-item section picker
 * via context — actual item rendering still happens in the parent.
 */
export function SectionsManager({ template, items, isAdmin, onTemplateChange, onItemsChange }: Props) {
  const sections = template.sections ?? [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const persistSections = async (next: string[]) => {
    onTemplateChange(next);
    await supabase.from("checklist_templates").update({ sections: next as any }).eq("id", template.id);
  };

  const addSection = async () => {
    const name = draft.trim();
    if (!name) return;
    if (sections.includes(name)) { toast.error("Section already exists"); return; }
    await persistSections([...sections, name]);
    setDraft(""); setAdding(false);
  };

  const renameSection = async (oldName: string) => {
    const next = editDraft.trim();
    if (!next || next === oldName) { setEditing(null); return; }
    if (sections.includes(next)) { toast.error("Section already exists"); return; }
    // Update template list
    const nextSections = sections.map(s => s === oldName ? next : s);
    await persistSections(nextSections);
    // Update all items in this section
    const affected = items.filter(i => i.section === oldName);
    if (affected.length > 0) {
      await supabase.from("checklist_items").update({ section: next }).eq("template_id", template.id).eq("section", oldName);
      onItemsChange(items.map(i => i.section === oldName ? { ...i, section: next } : i));
    }
    setEditing(null);
  };

  const deleteSection = async (name: string) => {
    if (!confirm(`Delete section "${name}"? Items in it will become ungrouped (no data lost).`)) return;
    const nextSections = sections.filter(s => s !== name);
    await persistSections(nextSections);
    const affected = items.filter(i => i.section === name);
    if (affected.length > 0) {
      await supabase.from("checklist_items").update({ section: null }).eq("template_id", template.id).eq("section", name);
      onItemsChange(items.map(i => i.section === name ? { ...i, section: null } : i));
    }
  };

  if (!isAdmin && sections.length === 0) return null;

  return (
    <div className="px-4 mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sections</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sections.map(s => (
          <div key={s} className="group/sec inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[hsl(var(--gold)/0.1)] border border-[hsl(var(--gold)/0.3)] text-[hsl(var(--gold))] text-xs">
            {editing === s ? (
              <input
                autoFocus value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
                onBlur={() => renameSection(s)}
                onKeyDown={e => { if (e.key === "Enter") renameSection(s); if (e.key === "Escape") setEditing(null); }}
                className="bg-transparent outline-none w-24 text-xs"
              />
            ) : (
              <span>{s}</span>
            )}
            {isAdmin && editing !== s && (
              <>
                <button onClick={() => { setEditing(s); setEditDraft(s); }}
                  className="opacity-0 group-hover/sec:opacity-100 transition-opacity">
                  <Pencil size={9} />
                </button>
                <button onClick={() => deleteSection(s)}
                  className="opacity-0 group-hover/sec:opacity-100 transition-opacity text-[hsl(var(--status-urgent))]">
                  <Trash2 size={9} />
                </button>
              </>
            )}
          </div>
        ))}
        {isAdmin && (
          adding ? (
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-border bg-card">
              <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addSection(); if (e.key === "Escape") { setAdding(false); setDraft(""); } }}
                placeholder="Section name…"
                className="bg-transparent outline-none text-xs w-28"
              />
              <button onClick={addSection} className="text-[hsl(var(--gold))]"><Check size={11} /></button>
              <button onClick={() => { setAdding(false); setDraft(""); }} className="text-muted-foreground"><X size={11} /></button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground text-xs hover:border-[hsl(var(--gold))] hover:text-[hsl(var(--gold))]">
              <Plus size={10} /> Add section
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** Small inline section picker for an item row (admin only) */
export function ItemSectionPicker({
  item, sections, onChange,
}: {
  item: ChecklistItem;
  sections: string[];
  onChange: (next: string | null) => void;
}) {
  return (
    <select
      value={item.section ?? ""}
      onChange={e => onChange(e.target.value || null)}
      onClick={e => e.stopPropagation()}
      className="text-[10px] bg-transparent border border-border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:border-[hsl(var(--gold))] outline-none cursor-pointer"
    >
      <option value="">— Ungrouped —</option>
      {sections.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
