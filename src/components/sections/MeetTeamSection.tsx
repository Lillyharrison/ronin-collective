import { useState, useEffect } from "react";
import { sortProperties } from "@/hooks/useScopedProperties";
import { imageUrl } from "@/lib/imageUrl";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import {
  UsersRound, Plus, Search, ChevronRight,
  User, Briefcase, Building2, Calendar, X, Check, ChevronDown,
  Eye, Pencil, Bell, Save, Loader2, Trash2, Mail, Zap,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = "principal" | "extended_family" | "manager" | "staff";
type Department = "exterior" | "interior" | "kitchen" | "security" | "office";
type AppRole = "master_admin" | "admin" | "manager" | "staff" | "principal";

interface SectionPerm {
  view: boolean;
  edit: boolean;
  notifications: boolean;
}
type SectionPermissions = Record<string, SectionPerm>;

interface TeamMember {
  id: string;
  full_name: string | null;
  job_title: string | null;
  avatar_url: string | null;
  level: string | null;
  department: string | null;
  start_date: string | null;
  birthday: string | null;
  phone: string | null;
  notes: string | null;
  assigned_property_ids: string[] | null;
  section_permissions: SectionPermissions | null;
  role?: AppRole | null;
}

interface Property {
  id: string;
  name: string;
}

interface AddUserForm {
  full_name: string;
  email: string;
  job_title: string;
  level: Level | "";
  department: Department | "";
  role: AppRole | "";
  start_date: string;
  birthday: string;
  notes: string;
}

// ─── All navigable sections in the app ────────────────────────────────────────
const ALL_SECTIONS: { key: string; label: string; labelEs: string; hasEdit?: boolean; isFeature?: boolean; isCalendarSub?: boolean }[] = [
  { key: "dashboard",          label: "Dashboard",           labelEs: "Panel",             hasEdit: false },
  { key: "property",           label: "Property",            labelEs: "Propiedad",         hasEdit: true  },
  { key: "maintenance",        label: "Maintenance",         labelEs: "Mantenimiento",     hasEdit: true  },
  { key: "messages",           label: "Messages",            labelEs: "Mensajes",          hasEdit: true  },
  { key: "tasks",              label: "Tasks",               labelEs: "Tareas",            hasEdit: true  },
  { key: "checklists",         label: "Checklists",          labelEs: "Listas",            hasEdit: true  },
  { key: "manuals",            label: "Manuals",             labelEs: "Manuales",          hasEdit: true  },
  { key: "contacts",           label: "Contacts",            labelEs: "Contactos",         hasEdit: true  },
  { key: "inventory",          label: "Inventory",           labelEs: "Inventario",        hasEdit: true  },
  { key: "laundry",            label: "Laundry",             labelEs: "Lavandería",        hasEdit: true  },
  { key: "orders",             label: "Orders",              labelEs: "Pedidos",           hasEdit: true  },
  { key: "meet-team",          label: "Meet the Team",       labelEs: "Equipo",            hasEdit: false },
  { key: "travel",             label: "Travel",              labelEs: "Viajes",            hasEdit: true  },
  { key: "calendar",           label: "Calendar",            labelEs: "Calendario",        hasEdit: true  },
  { key: "achievements",       label: "Achievements",        labelEs: "Logros",            hasEdit: false },
  { key: "profile",            label: "Profile",             labelEs: "Perfil",            hasEdit: true  },
  // ── Feature visibility toggles (not full sections) ──
  { key: "principal-location",   label: "📍 Principal Location",  labelEs: "📍 Ubicación del Principal", hasEdit: false, isFeature: true },
  // ── Calendar sub-tabs ──
  { key: "family-calendar",      label: "   ↳ Family Calendar",   labelEs: "   ↳ Calendario Familiar",   hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-travel",      label: "   ↳ Travel",            labelEs: "   ↳ Viajes",                hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-birthdays",   label: "   ↳ Birthdays",         labelEs: "   ↳ Cumpleaños",            hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-maintenance", label: "   ↳ Maintenance",       labelEs: "   ↳ Mantenimiento",         hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-deliveries",  label: "   ↳ Deliveries",        labelEs: "   ↳ Entregas",              hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-staff",       label: "   ↳ Staff Schedule",    labelEs: "   ↳ Horario del Personal",  hasEdit: false, isFeature: true, isCalendarSub: true },
];

// ─── Quick actions available on the dashboard ─────────────────────────────────
const ALL_QUICK_ACTIONS: { key: string; label: string; labelEs: string; icon: string }[] = [
  { key: "checklists",  label: "Checklists",     labelEs: "Listas",            icon: "📋" },
  { key: "orders",      label: "Orders",         labelEs: "Pedidos",           icon: "🛍️" },
  { key: "reportIssue", label: "Report Issue",   labelEs: "Reportar Problema", icon: "⚠️" },
  { key: "calendar",    label: "Calendar",       labelEs: "Calendario",        icon: "🕐" },
  { key: "tasks",       label: "Tasks",          labelEs: "Tareas",            icon: "✅" },
  { key: "maintenance", label: "Maintenance",    labelEs: "Mantenimiento",     icon: "🔧" },
  { key: "messages",    label: "Messages",       labelEs: "Mensajes",          icon: "💬" },
  { key: "inventory",   label: "Inventory",      labelEs: "Inventario",        icon: "📦" },
];

const LEVEL_OPTIONS: { value: Level; label: string; labelEs: string }[] = [
  { value: "principal",       label: "Main Family",      labelEs: "Familia Principal" },
  { value: "extended_family", label: "Extended Family",  labelEs: "Familia Extendida" },
  { value: "manager",         label: "Manager",          labelEs: "Gerente" },
  { value: "staff",           label: "Staff",            labelEs: "Personal" },
];

const ROLE_MAP: Record<string, AppRole> = {
  master_admin:    "master_admin",
  admin:           "admin",
  principal:       "principal",
  extended_family: "principal",
  manager:         "manager",
  staff:           "staff",
};

const DEPT_OPTIONS: { value: Department; label: string; labelEs: string }[] = [
  { value: "exterior", label: "Exterior",  labelEs: "Exterior" },
  { value: "interior", label: "Interior",  labelEs: "Interior" },
  { value: "kitchen",  label: "Kitchen",   labelEs: "Cocina" },
  { value: "security", label: "Security",  labelEs: "Seguridad" },
  { value: "office",   label: "Office",    labelEs: "Oficina" },
];

const LEVEL_COLORS: Record<string, string> = {
  master_admin:    "text-gold border-gold/60 bg-gold/15",
  admin:           "text-gold border-gold/40 bg-gold/10",
  principal:       "text-gold border-gold/40 bg-gold/10",
  extended_family: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  manager:         "text-blue-400 border-blue-400/40 bg-blue-400/10",
  staff:           "text-slate-300 border-slate-400/40 bg-slate-400/10",
};

const DEPT_COLORS: Record<string, string> = {
  exterior: "text-green-400",
  interior: "text-purple-400",
  kitchen:  "text-orange-400",
  security: "text-red-400",
  office:   "text-blue-400",
};

// Default section permissions based on level
function defaultPermissionsForLevel(level: Level | string): SectionPermissions {
  const base: Record<string, string[]> = {
    principal:       ["dashboard","property","messages","travel","calendar","meet-team","profile","achievements","principal-location","family-calendar"],
    extended_family: ["dashboard","messages","calendar","profile","achievements","family-calendar"],
    manager:         ["dashboard","property","maintenance","messages","tasks","checklists","manuals","contacts","inventory","laundry","orders","calendar","meet-team","profile","achievements","principal-location","family-calendar"],
    staff:           ["dashboard","maintenance","messages","tasks","checklists","manuals","laundry","calendar","profile","achievements"],
  };
  const allowed = base[level] || base["staff"];
  const perms: SectionPermissions = {};
  ALL_SECTIONS.forEach(s => {
    perms[s.key] = {
      view: allowed.includes(s.key),
      edit: allowed.includes(s.key) && (s.hasEdit ?? false),
      notifications: allowed.includes(s.key),
    };
  });
  return perms;
}

// Default quick actions per level
function defaultQuickActionsForLevel(level: Level | string): string[] {
  const base: Record<string, string[]> = {
    principal:       ["calendar", "reportIssue"],
    extended_family: ["calendar", "messages"],
    manager:         ["checklists", "orders", "reportIssue", "calendar"],
    staff:           ["checklists", "reportIssue", "tasks", "calendar"],
  };
  return base[level] || base["staff"];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetTeamSection() {
  const { language } = useLanguage();
  const { isMasterAdmin, isAdmin } = usePermissions();
  const isEN = language === "en";

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<Level | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [showTitleDropdown, setShowTitleDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const [form, setForm] = useState<AddUserForm>({
    full_name: "", email: "", job_title: "", level: "",
    department: "", role: "", start_date: "", birthday: "", notes: "",
  });

  useEffect(() => {
    loadMembers();
    loadJobTitles();
    loadProperties();
  }, []);

  async function loadMembers() {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, job_title, avatar_url, level, department, start_date, birthday, phone, notes, assigned_property_ids, section_permissions")
      .order("full_name");

    if (!profiles) return;

    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = Object.fromEntries((roles || []).map(r => [r.user_id, r.role as AppRole]));
    setMembers(profiles.map(p => ({
      ...p,
      section_permissions: (p.section_permissions as unknown as SectionPermissions) || null,
      role: roleMap[p.id] || null,
    })));
  }

  async function loadJobTitles() {
    const { data } = await supabase.from("job_title_suggestions").select("title").order("title");
    if (data) setJobTitles(data.map(d => d.title));
  }

  async function loadProperties() {
    const { data } = await supabase.from("properties").select("id, name, is_primary");
    if (data) setProperties(sortProperties(data));
  }

  useEffect(() => {
    if (!form.job_title) { setTitleSuggestions([]); return; }
    setTitleSuggestions(
      jobTitles.filter(t => t.toLowerCase().includes(form.job_title.toLowerCase())).slice(0, 6)
    );
  }, [form.job_title, jobTitles]);

  function handleLevelChange(level: Level | "") {
    setForm(f => ({
      ...f,
      level,
      role: level ? ROLE_MAP[level] : "",
      department: (level === "staff" || level === "manager") ? f.department : "",
    }));
  }

  async function handleAddUser() {
    if (!form.full_name || !form.email || !form.level || !form.role) return;
    setSaving(true);
    try {
      const { error: inviteErr } = await supabase.functions.invoke("ronin-ai", {
        body: {
          action: "invite_user",
          email: form.email,
          full_name: form.full_name,
          job_title: form.job_title,
          level: form.level,
          department: form.department || null,
          role: form.role,
          start_date: form.start_date || null,
          birthday: form.birthday || null,
          notes: form.notes || null,
        },
      });
      if (inviteErr) throw inviteErr;
      if (form.job_title && !jobTitles.includes(form.job_title)) {
        await supabase.from("job_title_suggestions").insert({ title: form.job_title }).select();
        setJobTitles(prev => [...prev, form.job_title].sort());
      }
      await loadMembers();
      setShowAdd(false);
      resetForm();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  }

  function resetForm() {
    setForm({ full_name: "", email: "", job_title: "", level: "", department: "", role: "", start_date: "", birthday: "", notes: "" });
  }

  const filtered = members.filter(m => {
    const matchSearch = !search ||
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.job_title?.toLowerCase().includes(search.toLowerCase());
    const matchLevel = filterLevel === "all" || m.level === filterLevel;
    return matchSearch && matchLevel;
  });

  const groups: Record<string, TeamMember[]> = {};
  filtered.forEach(m => {
    let key: string;
    if (m.role === "master_admin") key = "master_admin";
    else if (m.role === "admin") key = "admin";
    else key = m.level || "staff";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });
  const levelOrder = ["master_admin", "admin", "principal", "extended_family", "manager", "staff"] as const;
  const LEVEL_LABELS: Record<string, { en: string; es: string }> = {
    master_admin:    { en: "Master Admin",      es: "Master Admin" },
    admin:           { en: "Admin",             es: "Administrador" },
    principal:       { en: "Main Family",       es: "Familia Principal" },
    extended_family: { en: "Extended Family",   es: "Familia Extendida" },
    manager:         { en: "Manager",           es: "Gerente" },
    staff:           { en: "Staff",             es: "Personal" },
  };

  return (
    <div className="animate-fade-in pb-6">
      {/* Header bar */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isEN ? "Search team…" : "Buscar equipo…"}
            className="pl-8 h-9 bg-card border-border text-sm"
          />
        </div>
        {(isMasterAdmin || isAdmin) && (
          <Button
            onClick={() => setShowAdd(true)}
            size="sm"
            className="bg-gold hover:bg-gold/90 text-charcoal font-semibold gap-1.5 shrink-0"
          >
            <Plus size={14} />
            {isEN ? "Add User" : "Agregar"}
          </Button>
        )}
      </div>

      {/* Level filter chips */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
        {[{ value: "all" as const, label: isEN ? "All" : "Todos" }, ...LEVEL_OPTIONS.map(l => ({ value: l.value, label: isEN ? l.label : l.labelEs }))].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterLevel(opt.value as Level | "all")}
            className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              filterLevel === opt.value
                ? "bg-gold/20 border-gold/50 text-gold"
                : "border-border text-muted-foreground bg-card hover:border-gold/30"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Team list grouped by level */}
      <div className="px-4 space-y-5">
        {levelOrder.map(lvl => {
          const group = groups[lvl];
          if (!group?.length) return null;
          const lvlLabel = LEVEL_LABELS[lvl];
          return (
            <div key={lvl}>
              <p className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${LEVEL_COLORS[lvl].split(" ")[0]}`}>
                {isEN ? lvlLabel.en : lvlLabel.es}
                <span className="ml-2 opacity-50">{group.length}</span>
              </p>
              <div className="space-y-2">
                {group.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMember(m)}
                    className="w-full flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-gold/30 transition-all text-left"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${LEVEL_COLORS[m.role === "master_admin" ? "master_admin" : (m.level || "staff")]}`}>
                      {m.avatar_url ? (
                        <img src={imageUrl(m.avatar_url, 80, 80)} alt={m.full_name || ""} loading="lazy" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="font-display text-base text-foreground">{(m.full_name || "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-sm font-medium truncate">{m.full_name || "—"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {m.job_title && <span className="text-muted-foreground text-[11px] truncate">{m.job_title}</span>}
                        {m.department && (
                          <span className={`text-[10px] font-semibold ${DEPT_COLORS[m.department] || "text-cream/50"}`}>
                            · {m.department}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <UsersRound size={36} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">{isEN ? "No team members yet" : "Sin miembros aún"}</p>
          </div>
        )}
      </div>

      {/* ── Add User Modal ─────────────────────────────────────────────────── */}
      {showAdd && (
        <AddUserModal
          isEN={isEN}
          jobTitles={jobTitles}
          properties={properties}
          onClose={() => { setShowAdd(false); resetForm(); }}
          onSaved={async () => { await loadMembers(); setShowAdd(false); resetForm(); }}
        />
      )}

      {/* ── Member Edit Drawer ─────────────────────────────────────────────── */}
      {selectedMember && (
      <MemberEditDrawer
          member={selectedMember}
          properties={properties}
          isEN={isEN}
          canEdit={isMasterAdmin || isAdmin}
          isMasterAdmin={isMasterAdmin}
          onClose={() => setSelectedMember(null)}
          onDeleted={async () => { await loadMembers(); setSelectedMember(null); }}
          onSaved={async (updated) => {
            await loadMembers();
            setSelectedMember(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Property Toggle Pills ─────────────────────────────────────────────────────
function PropertyToggles({ properties, assignedProps, onChange, disabled = false }: {
  properties: Property[];
  assignedProps: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  if (properties.length === 0) return <p className="text-muted-foreground text-xs">No properties yet</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {properties.map(p => {
        const on = assignedProps.includes(p.id);
        return (
          <button
            key={p.id}
            disabled={disabled}
            onClick={() => onChange(on ? assignedProps.filter(id => id !== p.id) : [...assignedProps, p.id])}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 ${
              on
                ? "bg-green-500/20 border-green-500/60 text-green-400"
                : "bg-charcoal-light border-charcoal-light text-cream/40 hover:border-cream/30 hover:text-cream/60"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {on && <Check size={11} />}
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

// ─── Quick Action Toggles ──────────────────────────────────────────────────────
function QuickActionToggles({ isEN, enabledKeys, onChange, disabled = false }: {
  isEN: boolean;
  enabledKeys: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs mb-3">
        {isEN
          ? "Choose which shortcuts appear on this user's dashboard."
          : "Elige qué accesos directos aparecen en el panel de este usuario."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {ALL_QUICK_ACTIONS.map(qa => {
          const on = enabledKeys.includes(qa.key);
          return (
            <button
              key={qa.key}
              disabled={disabled}
              onClick={() => onChange(on ? enabledKeys.filter(k => k !== qa.key) : [...enabledKeys, qa.key])}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-xs font-medium transition-all ${
                on
                  ? "bg-gold/15 border-gold/50 text-gold"
                  : "bg-charcoal-light border-charcoal-light text-cream/40 hover:border-cream/30 hover:text-cream/60"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="text-base leading-none">{qa.icon}</span>
              <span className="flex-1">{isEN ? qa.label : qa.labelEs}</span>
              {on && <Check size={11} className="shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Add User Modal ────────────────────────────────────────────────────────────
function AddUserModal({ isEN, jobTitles, properties, onClose, onSaved }: {
  isEN: boolean;
  jobTitles: string[];
  properties: Property[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"details" | "access" | "quickactions">("details");
  const [noLogin, setNoLogin] = useState(false);
  const [form, setForm] = useState<AddUserForm>({
    full_name: "", email: "", job_title: "", level: "",
    department: "", role: "", start_date: "", birthday: "", notes: "",
  });
  const [phone, setPhone] = useState("");
  const [assignedProps, setAssignedProps] = useState<string[]>([]);
  const [perms, setPerms] = useState<SectionPermissions>({});
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [showTitleDropdown, setShowTitleDropdown] = useState(false);

  useEffect(() => {
    if (!form.job_title) { setTitleSuggestions([]); return; }
    setTitleSuggestions(
      jobTitles.filter(t => t.toLowerCase().includes(form.job_title.toLowerCase())).slice(0, 6)
    );
  }, [form.job_title, jobTitles]);

  function handleLevelChange(level: Level | "") {
    setForm(f => ({
      ...f, level,
      role: level ? ROLE_MAP[level] : "",
      department: (level === "staff" || level === "manager") ? f.department : "",
    }));
    if (level) {
      setPerms(defaultPermissionsForLevel(level));
      setQuickActions(defaultQuickActionsForLevel(level));
    }
  }

  function togglePerm(sectionKey: string, field: keyof SectionPerm) {
    setPerms(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [field]: !prev[sectionKey]?.[field],
        ...(field === "view" && prev[sectionKey]?.view ? { edit: false, notifications: false } : {}),
      },
    }));
  }

  async function handleSubmit() {
    if (!form.full_name || !form.level || !form.role) return;
    if (!noLogin && !form.email) return;
    setSaving(true);
    try {
      const finalPerms = Object.keys(perms).length > 0
        ? { ...perms, _quick_actions: quickActions as unknown as SectionPerm }
        : null;

      if (noLogin) {
        // Create profile-only record via edge function (needs service role to bypass RLS)
        const { error: fnErr } = await supabase.functions.invoke("ronin-ai", {
          body: {
            action: "create_profile_only",
            full_name: form.full_name,
            job_title: form.job_title || null,
            phone: phone || null,
            level: form.level,
            department: form.department || null,
            role: form.role,
            start_date: form.start_date || null,
            birthday: form.birthday || null,
            notes: form.notes || null,
            assigned_property_ids: assignedProps,
            section_permissions: finalPerms as any,
          },
        });
        if (fnErr) throw fnErr;
      } else {
        await supabase.functions.invoke("ronin-ai", {
          body: {
            action: "invite_user",
            email: form.email,
            full_name: form.full_name,
            job_title: form.job_title,
            level: form.level,
            department: form.department || null,
            role: form.role,
            start_date: form.start_date || null,
            birthday: form.birthday || null,
            notes: form.notes || null,
            phone: phone || null,
            assigned_property_ids: assignedProps,
            section_permissions: finalPerms,
          },
        });
      }
      onSaved();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  const TABS = [
    { key: "details",      label: isEN ? "Details" : "Detalles" },
    { key: "access",       label: isEN ? "Access & Alerts" : "Acceso" },
    { key: "quickactions", label: isEN ? "Quick Actions" : "Acciones" },
  ] as const;

  const canSave = form.full_name && form.level && (noLogin || form.email);

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-charcoal rounded-t-2xl sm:rounded-2xl w-full max-w-lg flex flex-col shadow-2xl border border-charcoal-light h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-charcoal-light shrink-0">
          <div>
            <h2 className="text-cream font-display text-lg">{isEN ? "Add Team Member" : "Agregar Miembro"}</h2>
            <p className="text-muted-foreground text-xs mt-0.5">{isEN ? "Fields marked * are required" : "Campos marcados * son obligatorios"}</p>
          </div>
          <button onClick={onClose} className="text-cream/50 hover:text-cream"><X size={20} /></button>
        </div>

        {/* No-login toggle */}
        <div className="px-5 py-3 border-b border-charcoal-light shrink-0">
          <button
            type="button"
            onClick={() => setNoLogin(v => !v)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-colors ${noLogin ? "bg-gold/10 border-gold/40 text-gold" : "bg-charcoal-light border-charcoal-light text-cream/50 hover:text-cream"}`}
          >
            <span className="text-xs font-semibold">{isEN ? "No login needed (family / profile only)" : "Sin inicio de sesión (perfil familiar)"}</span>
            <div className={`w-9 h-5 rounded-full border-2 relative transition-all ${noLogin ? "bg-gold border-gold" : "border-charcoal-light"}`}>
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${noLogin ? "left-4" : "left-0.5"}`} />
            </div>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-charcoal-light shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-[11px] font-semibold tracking-widest uppercase transition-colors ${tab === t.key ? "text-gold border-b-2 border-gold" : "text-muted-foreground hover:text-cream"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "details" && (
            <div className="px-5 py-4 space-y-4">
              <div>
                <FieldLabel label={isEN ? "Full Name *" : "Nombre Completo *"} />
                <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder={isEN ? "Jane Smith" : "Ana García"} className="bg-charcoal-light border-charcoal-light text-cream" />
              </div>

              {!noLogin && (
                <div>
                  <FieldLabel label={isEN ? "Email *" : "Correo *"} />
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" className="bg-charcoal-light border-charcoal-light text-cream" />
                </div>
              )}

              <div className="relative">
                <FieldLabel label={isEN ? "Job Title" : "Puesto"} />
                <Input
                  value={form.job_title}
                  onChange={e => { setForm(f => ({ ...f, job_title: e.target.value })); setShowTitleDropdown(true); }}
                  onFocus={() => setShowTitleDropdown(true)}
                  onBlur={() => setTimeout(() => setShowTitleDropdown(false), 150)}
                  placeholder={isEN ? "e.g. Estate Manager" : "ej. Gerente"}
                  className="bg-charcoal-light border-charcoal-light text-cream"
                />
                {showTitleDropdown && titleSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-charcoal border border-charcoal-light rounded-xl overflow-hidden shadow-xl">
                    {titleSuggestions.map(t => (
                      <button key={t} onMouseDown={() => setForm(f => ({ ...f, job_title: t }))} className="w-full text-left px-4 py-2.5 text-sm text-cream hover:bg-charcoal-light">
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <FieldLabel label={isEN ? "Phone" : "Teléfono"} />
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="bg-charcoal-light border-charcoal-light text-cream" />
              </div>

              <div>
                <FieldLabel label={isEN ? "Level *" : "Nivel *"} />
                <div className="grid grid-cols-2 gap-2">
                  {LEVEL_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleLevelChange(opt.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${form.level === opt.value ? `${LEVEL_COLORS[opt.value]} border-current` : "border-charcoal-light text-cream/50 hover:text-cream bg-charcoal-light"}`}>
                      {form.level === opt.value && <Check size={13} />}
                      {isEN ? opt.label : opt.labelEs}
                    </button>
                  ))}
                </div>
              </div>

              {(form.level === "staff" || form.level === "manager") && (
                <div>
                  <FieldLabel label={isEN ? "Department" : "Departamento"} />
                  <div className="flex flex-wrap gap-2">
                    {DEPT_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setForm(f => ({ ...f, department: f.department === opt.value ? "" : opt.value }))}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.department === opt.value ? `${DEPT_COLORS[opt.value]} border-current bg-current/10` : "border-charcoal-light text-cream/50 hover:text-cream bg-charcoal-light"}`}>
                        {isEN ? opt.label : opt.labelEs}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <FieldLabel label={isEN ? "Assigned Properties" : "Propiedades Asignadas"} />
                <PropertyToggles properties={properties} assignedProps={assignedProps} onChange={setAssignedProps} />
              </div>

              <div>
                <FieldLabel label={isEN ? "Start Date" : "Fecha de Inicio"} />
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="bg-charcoal-light border-charcoal-light text-cream" />
              </div>

              <div>
                <FieldLabel label={isEN ? "Birthday" : "Cumpleaños"} />
                <Input type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} className="bg-charcoal-light border-charcoal-light text-cream" />
              </div>

              <div>
                <FieldLabel label={isEN ? "Notes" : "Notas"} />
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-charcoal-light border border-charcoal-light rounded-lg px-3 py-2 text-cream text-sm resize-none outline-none focus:border-gold/40 placeholder:text-cream/30 transition-colors"
                />
              </div>
            </div>
          )}

          {tab === "access" && (
            <div className="px-5 py-4">
              {Object.keys(perms).length === 0 && (
                <div className="mb-4 p-3 bg-charcoal-light rounded-lg">
                  <p className="text-muted-foreground text-xs">{isEN ? "Select a level on the Details tab to auto-populate permissions, or toggle manually below." : "Selecciona un nivel en Detalles para cargar permisos, o actívalos manualmente."}</p>
                </div>
              )}
              {Object.keys(perms).length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-muted-foreground text-xs">{isEN ? "Toggle per-section access and notifications" : "Activa acceso y alertas por sección"}</p>
                  {form.level && (
                    <button onClick={() => setPerms(defaultPermissionsForLevel(form.level as Level))} className="text-[10px] text-gold hover:text-gold/80 border border-gold/30 rounded px-2 py-1 transition-colors">
                      {isEN ? "Reset to defaults" : "Valores por defecto"}
                    </button>
                  )}
                </div>
              )}

              {/* Column headers */}
              <div className="flex items-center gap-1 mb-2 pr-1">
                <div className="flex-1" />
                <div className="w-10 flex flex-col items-center gap-0.5">
                  <Eye size={12} className="text-blue-400" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{isEN ? "View" : "Ver"}</span>
                </div>
                <div className="w-10 flex flex-col items-center gap-0.5">
                  <Pencil size={12} className="text-green-400" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{isEN ? "Edit" : "Editar"}</span>
                </div>
                <div className="w-10 flex flex-col items-center gap-0.5">
                  <Bell size={12} className="text-gold" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{isEN ? "Alerts" : "Alertas"}</span>
                </div>
              </div>

              <div className="space-y-1">
                {ALL_SECTIONS.map((section, idx) => {
                  const sp = perms[section.key] || { view: false, edit: false, notifications: false };
                  const prevSection = ALL_SECTIONS[idx - 1];
                  const showDivider = section.isFeature && prevSection && !prevSection.isFeature;
                  return (
                    <div key={section.key}>
                      {showDivider && (
                        <div className="flex items-center gap-2 my-3">
                          <div className="flex-1 h-px bg-charcoal-light" />
                          <span className="text-[9px] uppercase tracking-widest text-gold/60 font-semibold">
                            {isEN ? "Feature Visibility" : "Visibilidad de funciones"}
                          </span>
                          <div className="flex-1 h-px bg-charcoal-light" />
                        </div>
                      )}
                      <div className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${sp.view ? "bg-charcoal-light" : "opacity-50"}`}>
                        <span className="flex-1 text-cream text-xs font-medium">{isEN ? section.label : section.labelEs}</span>
                        <div className="w-10 flex justify-center">
                          <button onClick={() => togglePerm(section.key, "view")}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${sp.view ? "bg-blue-400/20 border-blue-400/50 text-blue-400" : "border-charcoal-light text-transparent"}`}>
                            <Check size={11} />
                          </button>
                        </div>
                        <div className="w-10 flex justify-center">
                          <button onClick={() => section.hasEdit && sp.view && togglePerm(section.key, "edit")}
                            disabled={!section.hasEdit || !sp.view}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${sp.edit ? "bg-green-400/20 border-green-400/50 text-green-400" : "border-charcoal-light text-transparent"} disabled:opacity-30`}>
                            <Check size={11} />
                          </button>
                        </div>
                        <div className="w-10 flex justify-center">
                          <button onClick={() => sp.view && togglePerm(section.key, "notifications")}
                            disabled={!sp.view}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${sp.notifications ? "bg-gold/20 border-gold/50 text-gold" : "border-charcoal-light text-transparent"} disabled:opacity-30`}>
                            <Check size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "quickactions" && (
            <div className="px-5 py-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-gold" />
                  <p className="text-cream text-sm font-semibold">{isEN ? "Dashboard Shortcuts" : "Accesos del Panel"}</p>
                </div>
                {form.level && (
                  <button
                    onClick={() => setQuickActions(defaultQuickActionsForLevel(form.level as Level))}
                    className="text-[10px] text-gold hover:text-gold/80 border border-gold/30 rounded px-2 py-1 transition-colors"
                  >
                    {isEN ? "Reset to defaults" : "Valores por defecto"}
                  </button>
                )}
              </div>
              <QuickActionToggles
                isEN={isEN}
                enabledKeys={quickActions}
                onChange={setQuickActions}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-charcoal-light flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-charcoal-light text-cream hover:bg-charcoal-light">
            {isEN ? "Cancel" : "Cancelar"}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSave}
            className="flex-1 bg-gold hover:bg-gold/90 text-charcoal font-semibold">
            {saving
              ? <Loader2 size={16} className="animate-spin" />
              : noLogin
                ? (isEN ? "Save Profile" : "Guardar Perfil")
                : (isEN ? "Send Invite" : "Invitar")}
          </Button>
        </div>
      </div>
    </div>
  );
}
// ─── Member Edit Drawer ────────────────────────────────────────────────────────
function MemberEditDrawer({ member, properties, isEN, canEdit, isMasterAdmin, onClose, onSaved, onDeleted }: {
  member: TeamMember;
  properties: Property[];
  isEN: boolean;
  canEdit: boolean;
  isMasterAdmin: boolean;
  onClose: () => void;
  onSaved: (updated: TeamMember) => void;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<"details" | "access" | "quickactions">("details");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);

  // Edit state
  const [fullName, setFullName] = useState(member.full_name || "");
  const [jobTitle, setJobTitle] = useState(member.job_title || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [level, setLevel] = useState<Level | "">(member.level as Level || "");
  const [department, setDepartment] = useState<Department | "">(member.department as Department || "");
  const [startDate, setStartDate] = useState(member.start_date || "");
  const [birthday, setBirthday] = useState(member.birthday || "");
  const [notes, setNotes] = useState(member.notes || "");
  const [assignedProps, setAssignedProps] = useState<string[]>(member.assigned_property_ids || []);

  // Principal designation toggle — only relevant when level = principal
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [principalLoading, setPrincipalLoading] = useState(false);

  // Load current principal from system_settings on mount
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("system_settings").select("value").eq("key", "principal_user_id").maybeSingle()
      .then(({ data }: { data: { value: string } | null }) => {
        if (data?.value === member.id) setIsPrincipal(true);
      });
  }, [member.id]);

  // Section permissions — seed from DB or derive from level defaults
  const [perms, setPerms] = useState<SectionPermissions>(() => {
    if (member.section_permissions && Object.keys(member.section_permissions).length > 0) {
      const base = defaultPermissionsForLevel(member.level || "staff");
      return { ...base, ...member.section_permissions };
    }
    return defaultPermissionsForLevel(member.level || "staff");
  });

  // Quick actions — read from _quick_actions key in section_permissions
  const [quickActions, setQuickActions] = useState<string[]>(() => {
    const stored = member.section_permissions?.["_quick_actions"];
    if (Array.isArray(stored)) return stored;
    // Cast as any since it's stored as SectionPerm type in the map
    const asAny = stored as unknown;
    if (Array.isArray(asAny)) return asAny as string[];
    return defaultQuickActionsForLevel(member.level || "staff");
  });

  function togglePerm(sectionKey: string, field: keyof SectionPerm) {
    setPerms(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [field]: !prev[sectionKey]?.[field],
        // If turning off view, also turn off edit & notifications
        ...(field === "view" && prev[sectionKey]?.view ? { edit: false, notifications: false } : {}),
      },
    }));
  }

  function applyLevelDefaults() {
    if (level) {
      setPerms(defaultPermissionsForLevel(level));
      setQuickActions(defaultQuickActionsForLevel(level));
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ronin-ai", {
        body: { action: "delete_user", target_user_id: member.id },
      });
      if (error) {
        let msg = "Failed to delete user.";
        try {
          const parsed = typeof error.message === "string" && error.message.startsWith("{")
            ? JSON.parse(error.message)
            : null;
          if (parsed?.error) msg = parsed.error;
          else if (error.message) msg = error.message;
        } catch { /* use default */ }
        console.error("Delete user error:", msg);
        import("sonner").then(({ toast }) => toast.error(msg));
        setDeleting(false);
        return;
      }
      onDeleted();
    } catch (e) {
      console.error("Delete user exception:", e);
      import("sonner").then(({ toast }) => toast.error("An unexpected error occurred."));
    }
    setDeleting(false);
  }

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    try {
      // Never downgrade a master_admin — if the member's current role is master_admin, preserve it
      const resolvedRole = level ? (ROLE_MAP[level] ?? member.role ?? "staff") : (member.role ?? "staff");
      const roleToSet: AppRole = (member.role === "master_admin" ? "master_admin" : resolvedRole) as AppRole;

      // Merge quick actions into perms under a special key
      const finalPerms = {
        ...perms,
        _quick_actions: quickActions as unknown as SectionPerm,
      };

      // Update profile
      await supabase.from("profiles").update({
        full_name: fullName,
        job_title: jobTitle,
        phone: phone || null,
        level,
        department: (level === "staff" || level === "manager") ? (department || null) : null,
        start_date: startDate || null,
        birthday: birthday || null,
        notes: notes || null,
        assigned_property_ids: assignedProps,
        section_permissions: finalPerms as unknown as import("@/integrations/supabase/types").Json,
      }).eq("id", member.id);

      // Update role if changed
      if (roleToSet !== member.role) {
        await supabase.from("user_roles").update({ role: roleToSet }).eq("user_id", member.id);
      }

      onSaved({ ...member, full_name: fullName, job_title: jobTitle, phone, level, department, notes, assigned_property_ids: assignedProps, section_permissions: finalPerms, role: roleToSet });
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  const lvlInfo = LEVEL_OPTIONS.find(l => l.value === (member.level as Level));

  async function handleResendInvitation() {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("ronin-ai", {
        body: { action: "resend_invitation", target_user_id: member.id },
      });
      if (error) throw error;
      toast.success(isEN ? "Invitation resent!" : "¡Invitación reenviada!", {
        description: isEN ? "A fresh invite link has been sent to their email." : "Se envió un nuevo enlace de invitación.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to resend invitation.";
      toast.error(msg);
    }
    setResending(false);
  }

  const TABS = [
    { key: "details",      label: isEN ? "Details" : "Detalles" },
    { key: "access",       label: isEN ? "Access & Alerts" : "Acceso" },
    { key: "quickactions", label: isEN ? "Quick Actions" : "Acciones" },
  ] as const;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-charcoal rounded-t-2xl sm:rounded-2xl w-full max-w-lg flex flex-col shadow-2xl border border-charcoal-light h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden">


        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-charcoal-light shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border shrink-0 ${LEVEL_COLORS[member.level || "staff"]}`}>
              {member.avatar_url
                ? <img src={member.avatar_url} className="w-full h-full rounded-full object-cover" />
                : <span className="font-display text-base">{(member.full_name || "?")[0].toUpperCase()}</span>
              }
            </div>
            <div>
              <p className="text-cream font-semibold text-sm leading-none">{member.full_name || "—"}</p>
              {lvlInfo && <p className={`text-[10px] tracking-widest uppercase mt-0.5 ${LEVEL_COLORS[member.level || "staff"].split(" ")[0]}`}>{isEN ? lvlInfo.label : lvlInfo.labelEs}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-cream/50 hover:text-cream"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-charcoal-light shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-[11px] font-semibold tracking-widest uppercase transition-colors ${tab === t.key ? "text-gold border-b-2 border-gold" : "text-muted-foreground hover:text-cream"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "details" && (
            <div className="px-5 py-4 space-y-4">
              <EditField label={isEN ? "Full Name" : "Nombre"} value={fullName} onChange={setFullName} disabled={!canEdit} />
              <EditField label={isEN ? "Job Title" : "Puesto"} value={jobTitle} onChange={setJobTitle} disabled={!canEdit} />
              <EditField label={isEN ? "Phone" : "Teléfono"} value={phone} onChange={setPhone} disabled={!canEdit} type="tel" />

              {/* Level */}
              {canEdit && (
                <>
                  <FieldLabel label={isEN ? "Level" : "Nivel"} />
                  <div className="grid grid-cols-2 gap-2">
                    {LEVEL_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setLevel(opt.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${level === opt.value ? `${LEVEL_COLORS[opt.value]} border-current` : "border-charcoal-light text-cream/50 hover:text-cream bg-charcoal-light"}`}>
                        {level === opt.value && <Check size={12} />}
                        {isEN ? opt.label : opt.labelEs}
                      </button>
                    ))}
                  </div>

                  {/* Principal designation — only visible when level is Main Family */}
                  {level === "principal" && (
                    <div
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${isPrincipal ? "bg-gold/10 border-gold/50" : "bg-charcoal-light border-charcoal-light hover:border-cream/20"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">👑</span>
                        <div>
                          <p className={`text-sm font-semibold ${isPrincipal ? "text-gold" : "text-cream/70"}`}>
                            {isEN ? "Principal" : "Principal"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {isEN ? "Shown as primary location on dashboard" : "Aparece como ubicación principal en el panel"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={principalLoading}
                        onClick={async () => {
                          setPrincipalLoading(true);
                          try {
                            if (isPrincipal) {
                              // Remove designation
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              await (supabase as any).from("system_settings").delete().eq("key", "principal_user_id");
                              setIsPrincipal(false);
                            } else {
                              // Set this user as principal
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              await (supabase as any).from("system_settings").upsert({
                                key: "principal_user_id",
                                value: member.id,
                                updated_at: new Date().toISOString(),
                              });
                              setIsPrincipal(true);
                            }
                          } catch (e) { console.error(e); }
                          setPrincipalLoading(false);
                        }}
                        className={`relative w-11 h-6 rounded-full border-2 transition-all shrink-0 ${isPrincipal ? "bg-gold border-gold" : "bg-transparent border-charcoal-light"} disabled:opacity-50`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isPrincipal ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>
                  )}

                  {(level === "staff" || level === "manager") && (
                    <>
                      <FieldLabel label={isEN ? "Department" : "Departamento"} />
                      <div className="flex flex-wrap gap-2">
                        {DEPT_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => setDepartment(p => p === opt.value ? "" : opt.value)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${department === opt.value ? `${DEPT_COLORS[opt.value]} border-current bg-current/10` : "border-charcoal-light text-cream/50 hover:text-cream bg-charcoal-light"}`}>
                            {isEN ? opt.label : opt.labelEs}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Assigned properties */}
              {canEdit && (
                <>
                  <FieldLabel label={isEN ? "Assigned Properties" : "Propiedades Asignadas"} />
                  <PropertyToggles
                    properties={properties}
                    assignedProps={assignedProps}
                    onChange={setAssignedProps}
                  />
                </>
              )}

              {/* Dates */}
              <EditField label={isEN ? "Start Date" : "Fecha de Inicio"} value={startDate} onChange={setStartDate} disabled={!canEdit} type="date" />
              <EditField label={isEN ? "Birthday" : "Cumpleaños"} value={birthday} onChange={setBirthday} disabled={!canEdit} type="date" />

              <FieldLabel label={isEN ? "Notes" : "Notas"} />
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={!canEdit}
                rows={3}
                className="w-full bg-charcoal-light border border-charcoal-light rounded-lg px-3 py-2 text-cream text-sm resize-none outline-none focus:border-gold/40 placeholder:text-cream/30 transition-colors disabled:opacity-50"
              />
            </div>
          )}

          {tab === "access" && (
            <div className="px-5 py-4">
              {/* Reset to level defaults button */}
              {canEdit && (
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-muted-foreground text-xs">{isEN ? "Toggle per-section access and notifications" : "Activa acceso y alertas por sección"}</p>
                  <button onClick={applyLevelDefaults} className="text-[10px] text-gold hover:text-gold/80 border border-gold/30 rounded px-2 py-1 transition-colors">
                    {isEN ? "Reset to defaults" : "Valores por defecto"}
                  </button>
                </div>
              )}

              {/* Column headers */}
              <div className="flex items-center gap-1 mb-2 pr-1">
                <div className="flex-1" />
                <div className="w-10 flex flex-col items-center gap-0.5">
                  <Eye size={12} className="text-blue-400" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{isEN ? "View" : "Ver"}</span>
                </div>
                <div className="w-10 flex flex-col items-center gap-0.5">
                  <Pencil size={12} className="text-green-400" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{isEN ? "Edit" : "Editar"}</span>
                </div>
                <div className="w-10 flex flex-col items-center gap-0.5">
                  <Bell size={12} className="text-gold" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{isEN ? "Alerts" : "Alertas"}</span>
                </div>
              </div>

              <div className="space-y-1">
                {ALL_SECTIONS.map(section => {
                  const sp = perms[section.key] || { view: false, edit: false, notifications: false };
                  return (
                    <div key={section.key} className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${sp.view ? "bg-charcoal-light" : "opacity-50"}`}>
                      <span className="flex-1 text-cream text-xs font-medium">{isEN ? section.label : section.labelEs}</span>
                      {/* View */}
                      <div className="w-10 flex justify-center">
                        <button
                          onClick={() => canEdit && togglePerm(section.key, "view")}
                          disabled={!canEdit}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${sp.view ? "bg-blue-400/20 border-blue-400/50 text-blue-400" : "border-charcoal-light text-transparent"}`}
                        >
                          <Check size={11} />
                        </button>
                      </div>
                      {/* Edit */}
                      <div className="w-10 flex justify-center">
                        <button
                          onClick={() => canEdit && section.hasEdit && sp.view && togglePerm(section.key, "edit")}
                          disabled={!canEdit || !section.hasEdit || !sp.view}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${sp.edit ? "bg-green-400/20 border-green-400/50 text-green-400" : "border-charcoal-light text-transparent"} disabled:opacity-30`}
                        >
                          <Check size={11} />
                        </button>
                      </div>
                      {/* Notifications */}
                      <div className="w-10 flex justify-center">
                        <button
                          onClick={() => canEdit && sp.view && togglePerm(section.key, "notifications")}
                          disabled={!canEdit || !sp.view}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${sp.notifications ? "bg-gold/20 border-gold/50 text-gold" : "border-charcoal-light text-transparent"} disabled:opacity-30`}
                        >
                          <Check size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "quickactions" && (
            <div className="px-5 py-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-gold" />
                  <p className="text-cream text-sm font-semibold">{isEN ? "Dashboard Shortcuts" : "Accesos del Panel"}</p>
                </div>
                {canEdit && level && (
                  <button
                    onClick={applyLevelDefaults}
                    className="text-[10px] text-gold hover:text-gold/80 border border-gold/30 rounded px-2 py-1 transition-colors"
                  >
                    {isEN ? "Reset to defaults" : "Valores por defecto"}
                  </button>
                )}
              </div>
              <QuickActionToggles
                isEN={isEN}
                enabledKeys={quickActions}
                onChange={canEdit ? setQuickActions : () => {}}
                disabled={!canEdit}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="shrink-0 px-5 py-4 border-t border-charcoal-light space-y-2">
            {/* Resend invitation */}
            <Button
              variant="outline"
              disabled={resending || saving || deleting}
              onClick={handleResendInvitation}
              className="w-full bg-charcoal-light border border-gold/40 text-gold hover:bg-gold/10 hover:border-gold gap-2 font-semibold"
            >
              {resending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              {resending
                ? (isEN ? "Sending…" : "Enviando…")
                : (isEN ? "Resend Invitation" : "Reenviar Invitación")}
            </Button>

            <Button onClick={handleSave} disabled={saving || deleting} className="w-full bg-gold hover:bg-gold/90 text-charcoal font-semibold">
              {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
              {saving ? (isEN ? "Saving…" : "Guardando…") : (isEN ? "Save Changes" : "Guardar Cambios")}
            </Button>
            {isMasterAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={deleting} className="w-full border-destructive/40 text-destructive hover:bg-destructive/10">
                    {deleting ? <Loader2 size={16} className="animate-spin mr-2" /> : <Trash2 size={16} className="mr-2" />}
                    {isEN ? "Delete User" : "Eliminar Usuario"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{isEN ? "Delete User?" : "¿Eliminar usuario?"}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {isEN
                        ? `This will permanently delete ${member.full_name || "this user"} and all their data. This cannot be undone.`
                        : `Esto eliminará permanentemente a ${member.full_name || "este usuario"} y todos sus datos. Esta acción no se puede deshacer.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{isEN ? "Cancel" : "Cancelar"}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isEN ? "Delete" : "Eliminar"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
function FieldLabel({ label }: { label: string }) {
  return <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block">{label}</label>;
}

function EditField({ label, value, onChange, disabled, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; type?: string;
}) {
  return (
    <div>
      <FieldLabel label={label} />
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="bg-charcoal-light border-charcoal-light text-cream disabled:opacity-50"
      />
    </div>
  );
}
