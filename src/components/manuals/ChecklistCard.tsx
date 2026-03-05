import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useChecklistItems, useChecklistSessions, ChecklistTemplate } from "@/hooks/useChecklists";
import { ChecklistItemRow } from "./ChecklistItemRow";
import { cn } from "@/lib/utils";
import { Plus, Printer, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  template: ChecklistTemplate;
  propertyId?: string | null;
  defaultOpen?: boolean;
}

const COLOR_BG: Record<string, string> = {
  green:  "bg-[hsl(var(--status-done)/0.1)] border-[hsl(var(--status-done)/0.25)] text-[hsl(var(--status-done))]",
  amber:  "bg-[hsl(var(--status-progress)/0.1)] border-[hsl(var(--status-progress)/0.25)] text-[hsl(var(--status-progress))]",
  red:    "bg-[hsl(var(--status-urgent)/0.1)] border-[hsl(var(--status-urgent)/0.25)] text-[hsl(var(--status-urgent))]",
  blue:   "bg-blue-500/10 border-blue-500/25 text-blue-500",
  gold:   "bg-[hsl(var(--gold)/0.1)] border-[hsl(var(--gold)/0.25)] text-[hsl(var(--gold))]",
  purple: "bg-purple-500/10 border-purple-500/25 text-purple-400",
};

export function ChecklistCard({ template, propertyId, defaultOpen = false }: Props) {
  const { isAdmin, userId } = usePermissions();
  const [open, setOpen] = useState(defaultOpen);
  const { items, loading, reload, setItems } = useChecklistItems(open ? template.id : null);
  const { completedIds, toggle } = useChecklistSessions(template.id, propertyId);
  const [addingItem, setAddingItem] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const progress = items.length > 0 ? Math.round((completedIds.size / items.length) * 100) : 0;
  const colorCls = COLOR_BG[template.color] ?? COLOR_BG.green;

  const handleUpdate = async (id: string, changes: Partial<{ title: string; icon: string }>) => {
    await supabase.from("checklist_items").update(changes).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("checklist_items").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handlePhotoUpload = async (id: string, url: string) => {
    await supabase.from("checklist_items").update({ photo_url: url }).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, photo_url: url } : i));
  };

  const addItem = async () => {
    if (!newTitle.trim()) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
    const { data } = await supabase.from("checklist_items").insert({
      template_id: template.id,
      title: newTitle.trim(),
      icon: "▸",
      color: "default",
      sort_order: maxOrder,
      is_required: false,
    }).select().single();
    if (data) setItems(prev => [...prev, data as any]);
    setNewTitle("");
    setAddingItem(false);
  };

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const rows = items.map(item => {
      const done = completedIds.has(item.id);
      return `<tr>
        <td style="width:24px;text-align:center;">${done ? "☑" : "☐"}</td>
        <td style="padding:4px 8px;">${item.icon} ${item.title}${item.is_required ? " *" : ""}</td>
      </tr>`;
    }).join("");
    win.document.write(`
      <html><head><title>${template.title}</title>
      <style>
        @page { size: letter; margin: 0.75in; }
        body { font-family: 'Georgia', serif; font-size: 11pt; color: #1C1D20; }
        h1 { font-size: 18pt; margin-bottom: 4px; }
        .meta { color: #888; font-size: 9pt; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        tr { border-bottom: 1px solid #eee; }
        td { padding: 6px 4px; vertical-align: top; }
        .progress { font-size: 9pt; color: #888; margin-bottom: 12px; }
        .footer { margin-top: 20px; font-size: 8pt; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
      </style></head>
      <body>
        <h1>${template.icon} ${template.title}</h1>
        <p class="meta">${today}</p>
        <p class="progress">Progress: ${completedIds.size} / ${items.length} complete (${progress}%)</p>
        <table>${rows}</table>
        <p class="footer">* Required items &nbsp;|&nbsp; Ronin Collective</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className={cn("w-8 h-8 rounded-lg border flex items-center justify-center text-base flex-shrink-0", colorCls)}>
          {template.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{template.title}</p>
          {open && items.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-[hsl(var(--status-done))] rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {completedIds.size}/{items.length}
              </span>
            </div>
          )}
        </div>
        {open && isAdmin && (
          <button
            onClick={e => { e.stopPropagation(); handlePrint(); }}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Print"
          >
            <Printer size={14} />
          </button>
        )}
        {open ? <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />}
      </button>

      {/* Items */}
      {open && (
        <div className="border-t border-border">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground italic">No items yet.</p>
          ) : (
            items.map(item => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                isCompleted={completedIds.has(item.id)}
                isAdmin={!!isAdmin}
                onToggle={() => toggle(item.id, completedIds.has(item.id))}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onPhotoUpload={handlePhotoUpload}
              />
            ))
          )}

          {/* Add item */}
          {isAdmin && (
            <div className="border-t border-border px-4 py-2">
              {addingItem ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAddingItem(false); }}
                    placeholder="New item…"
                    className="flex-1 text-sm bg-muted/50 border border-border rounded px-2 py-1.5 outline-none focus:border-gold"
                  />
                  <button onClick={addItem} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg">Add</button>
                  <button onClick={() => setAddingItem(false)} className="text-xs text-muted-foreground">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingItem(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <Plus size={12} /> Add item
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
