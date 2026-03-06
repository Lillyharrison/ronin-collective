import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Shield, Plus, Pencil, Trash2, X, ChevronDown, ChevronUp,
  Globe, Building2, CheckCircle2, Clock, XCircle
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PropertyRule {
  id: string;
  title: string;
  description: string | null;
  property_id: string | null;
  is_universal: boolean;
  applies_to_roles: string[];
  visible_to_user_ids: string[];
  enacted_event_types: string[];
  enacted_keywords: string[];
  icon: string;
  color: string;
  is_active: boolean;
  status: "active" | "pending_approval" | "rejected";
  submitted_by: string | null;
  submitted_source: string;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  propertyName?: string;
  submitterName?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = ["amber", "red", "blue", "green", "gold", "purple"] as const;
const ROLES = ["master_admin", "admin", "manager", "staff", "principal"];
const EVENT_TYPES = ["guest_stay", "owner_stay", "maintenance", "travel", "general", "private_event"];
const ICON_BANK = ["⚠️","🔒","🚗","🐕","🔇","🚭","👔","🎶","🚿","🛏️","🍽️","🔑","🌿","🏊","🧹","📵","🚪","✅","⛔","💡","🔔","🛡️","🏠","🌊","🔥"];

const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string }> = {
  amber:  { bg: "bg-[hsl(var(--status-pending)/0.08)]",  border: "border-[hsl(var(--status-pending)/0.3)]",  text: "text-[hsl(var(--status-pending))]" },
  red:    { bg: "bg-[hsl(var(--status-urgent)/0.08)]",   border: "border-[hsl(var(--status-urgent)/0.3)]",   text: "text-[hsl(var(--status-urgent))]" },
  orange: { bg: "bg-[hsl(var(--status-urgent)/0.08)]",   border: "border-[hsl(var(--status-urgent)/0.3)]",   text: "text-[hsl(var(--status-urgent))]" },
  blue:   { bg: "bg-accent/8",                            border: "border-accent/30",                          text: "text-accent" },
  green:  { bg: "bg-[hsl(var(--status-done)/0.08)]",     border: "border-[hsl(var(--status-done)/0.3)]",     text: "text-[hsl(var(--status-done))]" },
  gold:   { bg: "bg-gold/8",                              border: "border-gold/30",                            text: "text-gold" },
  purple: { bg: "bg-purple-500/8",                        border: "border-purple-500/30",                      text: "text-purple-400" },
};
const getColor = (c: string) => COLOR_CLASSES[c] ?? COLOR_CLASSES.amber;

const COLOR_DOT: Record<string, string> = {
  amber: "bg-amber-400", red: "bg-red-400", blue: "bg-blue-400",
  green: "bg-green-400", gold: "bg-yellow-400", purple: "bg-purple-400",
};

// ─── Rule Form ────────────────────────────────────────────────────────────────
interface FormState {
  title: string;
  description: string;
  icon: string;
  color: string;
  applies_to_roles: string[];
  enacted_event_types: string[];
  enacted_keywords: string;
  is_universal: boolean;
  property_id: string;
}

const BLANK_FORM: FormState = {
  title: "", description: "", icon: "⚠️", color: "amber",
  applies_to_roles: [], enacted_event_types: [],
  enacted_keywords: "", is_universal: false, property_id: "",
};

interface RuleFormProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  properties: { id: string; name: string }[];
  editingId: string | null;
  onSave: () => void;
  onCancel: () => void;
}

function RuleForm({ form, setForm, properties, editingId, onSave, onCancel }: RuleFormProps) {
  const [showIconPicker, setShowIconPicker] = useState(false);

  const toggleChip = (arr: string[], val: string, key: keyof FormState) => {
    setForm(f => ({ ...f, [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] }));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <p className="text-sm font-semibold text-foreground">{editingId ? "Edit Rule" : "New Rule"}</p>

      {/* Icon + Title */}
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowIconPicker(v => !v)}
            className="w-10 h-10 border border-border rounded-lg text-xl flex items-center justify-center hover:border-gold transition-colors"
          >
            {form.icon}
          </button>
          {showIconPicker && (
            <div className="absolute top-11 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-5 gap-1 shadow-xl w-48">
              {ICON_BANK.map(ic => (
                <button key={ic} onClick={() => { setForm(f => ({ ...f, icon: ic })); setShowIconPicker(false); }}
                  className={cn("text-lg p-1 rounded hover:bg-muted", form.icon === ic && "bg-muted ring-1 ring-gold")}>
                  {ic}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Rule title (e.g. No parking in driveway)"
          className="flex-1 text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Description */}
      <textarea
        value={form.description}
        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        placeholder="Description / details (optional)"
        rows={2}
        className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold resize-none text-foreground placeholder:text-muted-foreground"
      />

      {/* Colour */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Alert colour</p>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setForm(f => ({ ...f, color: c }))}
              className={cn(
                "w-7 h-7 rounded-full border-2 transition-all",
                COLOR_DOT[c],
                form.color === c ? "ring-2 ring-offset-2 ring-foreground ring-offset-card scale-110" : "opacity-60 hover:opacity-100"
              )}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Property scoping */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <div
            onClick={() => setForm(f => ({ ...f, is_universal: !f.is_universal, property_id: "" }))}
            className={cn("w-9 h-5 rounded-full border-2 transition-all relative flex-shrink-0", form.is_universal ? "bg-primary border-primary" : "border-border")}
          >
            <div className={cn("w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all", form.is_universal ? "left-4" : "left-0.5")} />
          </div>
          <span className="text-xs text-muted-foreground">Apply to all properties (universal)</span>
        </label>
        {!form.is_universal && properties.length > 0 && (
          <select
            value={form.property_id}
            onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
            className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold text-foreground"
          >
            <option value="">— Specific property (optional) —</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Triggered by event type */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Triggered by calendar event type</p>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map(t => (
            <button
              key={t}
              onClick={() => toggleChip(form.enacted_event_types, t, "enacted_event_types")}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-all",
                form.enacted_event_types.includes(t)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Triggered by keyword */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Triggered by keywords (comma-separated)</p>
        <input
          value={form.enacted_keywords}
          onChange={e => setForm(f => ({ ...f, enacted_keywords: e.target.value }))}
          placeholder="e.g. Behdad, Owner visit, Party"
          className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Roles */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Visible to roles (leave empty = all)</p>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map(r => (
            <button
              key={r}
              onClick={() => toggleChip(form.applies_to_roles, r, "applies_to_roles")}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border capitalize transition-all",
                form.applies_to_roles.includes(r)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-foreground"
              )}
            >
              {r.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={!form.title.trim()}
          className="flex-1 text-sm py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40"
        >
          {editingId ? "Save Changes" : "Add Rule"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 text-sm py-2.5 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Rule Card ────────────────────────────────────────────────────────────────
interface RuleCardProps {
  rule: PropertyRule;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  onEdit: (rule: PropertyRule) => void;
  onDelete: (id: string) => void;
  onToggleActive: (rule: PropertyRule) => void;
}

function RuleCard({ rule, isAdmin, isMasterAdmin, onEdit, onDelete, onToggleActive }: RuleCardProps) {
  const s = getColor(rule.color);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("rounded-xl border transition-all", s.bg, s.border, !rule.is_active && "opacity-50")}>
      <div className="flex items-start gap-3 p-4">
        <span className="text-xl flex-shrink-0 mt-0.5">{rule.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn("text-sm font-semibold", s.text)}>{rule.title}</p>
            {rule.is_universal && (
              <span className="flex items-center gap-0.5 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                <Globe size={9} />Universal
              </span>
            )}
            {rule.propertyName && (
              <span className="flex items-center gap-0.5 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                <Building2 size={9} />{rule.propertyName}
              </span>
            )}
            {!rule.is_active && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Inactive</span>
            )}
          </div>
          {rule.description && (
            <p className="text-xs text-foreground/70 mt-1 leading-relaxed">{rule.description}</p>
          )}
          {/* Trigger chips */}
          {(rule.enacted_event_types.length > 0 || rule.enacted_keywords.length > 0) && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {rule.enacted_event_types.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/10 text-foreground/70 font-medium">{t}</span>
              ))}
              {rule.enacted_keywords.map(k => (
                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/10 text-foreground/70 font-medium">"{k}"</span>
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onToggleActive(rule)}
              className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
              title={rule.is_active ? "Deactivate" : "Activate"}
            >
              {rule.is_active
                ? <CheckCircle2 size={13} className="text-[hsl(var(--status-done))]" />
                : <XCircle size={13} className="text-muted-foreground" />
              }
            </button>
            <button onClick={() => onEdit(rule)} className="p-1.5 rounded-lg hover:bg-black/10 transition-colors">
              <Pencil size={13} />
            </button>
            {isMasterAdmin && (
              <button onClick={() => onDelete(rule.id)} className="p-1.5 rounded-lg hover:bg-black/10 transition-colors text-destructive">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export function RulesSection() {
  const { isAdmin, isMasterAdmin, userId } = usePermissions();
  const { language } = useLanguage();

  const [rules, setRules] = useState<PropertyRule[]>([]);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rulesData }, { data: propsData }] = await Promise.all([
      supabase.from("property_rules").select("*").order("created_at"),
      supabase.from("properties").select("id, name"),
    ]);

    const propMap: Record<string, string> = {};
    (propsData ?? []).forEach((p: { id: string; name: string }) => { propMap[p.id] = p.name; });
    setProperties(propsData ?? []);

    // Get submitter names for any pending rules
    const pending = (rulesData ?? []).filter((r: any) => r.submitted_by);
    let nameMap: Record<string, string> = {};
    if (pending.length > 0) {
      const ids = [...new Set(pending.map((r: any) => r.submitted_by as string))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      (profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name ?? "Unknown"; });
    }

    setRules((rulesData ?? []).map((r: any) => ({
      ...r,
      status: r.status ?? "active",
      submitted_source: r.submitted_source ?? "manual",
      propertyName: r.property_id ? propMap[r.property_id] : undefined,
      submitterName: r.submitted_by ? nameMap[r.submitted_by] : undefined,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeRules = rules.filter(r => r.status === "active" && (
    activeFilter === "all" ? true :
    activeFilter === "active" ? r.is_active :
    !r.is_active
  ));

  const startEdit = (rule: PropertyRule) => {
    setForm({
      title: rule.title,
      description: rule.description ?? "",
      icon: rule.icon,
      color: rule.color,
      applies_to_roles: rule.applies_to_roles,
      enacted_event_types: rule.enacted_event_types,
      enacted_keywords: rule.enacted_keywords.join(", "),
      is_universal: rule.is_universal,
      property_id: rule.property_id ?? "",
    });
    setEditingId(rule.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveRule = async () => {
    if (!form.title.trim()) return;
    const payload: any = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      icon: form.icon,
      color: form.color,
      applies_to_roles: form.applies_to_roles,
      enacted_event_types: form.enacted_event_types,
      enacted_keywords: form.enacted_keywords
        ? form.enacted_keywords.split(",").map(k => k.trim()).filter(Boolean)
        : [],
      property_id: form.is_universal ? null : (form.property_id || null),
      is_universal: form.is_universal,
      is_active: true,
      status: "active",
      submitted_source: "manual",
      created_by: userId,
    };

    if (editingId) {
      await supabase.from("property_rules").update(payload).eq("id", editingId);
    } else {
      await supabase.from("property_rules").insert(payload);
    }
    setForm(BLANK_FORM);
    setShowForm(false);
    setEditingId(null);
    load();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Permanently delete this rule?")) return;
    await supabase.from("property_rules").delete().eq("id", id);
    load();
  };

  const toggleActive = async (rule: PropertyRule) => {
    await supabase.from("property_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    load();
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK_FORM);
  };

  const universalRules = activeRules.filter(r => r.is_universal);
  const propertyRules  = activeRules.filter(r => !r.is_universal);

  // Group property rules by property
  const byProperty: Record<string, PropertyRule[]> = {};
  propertyRules.forEach(r => {
    const key = r.propertyName ?? "Unassigned";
    if (!byProperty[key]) byProperty[key] = [];
    byProperty[key].push(r);
  });

  return (
    <div className="animate-fade-in pb-8">
      {/* Header banner */}
      <div className="bg-gold/5 border-b border-gold/15 px-5 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center">
              <Shield size={18} className="text-gold" />
            </div>
            <div>
              <h2 className="font-display text-xl text-foreground">
                {language === "es" ? "Reglas de la Propiedad" : "Property Rules"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rules.filter(r => r.status === "active" && r.is_active).length} active rule{rules.filter(r => r.status === "active" && r.is_active).length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {isAdmin && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-gold/10 border border-gold/25 text-gold rounded-xl text-sm font-medium hover:bg-gold/20 transition-colors"
            >
              <Plus size={15} />
              New Rule
            </button>
          )}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-5">
        {/* Form */}
        {showForm && (
          <RuleForm
            form={form}
            setForm={setForm}
            properties={properties}
            editingId={editingId}
            onSave={saveRule}
            onCancel={cancelForm}
          />
        )}

        {/* Filter tabs */}
        {!showForm && (
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            {(["active", "inactive", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-lg font-medium capitalize transition-all",
                  activeFilter === f
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f === "all" ? "All" : f === "active" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : activeRules.length === 0 && !showForm ? (
          <div className="rounded-xl bg-card border border-border p-8 text-center">
            <Shield size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No rules yet</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground/60 mt-1">
                Add rules to surface alerts on the dashboard
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Universal rules */}
            {universalRules.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Globe size={12} className="text-muted-foreground" />
                  <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Universal</p>
                  <span className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 py-0.5 rounded-full">{universalRules.length}</span>
                </div>
                <div className="space-y-2">
                  {universalRules.map(rule => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      isAdmin={isAdmin}
                      isMasterAdmin={isMasterAdmin}
                      onEdit={startEdit}
                      onDelete={deleteRule}
                      onToggleActive={toggleActive}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Per-property rules */}
            {Object.entries(byProperty).map(([propName, propRules]) => (
              <div key={propName}>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 size={12} className="text-muted-foreground" />
                  <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{propName}</p>
                  <span className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 py-0.5 rounded-full">{propRules.length}</span>
                </div>
                <div className="space-y-2">
                  {propRules.map(rule => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      isAdmin={isAdmin}
                      isMasterAdmin={isMasterAdmin}
                      onEdit={startEdit}
                      onDelete={deleteRule}
                      onToggleActive={toggleActive}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
