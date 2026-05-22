import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { sortProperties } from "@/hooks/useScopedProperties";
import { ChecklistTemplate } from "@/hooks/useChecklists";
import { Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Property { id: string; name: string; is_primary?: boolean; }

interface Props {
  template: ChecklistTemplate;
  onCopied?: () => void;
}

export function CopyChecklistButton({ template, onCopied }: Props) {
  const { isMasterAdmin, isAdmin, isManager, assignedPropertyIds } = usePermissions();
  const canManage = isMasterAdmin || isAdmin || isManager;
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let q = supabase.from("properties").select("id, name, is_primary");
    if (!isMasterAdmin && !isAdmin && assignedPropertyIds.length > 0) {
      q = q.in("id", assignedPropertyIds);
    }
    q.then(({ data }) => {
      const list = sortProperties((data as Property[]) ?? []);
      setProperties(list.filter(p => p.id !== template.property_id));
    });
  }, [open, isMasterAdmin, isAdmin, assignedPropertyIds, template.property_id]);

  if (!canManage || template.is_universal) return null;

  const copyTo = async (propId: string, propName: string) => {
    setBusyId(propId);
    try {
      // 1. Clone template
      const { data: newTpl, error: tplErr } = await supabase.from("checklist_templates").insert({
        title: template.title,
        category: template.category,
        subcategory: template.subcategory,
        icon: template.icon,
        color: template.color,
        cover_image_url: template.cover_image_url,
        recurrence: template.recurrence,
        recurrence_day: template.recurrence_day,
        assigned_role: template.assigned_role,
        assigned_department: template.assigned_department,
        notify_on_day: template.notify_on_day,
        only_when_occupied: template.only_when_occupied,
        manual_link_url: template.manual_link_url,
        manual_link_label: template.manual_link_label,
        property_id: propId,
        is_published: false, // copy as draft so admin reviews
        sections: template.sections ?? [],
        products: template.products ?? [],
      } as any).select().single();
      if (tplErr || !newTpl) throw tplErr ?? new Error("Failed to clone template");

      // 2. Clone items
      const { data: items } = await supabase
        .from("checklist_items")
        .select("title, icon, color, section, container, photo_url, notes, is_required, sort_order")
        .eq("template_id", template.id)
        .order("sort_order");
      if (items && items.length > 0) {
        const rows = items.map((it: any) => ({ ...it, template_id: newTpl.id }));
        await supabase.from("checklist_items").insert(rows);
      }

      toast.success(`Copied to ${propName} (as draft)`);
      setOpen(false);
      onCopied?.();
    } catch (e: any) {
      toast.error("Copy failed: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Copy to another property"
        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-[hsl(var(--gold))] hover:border-[hsl(var(--gold))] transition-all"
      >
        <Copy size={13} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6"
             onClick={() => setOpen(false)}>
          <div className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col border border-border"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
              <Copy size={16} className="text-[hsl(var(--gold))]" />
              <p className="text-sm font-semibold flex-1">Copy "{template.title}" to…</p>
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {properties.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No other properties available.</p>
              ) : properties.map(p => (
                <button
                  key={p.id}
                  disabled={!!busyId}
                  onClick={() => copyTo(p.id, p.name)}
                  className={cn(
                    "w-full text-left px-3 py-3 rounded-lg hover:bg-muted transition-colors flex items-center justify-between text-sm",
                    busyId === p.id && "opacity-50"
                  )}
                >
                  <span className="font-medium">{p.name}</span>
                  {busyId === p.id && <span className="text-xs text-muted-foreground">Copying…</span>}
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-border flex-shrink-0">
              <p className="text-[11px] text-muted-foreground text-center">
                The copy will be saved as a Draft on the target property so you can review before publishing.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
