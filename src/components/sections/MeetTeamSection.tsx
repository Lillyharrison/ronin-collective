import { useState, useEffect } from "react";
import { sortProperties } from "@/hooks/useScopedProperties";
import { imageUrl } from "@/lib/imageUrl";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import {
  UsersRound, Plus, Search, ChevronRight,
  X, Check, ChevronDown,
  Eye, Pencil, Bell, Loader2, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  ALL_SECTIONS, LEVEL_OPTIONS, DEPT_OPTIONS, LEVEL_COLORS, DEPT_COLORS, ROLE_MAP,
  defaultPermissionsForLevel, defaultQuickActionsForLevel,
  type TeamMember, type Property, type Level, type Department, type AppRole,
  type SectionPerm, type SectionPermissions, type AddUserForm,
} from "@/components/team/teamConstants";
import {
  PropertyToggles, QuickActionToggles, FieldLabel,
} from "@/components/team/teamSharedComponents";
import { MemberEditDrawer } from "@/components/team/MemberEditDrawer";

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetTeamSection() {
  const { language } = useLanguage();
  const { isMasterAdmin, isAdmin } = usePermissions();
  const { registerBackHandler } = useNavigation();
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
  const [collapsedGroups, setCollapsedGroups] = useLocalStorage<Record<string, boolean>>(
    "meet-team:collapsed-groups",
    { master_admin: true, admin: true, principal: true, extended_family: true, manager: true, staff: true }
  );
  const toggleGroup = (key: string) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const [form, setForm] = useState<AddUserForm>({
    full_name: "", email: "", job_title: "", level: "",
    department: "", role: "", start_date: "", birthday: "", notes: "",
  });

  useEffect(() => {
    loadMembers();
    loadJobTitles();
    loadProperties();
  }, []);

  // Register back handler when a member detail panel is open
  useEffect(() => {
    if (selectedMember) {
      registerBackHandler(() => {
        setSelectedMember(null);
        return true;
      });
    } else {
      registerBackHandler(null);
    }
    return () => { registerBackHandler(null); };
  }, [selectedMember, registerBackHandler]);

  async function loadMembers() {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, job_title, avatar_url, level, department, start_date, birthday, phone, notes, assigned_property_ids, quick_actions, is_draft")
      .order("full_name");

    if (!profiles) return;

    // Load all section permissions in one go, then build per-user maps
    const userIds = profiles.map(p => p.id);
    const { data: permRows } = await supabase
      .from("user_section_permissions")
      .select("user_id, section, can_view, can_edit, notifications")
      .in("user_id", userIds);

    const permsByUser: Record<string, SectionPermissions> = {};
    for (const row of (permRows ?? []) as Array<{ user_id: string; section: string; can_view: boolean; can_edit: boolean; notifications: boolean }>) {
      if (!permsByUser[row.user_id]) permsByUser[row.user_id] = {};
      permsByUser[row.user_id][row.section] = {
        view: row.can_view,
        edit: row.can_edit,
        notifications: row.notifications,
      };
    }

    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = Object.fromEntries((roles || []).map(r => [r.user_id, r.role as AppRole]));
    setMembers(profiles.map(p => ({
      ...p,
      section_permissions: permsByUser[p.id] || null,
      quick_actions: ((p as { quick_actions?: string[] }).quick_actions) ?? [],
      role: roleMap[p.id] || null,
      is_draft: (p as { is_draft?: boolean }).is_draft ?? false,
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
    // Non-admins never see draft profiles
    if (m.is_draft && !isMasterAdmin && !isAdmin) return false;
    const matchSearch = !search ||
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.job_title?.toLowerCase().includes(search.toLowerCase()) ||
      (m.is_draft && "draft".includes(search.toLowerCase()));
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
              <button
                type="button"
                onClick={() => toggleGroup(lvl)}
                className="w-full flex items-center gap-2 mb-2 group"
              >
                <ChevronDown
                  size={12}
                  className={`text-muted-foreground transition-transform ${collapsedGroups[lvl] ? "-rotate-90" : ""}`}
                />
                <p className={`text-[10px] font-bold tracking-widest uppercase ${LEVEL_COLORS[lvl].split(" ")[0]}`}>
                  {isEN ? lvlLabel.en : lvlLabel.es}
                  <span className="ml-2 opacity-50">{group.length}</span>
                </p>
              </button>
              {!collapsedGroups[lvl] && (
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
                         <div className="flex items-center gap-2">
                           <p className="text-foreground text-sm font-medium truncate">{m.full_name || (m.is_draft ? "Draft Account" : "—")}</p>
                           {m.is_draft && (
                             <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-400">
                               Draft
                             </span>
                           )}
                         </div>
                         <div className="flex items-center gap-2 mt-0.5">
                           {m.job_title && <span className="text-muted-foreground text-[11px] truncate">{m.job_title}</span>}
                           {m.department && (
                             <span className={`text-[10px] font-semibold ${DEPT_COLORS[m.department] || "text-cream/50"}`}>
                               · {m.department}
                             </span>
                           )}
                           {m.is_draft && !m.full_name && (
                             <span className="text-muted-foreground text-[11px]">Add name to send invitation</span>
                           )}
                         </div>
                       </div>
                       <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                     </button>
                  ))}
                </div>
              )}
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

  function togglePerm(sectionKey: string, field: "view" | "edit" | "notifications") {
    setPerms(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [field]: !prev[sectionKey]?.[field],
        ...(field === "view" && prev[sectionKey]?.view ? { edit: false, notifications: false } : {}),
      },
    }));
  }

  function setScope(sectionKey: string, scope: "own" | "department" | "all") {
    setPerms(prev => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], scope },
    }));
  }

  async function handleSubmit() {
    if (!form.level || !form.role) return;
    // isDraft = no email provided and not a no-login profile
    const isDraft = !noLogin && !form.email;
    setSaving(true);
    try {
      const finalPerms = Object.keys(perms).length > 0
        ? { ...perms, _quick_actions: quickActions as unknown as SectionPerm }
        : null;

      if (noLogin || isDraft) {
        // Create profile-only record via edge function (needs service role to bypass RLS)
        const { error: fnErr } = await supabase.functions.invoke("ronin-ai", {
          body: {
            action: "create_profile_only",
            full_name: form.full_name || null,
            job_title: form.job_title || null,
            phone: phone || null,
            level: form.level,
            department: form.department || null,
            role: form.role,
            start_date: form.start_date || null,
            birthday: form.birthday || null,
            notes: form.notes || null,
            assigned_property_ids: assignedProps,
            quick_actions: [],
            section_permissions_rows: Object.entries(finalPerms)
              .filter(([k, v]) => k !== "_quick_actions" && v && typeof v === "object" && !Array.isArray(v))
              .map(([section, v]) => {
                const p = v as { view?: boolean; edit?: boolean; notifications?: boolean };
                return { section, can_view: p.view === true, can_edit: p.edit === true, notifications: p.notifications === true };
              }),
            is_draft: isDraft,
          },
        });
        if (fnErr) throw fnErr;
      } else {
        await supabase.functions.invoke("ronin-ai", {
          body: {
            action: "invite_user",
            email: form.email,
            full_name: form.full_name || null,
            job_title: form.job_title,
            level: form.level,
            department: form.department || null,
            role: form.role,
            start_date: form.start_date || null,
            birthday: form.birthday || null,
            notes: form.notes || null,
            phone: phone || null,
            assigned_property_ids: assignedProps,
            quick_actions: [],
            section_permissions_rows: Object.entries(finalPerms)
              .filter(([k, v]) => k !== "_quick_actions" && v && typeof v === "object" && !Array.isArray(v))
              .map(([section, v]) => {
                const p = v as { view?: boolean; edit?: boolean; notifications?: boolean };
                return { section, can_view: p.view === true, can_edit: p.edit === true, notifications: p.notifications === true };
              }),
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

  // Draft = no email and not no-login. Can always save as long as level+role are set.
  const isDraft = !noLogin && !form.email;
  const canSave = !!(form.level && form.role);

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
                <FieldLabel label={isEN ? "Full Name" : "Nombre Completo"} />
                <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder={isEN ? "Jane Smith" : "Ana García"} className="bg-charcoal-light border-charcoal-light text-cream" />
              </div>

              {!noLogin && (
                <div>
                  <FieldLabel label={isEN ? "Email — required to send invite" : "Correo — necesario para invitar"} />
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
                  const showDashSubDivider = section.isDashboardSub && prevSection && !prevSection.isDashboardSub;
                  const showCalSubDivider = section.isCalendarSub && prevSection && !prevSection.isCalendarSub;
                  return (
                    <div key={section.key}>
                      {showDashSubDivider && (
                        <div className="flex items-center gap-2 mt-1 mb-1">
                          <div className="flex-1 h-px bg-charcoal-light" />
                          <span className="text-[9px] uppercase tracking-widest text-gold/50 font-semibold">
                            {isEN ? "Dashboard Features" : "Funciones del panel"}
                          </span>
                          <div className="flex-1 h-px bg-charcoal-light" />
                        </div>
                      )}
                      {showCalSubDivider && (
                        <div className="flex items-center gap-2 mt-3 mb-1.5">
                          <div className="flex-1 h-px bg-charcoal-light" />
                          <span className="text-[9px] uppercase tracking-widest text-blue-400/60 font-semibold">
                            {isEN ? "Calendar Tabs" : "Pestañas del calendario"}
                          </span>
                          <div className="flex-1 h-px bg-charcoal-light" />
                        </div>
                      )}
                      <div className={`flex flex-col gap-1 px-3 py-2 rounded-lg transition-colors ${sp.view ? "bg-charcoal-light" : "opacity-50"}`}>
                        <div className="flex items-center gap-1">
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
                        {section.hasScope && sp.view && (
                          <div className="flex items-center gap-2 pl-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{isEN ? "Visibility" : "Visibilidad"}</span>
                            <select
                              value={sp.scope ?? "own"}
                              onChange={(e) => setScope(section.key, e.target.value as "own" | "department" | "all")}
                              className="text-[11px] bg-charcoal border border-charcoal-light rounded px-1.5 py-0.5 text-cream focus:outline-none focus:border-gold/50"
                            >
                              <option value="own">{isEN ? "Own only" : "Solo propio"}</option>
                              <option value="department">{isEN ? "Their department" : "Su departamento"}</option>
                              <option value="all">{isEN ? "All staff" : "Todo el personal"}</option>
                            </select>
                          </div>
                        )}
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
            className={`flex-1 font-semibold ${isDraft ? "bg-amber-500/80 hover:bg-amber-500 text-charcoal" : "bg-gold hover:bg-gold/90 text-charcoal"}`}>
            {saving
              ? <Loader2 size={16} className="animate-spin" />
              : isDraft
                ? (isEN ? "Save as Draft" : "Guardar Borrador")
                : noLogin
                  ? (isEN ? "Save Profile" : "Guardar Perfil")
                  : (isEN ? "Send Invite" : "Invitar")}
          </Button>
        </div>
      </div>
    </div>
  );
}
