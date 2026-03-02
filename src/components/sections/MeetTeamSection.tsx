import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  UsersRound, Plus, Search, ChevronRight,
  User, Briefcase, Building2, Calendar, X, Check, ChevronDown,
  Eye, Pencil, Bell, Save, Loader2, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

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
const ALL_SECTIONS: { key: string; label: string; labelEs: string; hasEdit?: boolean }[] = [
  { key: "dashboard",    label: "Dashboard",    labelEs: "Panel",        hasEdit: false },
  { key: "property",     label: "Property",     labelEs: "Propiedad",    hasEdit: true  },
  { key: "maintenance",  label: "Maintenance",  labelEs: "Mantenimiento",hasEdit: true  },
  { key: "messages",     label: "Messages",     labelEs: "Mensajes",     hasEdit: true  },
  { key: "tasks",        label: "Tasks",        labelEs: "Tareas",       hasEdit: true  },
  { key: "manuals",      label: "Manuals",      labelEs: "Manuales",     hasEdit: true  },
  { key: "contacts",     label: "Contacts",     labelEs: "Contactos",    hasEdit: true  },
  { key: "inventory",    label: "Inventory",    labelEs: "Inventario",   hasEdit: true  },
  { key: "laundry",      label: "Laundry",      labelEs: "Lavandería",   hasEdit: true  },
  { key: "orders",       label: "Orders",       labelEs: "Pedidos",      hasEdit: true  },
  { key: "meet-team",    label: "Meet the Team",labelEs: "Equipo",       hasEdit: false },
  { key: "travel",       label: "Travel",       labelEs: "Viajes",       hasEdit: true  },
  { key: "calendar",     label: "Calendar",     labelEs: "Calendario",   hasEdit: true  },
  { key: "achievements", label: "Achievements", labelEs: "Logros",       hasEdit: false },
  { key: "profile",      label: "Profile",      labelEs: "Perfil",       hasEdit: true  },
];

const LEVEL_OPTIONS: { value: Level; label: string; labelEs: string }[] = [
  { value: "principal",       label: "Main Family",      labelEs: "Familia Principal" },
  { value: "extended_family", label: "Extended Family",  labelEs: "Familia Extendida" },
  { value: "manager",         label: "Manager",          labelEs: "Gerente" },
  { value: "staff",           label: "Staff",            labelEs: "Personal" },
];

const ROLE_MAP: Record<Level, AppRole> = {
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
  principal:       "text-gold border-gold/40 bg-gold/10",
  extended_family: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  manager:         "text-blue-400 border-blue-400/40 bg-blue-400/10",
  staff:           "text-cream/60 border-cream/20 bg-cream/5",
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
    principal:       ["dashboard","property","messages","travel","calendar","meet-team","profile","achievements"],
    extended_family: ["dashboard","messages","calendar","profile","achievements"],
    manager:         ["dashboard","property","maintenance","messages","tasks","manuals","contacts","inventory","laundry","orders","calendar","meet-team","profile","achievements"],
    staff:           ["dashboard","maintenance","messages","tasks","manuals","laundry","calendar","profile","achievements"],
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
    const { data } = await supabase.from("properties").select("id, name").order("name");
    if (data) setProperties(data);
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
    const key = m.level || "staff";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });
  const levelOrder: Level[] = ["principal", "extended_family", "manager", "staff"];

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
          const lvlInfo = LEVEL_OPTIONS.find(l => l.value === lvl)!;
          return (
            <div key={lvl}>
              <p className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${LEVEL_COLORS[lvl].split(" ")[0]}`}>
                {isEN ? lvlInfo.label : lvlInfo.labelEs}
                <span className="ml-2 opacity-50">{group.length}</span>
              </p>
              <div className="space-y-2">
                {group.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMember(m)}
                    className="w-full flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-gold/30 transition-all text-left"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${LEVEL_COLORS[m.level || "staff"]}`}>
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.full_name || ""} className="w-full h-full rounded-full object-cover" />
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

// ─── Add User Modal ────────────────────────────────────────────────────────────
function AddUserModal({ isEN, jobTitles, onClose, onSaved }: {
  isEN: boolean;
  jobTitles: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AddUserForm>({
    full_name: "", email: "", job_title: "", level: "",
    department: "", role: "", start_date: "", birthday: "", notes: "",
  });
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
  }

  async function handleSubmit() {
    if (!form.full_name || !form.email || !form.level || !form.role) return;
    setSaving(true);
    try {
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
        },
      });
      onSaved();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-charcoal rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border border-charcoal-light">
        <div className="flex items-center justify-between px-5 py-4 border-b border-charcoal-light sticky top-0 bg-charcoal z-10">
          <div>
            <h2 className="text-cream font-display text-lg">{isEN ? "Add Team Member" : "Agregar Miembro"}</h2>
            <p className="text-muted-foreground text-xs mt-0.5">{isEN ? "Mandatory fields marked *" : "Campos obligatorios *"}</p>
          </div>
          <button onClick={onClose} className="text-cream/50 hover:text-cream"><X size={20} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <FieldLabel label={isEN ? "Full Name *" : "Nombre Completo *"} />
          <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder={isEN ? "Jane Smith" : "Ana García"} className="bg-charcoal-light border-charcoal-light text-cream" />

          <FieldLabel label={isEN ? "Email *" : "Correo *"} />
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" className="bg-charcoal-light border-charcoal-light text-cream" />

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

          {(form.level === "staff" || form.level === "manager") && (
            <>
              <FieldLabel label={isEN ? "Department" : "Departamento"} />
              <div className="flex flex-wrap gap-2">
                {DEPT_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setForm(f => ({ ...f, department: f.department === opt.value ? "" : opt.value }))}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.department === opt.value ? `${DEPT_COLORS[opt.value]} border-current bg-current/10` : "border-charcoal-light text-cream/50 hover:text-cream bg-charcoal-light"}`}>
                    {isEN ? opt.label : opt.labelEs}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2 pb-2">
            <Button variant="outline" onClick={onClose} className="flex-1 border-charcoal-light text-cream hover:bg-charcoal-light">
              {isEN ? "Cancel" : "Cancelar"}
            </Button>
            <Button onClick={handleSubmit} disabled={saving || !form.full_name || !form.email || !form.level}
              className="flex-1 bg-gold hover:bg-gold/90 text-charcoal font-semibold">
              {saving ? <Loader2 size={16} className="animate-spin" /> : (isEN ? "Send Invite" : "Invitar")}
            </Button>
          </div>
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
  const [tab, setTab] = useState<"details" | "access">("details");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  // Section permissions — seed from DB or derive from level defaults
  const [perms, setPerms] = useState<SectionPermissions>(() => {
    if (member.section_permissions && Object.keys(member.section_permissions).length > 0) {
      // Ensure all current sections exist (new sections added later)
      const base = defaultPermissionsForLevel(member.level || "staff");
      return { ...base, ...member.section_permissions };
    }
    return defaultPermissionsForLevel(member.level || "staff");
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
    if (level) setPerms(defaultPermissionsForLevel(level));
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ronin-ai", {
        body: { action: "delete_user", target_user_id: member.id },
      });
      if (error) {
        // Parse the actual error message from the response body
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
      const roleToSet: AppRole = level ? ROLE_MAP[level as Level] : (member.role || "staff");

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
        section_permissions: perms as unknown as import("@/integrations/supabase/types").Json,
      }).eq("id", member.id);

      // Update role if changed
      if (roleToSet !== member.role) {
        await supabase.from("user_roles").update({ role: roleToSet }).eq("user_id", member.id);
      }

      onSaved({ ...member, full_name: fullName, job_title: jobTitle, phone, level, department, notes, assigned_property_ids: assignedProps, section_permissions: perms, role: roleToSet });
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  const lvlInfo = LEVEL_OPTIONS.find(l => l.value === (member.level as Level));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-charcoal rounded-t-2xl sm:rounded-2xl w-full max-w-lg h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl border border-charcoal-light">

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
          {(["details", "access"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-semibold tracking-widest uppercase transition-colors ${tab === t ? "text-gold border-b-2 border-gold" : "text-muted-foreground hover:text-cream"}`}>
              {t === "details" ? (isEN ? "Details" : "Detalles") : (isEN ? "Access & Alerts" : "Acceso y Alertas")}
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
                  <div className="space-y-2">
                    {properties.map(p => (
                      <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                        <Switch
                          checked={assignedProps.includes(p.id)}
                          onCheckedChange={v => setAssignedProps(prev => v ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                        />
                        <span className="text-cream text-sm">{p.name}</span>
                      </label>
                    ))}
                    {properties.length === 0 && <p className="text-muted-foreground text-xs">{isEN ? "No properties yet" : "Sin propiedades"}</p>}
                  </div>
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
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="shrink-0 px-5 py-4 border-t border-charcoal-light space-y-2">
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
