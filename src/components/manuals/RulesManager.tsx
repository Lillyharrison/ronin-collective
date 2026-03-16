import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { PropertyRule } from "@/hooks/usePropertyRules";
import { cn } from "@/lib/utils";
import { Pencil, Trash2, Plus, Shield, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  rules: PropertyRule[];
  propertyId?: string | null;
  onReload: () => void;
}

interface OccupantProfile {
  id: string;
  full_name: string | null;
}

const EVENT_TYPES = ["guest_stay", "owner_stay", "maintenance", "travel", "general", "private_event"];
const COLORS = ["amber", "red", "blue", "green", "gold", "purple"];

const COLOR_BG: Record<string, string> = {
  amber:  "bg-[hsl(var(--status-progress)/0.1)] border-[hsl(var(--status-progress)/0.25)] text-[hsl(var(--status-progress))]",
  red:    "bg-[hsl(var(--status-urgent)/0.1)] border-[hsl(var(--status-urgent)/0.25)] text-[hsl(var(--status-urgent))]",
  blue:   "bg-blue-500/10 border-blue-500/25 text-blue-500",
  green:  "bg-[hsl(var(--status-done)/0.1)] border-[hsl(var(--status-done)/0.25)] text-[hsl(var(--status-done))]",
  gold:   "bg-[hsl(var(--gold)/0.1)] border-[hsl(var(--gold)/0.25)] text-[hsl(var(--gold))]",
  purple: "bg-purple-500/10 border-purple-500/25 text-purple-400",
};

const ICON_BANK = ["⚠️","🔒","🚗","🐕","🔇","🚭","👔","🎶","🚿","🛏️","🍽️","🔑","🌿","🏊","🧹","📵","🚪","✅","⛔","💡"];

export function RulesManager({ rules, propertyId, onReload }: Props) {
  const { isAdmin, userId } = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [occupantProfiles, setOccupantProfiles] = useState<OccupantProfile[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    icon: "⚠️",
    color: "amber",
    applies_to_roles: [] as string[],
    enacted_event_types: [] as string[],
    enacted_keywords: "",
    enacted_occupant_ids: [] as string[],
    is_universal: false,
  });
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Load principal/family profiles for occupant picker
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name")
      .then(({ data }) => setOccupantProfiles((data as OccupantProfile[]) ?? []));
  }, []);

  const resetForm = () => setForm({
    title: "", description: "", icon: "⚠️", color: "amber",
    applies_to_roles: [], enacted_event_types: [], enacted_keywords: "",
    enacted_occupant_ids: [], is_universal: false,
  });

  const startEdit = (rule: PropertyRule) => {
    setForm({
      title: rule.title,
      description: rule.description ?? "",
      icon: rule.icon,
      color: rule.color,
      applies_to_roles: rule.applies_to_roles,
      enacted_event_types: rule.enacted_event_types,
      enacted_keywords: rule.enacted_keywords.join(", "),
      enacted_occupant_ids: rule.enacted_occupant_ids ?? [],
      is_universal: rule.is_universal,
    });
    setEditingId(rule.id);
    setShowForm(true);
  };

  const saveRule = async () => {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      icon: form.icon,
      color: form.color,
      applies_to_roles: form.applies_to_roles,
      enacted_event_types: form.enacted_event_types,
      enacted_keywords: form.enacted_keywords
        ? form.enacted_keywords.split(",").map(k => k.trim()).filter(Boolean)
        : [],
      enacted_occupant_ids: form.enacted_occupant_ids,
      property_id: form.is_universal ? null : (propertyId ?? null),
      is_universal: form.is_universal,
      created_by: userId,
    };
    if (editingId) {
      await supabase.from("property_rules").update(payload).eq("id", editingId);
    } else {
      await supabase.from("property_rules").insert(payload);
    }
    resetForm();
    setShowForm(false);
    setEditingId(null);
    onReload();
  };

  const deleteRule = async (id: string) => {
    await supabase.from("property_rules").update({ is_active: false }).eq("id", id);
    onReload();
  };

  const toggleChip = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  };

  const occupantNameMap = Object.fromEntries(
    occupantProfiles.map(p => [p.id, p.full_name ?? p.id])
  );

  return (
    <div className="space-y-3">
      {rules.length === 0 && !showForm && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Shield size={28} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No rules set for this property.</p>
          {isAdmin && <p className="text-xs text-muted-foreground/60 mt-1">Add rules to automatically surface alerts on the Dashboard.</p>}
        </div>
      )}

      {rules.map(rule => (
        <div key={rule.id} className={cn("rounded-xl border p-4", COLOR_BG[rule.color] ?? COLOR_BG.amber)}>
          <div className="flex items-start gap-3">
            <span className="text-xl flex-shrink-0">{rule.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{rule.title}</p>
              {rule.description && <p className="text-xs mt-0.5 opacity-80">{rule.description}</p>}
              <div className="flex flex-wrap gap-1 mt-2">
                {rule.enacted_event_types.map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/10 font-medium">{t}</span>
                ))}
                {rule.enacted_keywords.map(k => (
                  <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/10 font-medium">"{k}"</span>
                ))}
                {(rule.enacted_occupant_ids ?? []).map((id: string) => (
                  <span key={id} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-black/10 font-medium">
                    <User size={9} /> {occupantNameMap[id] ?? id}
                  </span>
                ))}
                {rule.is_universal && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/10 font-medium">All properties</span>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => startEdit(rule)} className="p-1.5 rounded-lg hover:bg-black/10"><Pencil size={13} /></button>
                <button onClick={() => deleteRule(rule.id)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={16} /></button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Add / Edit form */}
      {isAdmin && (
        showForm ? (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold">{editingId ? "Edit Rule" : "New Rule"}</p>

            {/* Icon + Title */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <button onClick={() => setShowIconPicker(v => !v)}
                  className="w-10 h-10 border border-border rounded-lg text-xl flex items-center justify-center hover:border-gold">
                  {form.icon}
                </button>
                {showIconPicker && (
                  <div className="absolute top-11 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-5 gap-1 shadow-lg w-44">
                    {ICON_BANK.map(ic => (
                      <button key={ic} onClick={() => { setForm(f => ({ ...f, icon: ic })); setShowIconPicker(false); }}
                        className={cn("text-base p-1 rounded hover:bg-muted", form.icon === ic && "bg-muted")}
                      >{ic}</button>
                    ))}
                  </div>
                )}
              </div>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Rule title (e.g. No parking in driveway)"
                className="flex-1 text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold" />
            </div>

            {/* Description */}
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description / details (optional)"
              rows={2}
              className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold resize-none" />

            {/* Color */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Alert colour</p>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={cn("w-6 h-6 rounded-full border-2 transition-all", COLOR_BG[c], form.color === c ? "ring-2 ring-offset-1 ring-foreground" : "")}
                  />
                ))}
              </div>
            </div>

            {/* Triggered by occupant */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Active when this person is at the property</p>
              <Select
                value="__placeholder__"
                onValueChange={id => {
                  if (!form.enacted_occupant_ids.includes(id)) {
                    setForm(f => ({ ...f, enacted_occupant_ids: [...f.enacted_occupant_ids, id] }));
                  }
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Add occupant…" />
                </SelectTrigger>
                <SelectContent>
                  {occupantProfiles
                    .filter(p => !form.enacted_occupant_ids.includes(p.id))
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name ?? p.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {form.enacted_occupant_ids.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.enacted_occupant_ids.map(id => (
                    <span key={id}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                      <User size={10} />
                      {occupantNameMap[id] ?? id}
                      <button
                        onClick={() => setForm(f => ({ ...f, enacted_occupant_ids: f.enacted_occupant_ids.filter(i => i !== id) }))}
                        className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Triggered by event type */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Triggered by calendar event type</p>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_TYPES.map(t => (
                  <button key={t} onClick={() => toggleChip(form.enacted_event_types, t, v => setForm(f => ({ ...f, enacted_event_types: v })))}
                    className={cn("text-xs px-2.5 py-1 rounded-full border transition-all",
                      form.enacted_event_types.includes(t)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-foreground"
                    )}
                  >{t}</button>
                ))}
              </div>
            </div>

            {/* Triggered by keyword */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Triggered by keywords in event title (comma-separated)</p>
              <input value={form.enacted_keywords} onChange={e => setForm(f => ({ ...f, enacted_keywords: e.target.value }))}
                placeholder="e.g. Owner visit, School run"
                className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold" />
            </div>

            {/* Universal */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setForm(f => ({ ...f, is_universal: !f.is_universal }))}
                className={cn("w-9 h-5 rounded-full border-2 transition-all relative", form.is_universal ? "bg-primary border-primary" : "border-border")}>
                <div className={cn("w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all", form.is_universal ? "left-4" : "left-0.5")} />
              </div>
              <span className="text-xs text-muted-foreground">Apply to all properties</span>
            </label>

            <div className="flex gap-2 pt-1">
              <button onClick={saveRule}
                className="flex-1 text-sm py-2 bg-primary text-primary-foreground rounded-lg font-medium">
                {editingId ? "Save Changes" : "Add Rule"}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
                className="px-4 text-sm py-2 border border-border rounded-lg text-muted-foreground">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-gold hover:text-foreground transition-all">
            <Plus size={14} /> Add rule
          </button>
        )
      )}
    </div>
  );
}
