import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  UsersRound, Plus, Search, ChevronRight,
  User, Briefcase, Building2, Calendar, X, Check, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = "principal" | "extended_family" | "manager" | "staff";
type Department = "exterior" | "interior" | "kitchen" | "security" | "office";
type AppRole = "master_admin" | "admin" | "manager" | "staff" | "principal";

interface TeamMember {
  id: string;
  full_name: string | null;
  job_title: string | null;
  avatar_url: string | null;
  level: string | null;
  department: string | null;
  start_date: string | null;
  birthday: string | null;
  notes: string | null;
  assigned_property_ids: string[] | null;
  role?: AppRole | null;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetTeamSection() {
  const { language } = useLanguage();
  const { isMasterAdmin, isAdmin } = usePermissions();
  const isEN = language === "en";

  const [members, setMembers] = useState<TeamMember[]>([]);
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

  // Load team members + job title suggestions
  useEffect(() => {
    loadMembers();
    loadJobTitles();
  }, []);

  async function loadMembers() {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, job_title, avatar_url, level, department, start_date, birthday, notes, assigned_property_ids")
      .order("full_name");

    if (!profiles) return;

    // fetch roles for all users
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const roleMap = Object.fromEntries((roles || []).map(r => [r.user_id, r.role as AppRole]));
    setMembers(profiles.map(p => ({ ...p, role: roleMap[p.id] || null })));
  }

  async function loadJobTitles() {
    const { data } = await supabase.from("job_title_suggestions").select("title").order("title");
    if (data) setJobTitles(data.map(d => d.title));
  }

  // Filter title suggestions as user types
  useEffect(() => {
    if (!form.job_title) { setTitleSuggestions([]); return; }
    setTitleSuggestions(
      jobTitles.filter(t => t.toLowerCase().includes(form.job_title.toLowerCase())).slice(0, 6)
    );
  }, [form.job_title, jobTitles]);

  // Auto-set role when level changes
  function handleLevelChange(level: Level | "") {
    setForm(f => ({
      ...f,
      level,
      role: level ? ROLE_MAP[level] : "",
      department: level === "staff" ? f.department : "",
    }));
  }

  async function handleAddUser() {
    if (!form.full_name || !form.email || !form.level || !form.role) return;
    setSaving(true);
    try {
      // 1. Invite user via Supabase auth admin (sends invite email)
      const { data: invited, error: inviteErr } = await supabase.functions.invoke("ronin-ai", {
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

      // 2. Save job title for future autocomplete if new
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

  // ─── Filtered list ──────────────────────────────────────────────────────────
  const filtered = members.filter(m => {
    const matchSearch = !search ||
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.job_title?.toLowerCase().includes(search.toLowerCase());
    const matchLevel = filterLevel === "all" || m.level === filterLevel;
    return matchSearch && matchLevel;
  });

  // Group by level
  const groups: Record<string, TeamMember[]> = {};
  filtered.forEach(m => {
    const key = m.level || "staff";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });
  const levelOrder: Level[] = ["principal", "extended_family", "manager", "staff"];

  // ─── Render ─────────────────────────────────────────────────────────────────
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
        <Button
          onClick={() => setShowAdd(true)}
          size="sm"
          className="bg-gold hover:bg-gold/90 text-charcoal font-semibold gap-1.5 shrink-0"
        >
          <Plus size={14} />
          {isEN ? "Add User" : "Agregar"}
        </Button>
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
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${LEVEL_COLORS[m.level || "staff"]}`}>
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.full_name || ""} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="font-display text-base">{(m.full_name || "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-cream text-sm font-medium truncate">{m.full_name || "—"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {m.job_title && (
                          <span className="text-muted-foreground text-[11px] truncate">{m.job_title}</span>
                        )}
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-charcoal rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border border-charcoal-light">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-charcoal-light sticky top-0 bg-charcoal z-10">
              <div>
                <h2 className="text-cream font-display text-lg">{isEN ? "Add Team Member" : "Agregar Miembro"}</h2>
                <p className="text-muted-foreground text-xs mt-0.5">{isEN ? "Mandatory fields marked *" : "Campos obligatorios marcados *"}</p>
              </div>
              <button onClick={() => { setShowAdd(false); resetForm(); }} className="text-cream/50 hover:text-cream">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Full name * */}
              <div>
                <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block">
                  {isEN ? "Full Name *" : "Nombre Completo *"}
                </label>
                <Input
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder={isEN ? "Jane Smith" : "Ana García"}
                  className="bg-charcoal-light border-charcoal-light text-cream"
                />
              </div>

              {/* Email * */}
              <div>
                <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block">
                  {isEN ? "Email *" : "Correo *"}
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  className="bg-charcoal-light border-charcoal-light text-cream"
                />
              </div>

              {/* Job Title with autocomplete */}
              <div className="relative">
                <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block">
                  {isEN ? "Job Title *" : "Puesto *"}
                </label>
                <Input
                  value={form.job_title}
                  onChange={e => { setForm(f => ({ ...f, job_title: e.target.value })); setShowTitleDropdown(true); }}
                  onFocus={() => setShowTitleDropdown(true)}
                  onBlur={() => setTimeout(() => setShowTitleDropdown(false), 150)}
                  placeholder={isEN ? "e.g. Estate Manager" : "ej. Gerente de Propiedad"}
                  className="bg-charcoal-light border-charcoal-light text-cream"
                />
                {showTitleDropdown && titleSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-charcoal border border-charcoal-light rounded-xl overflow-hidden shadow-xl">
                    {titleSuggestions.map(t => (
                      <button
                        key={t}
                        onMouseDown={() => setForm(f => ({ ...f, job_title: t }))}
                        className="w-full text-left px-4 py-2.5 text-sm text-cream hover:bg-charcoal-light transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Level * */}
              <div>
                <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block">
                  {isEN ? "Level / Family Tier *" : "Nivel *"}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LEVEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleLevelChange(opt.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${
                        form.level === opt.value
                          ? `${LEVEL_COLORS[opt.value]} border-current`
                          : "border-charcoal-light text-cream/50 hover:text-cream bg-charcoal-light"
                      }`}
                    >
                      {form.level === opt.value && <Check size={13} />}
                      {isEN ? opt.label : opt.labelEs}
                    </button>
                  ))}
                </div>
              </div>

              {/* Department (staff only) */}
              {form.level === "staff" && (
                <div>
                  <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block">
                    {isEN ? "Department" : "Departamento"}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DEPT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setForm(f => ({ ...f, department: f.department === opt.value ? "" : opt.value }))}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          form.department === opt.value
                            ? `${DEPT_COLORS[opt.value]} border-current bg-current/10`
                            : "border-charcoal-light text-cream/50 hover:text-cream bg-charcoal-light"
                        }`}
                      >
                        {isEN ? opt.label : opt.labelEs}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Divider: Optional fields */}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex-1 h-px bg-charcoal-light" />
                <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
                  {isEN ? "Optional" : "Opcional"}
                </span>
                <div className="flex-1 h-px bg-charcoal-light" />
              </div>

              {/* Start date */}
              <div>
                <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                  <Calendar size={11} />
                  {isEN ? "Start Date" : "Fecha de Inicio"}
                </label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="bg-charcoal-light border-charcoal-light text-cream"
                />
              </div>

              {/* Birthday */}
              <div>
                <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                  <Calendar size={11} />
                  {isEN ? "Birthday" : "Cumpleaños"}
                </label>
                <Input
                  type="date"
                  value={form.birthday}
                  onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                  className="bg-charcoal-light border-charcoal-light text-cream"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block">
                  {isEN ? "Notes" : "Notas"}
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder={isEN ? "Any notes about this team member…" : "Notas adicionales…"}
                  className="w-full bg-charcoal-light border border-charcoal-light rounded-lg px-3 py-2 text-cream text-sm resize-none outline-none focus:border-gold/40 placeholder:text-cream/30 transition-colors"
                />
              </div>

              {/* Permissions preview */}
              {form.level && (
                <div className="rounded-xl bg-gold/5 border border-gold/20 px-4 py-3">
                  <p className="text-[10px] tracking-widest uppercase text-gold font-semibold mb-2">
                    {isEN ? "Permission Preview" : "Vista Previa de Permisos"}
                  </p>
                  <PermissionPreview level={form.level as Level} department={form.department as Department | ""} isEN={isEN} />
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-2 pb-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowAdd(false); resetForm(); }}
                  className="flex-1 border-charcoal-light text-cream hover:bg-charcoal-light"
                >
                  {isEN ? "Cancel" : "Cancelar"}
                </Button>
                <Button
                  onClick={handleAddUser}
                  disabled={saving || !form.full_name || !form.email || !form.level}
                  className="flex-1 bg-gold hover:bg-gold/90 text-charcoal font-semibold"
                >
                  {saving ? (isEN ? "Sending…" : "Enviando…") : (isEN ? "Send Invite" : "Enviar Invitación")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Member Detail Modal ────────────────────────────────────────────── */}
      {selectedMember && (
        <MemberDetailModal member={selectedMember} isEN={isEN} onClose={() => setSelectedMember(null)} />
      )}
    </div>
  );
}

// ─── Permission Preview widget ─────────────────────────────────────────────────
function PermissionPreview({ level, department, isEN }: { level: Level; department: Department | ""; isEN: boolean }) {
  const sectionAccess: Record<Level, string[]> = {
    principal:       ["Dashboard", "Property", "Messages", "Travel", "Calendar", "Meet Team", "Profile", "Achievements"],
    extended_family: ["Dashboard", "Messages", "Calendar", "Profile", "Achievements"],
    manager:         ["Dashboard", "Property", "Maintenance", "Messages", "Tasks", "Manuals", "Contacts", "Inventory", "Laundry", "Orders", "Calendar", "Meet Team", "Profile", "Achievements"],
    staff:           ["Dashboard", "Maintenance", "Messages", "Tasks", "Manuals", "Laundry", "Calendar", "Profile", "Achievements"],
  };

  const sections = sectionAccess[level] || [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {sections.map(s => (
        <span key={s} className="px-2 py-0.5 rounded-md bg-gold/10 text-gold text-[10px] font-medium border border-gold/20">
          {s}
        </span>
      ))}
      {level === "staff" && department && (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border border-current bg-current/10 ${DEPT_COLORS[department]}`}>
          {isEN ? `Dept: ${department}` : `Dept: ${department}`}
        </span>
      )}
    </div>
  );
}

// ─── Member Detail Modal ───────────────────────────────────────────────────────
function MemberDetailModal({ member, isEN, onClose }: { member: TeamMember; isEN: boolean; onClose: () => void }) {
  const lvlInfo = LEVEL_OPTIONS.find(l => l.value === member.level);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-charcoal rounded-2xl w-full max-w-sm shadow-2xl border border-charcoal-light">
        <div className="flex justify-end px-4 pt-4">
          <button onClick={onClose} className="text-cream/50 hover:text-cream"><X size={18} /></button>
        </div>
        <div className="px-6 pb-6 flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 mb-3 ${LEVEL_COLORS[member.level || "staff"]}`}>
            {member.avatar_url ? (
              <img src={member.avatar_url} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="font-display text-2xl">{(member.full_name || "?")[0].toUpperCase()}</span>
            )}
          </div>
          <h3 className="text-cream font-display text-xl">{member.full_name}</h3>
          {member.job_title && <p className="text-muted-foreground text-sm mt-1">{member.job_title}</p>}

          <div className="flex gap-2 mt-3 flex-wrap justify-center">
            {lvlInfo && (
              <span className={`px-3 py-1 rounded-full border text-[10px] tracking-widest uppercase font-semibold ${LEVEL_COLORS[member.level || "staff"]}`}>
                {isEN ? lvlInfo.label : lvlInfo.labelEs}
              </span>
            )}
            {member.department && (
              <span className={`px-3 py-1 rounded-full border border-current bg-current/10 text-[10px] tracking-widest uppercase font-semibold ${DEPT_COLORS[member.department] || ""}`}>
                {member.department}
              </span>
            )}
          </div>

          {(member.start_date || member.birthday) && (
            <div className="mt-4 grid grid-cols-2 gap-3 w-full text-left">
              {member.start_date && (
                <div className="bg-charcoal-light rounded-xl px-3 py-2">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{isEN ? "Start Date" : "Inicio"}</p>
                  <p className="text-cream text-sm font-medium mt-0.5">
                    {new Date(member.start_date).toLocaleDateString(isEN ? "en-US" : "es-MX", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              )}
              {member.birthday && (
                <div className="bg-charcoal-light rounded-xl px-3 py-2">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{isEN ? "Birthday" : "Cumpleaños"}</p>
                  <p className="text-cream text-sm font-medium mt-0.5">
                    {new Date(member.birthday).toLocaleDateString(isEN ? "en-US" : "es-MX", { month: "short", day: "numeric" })}
                  </p>
                </div>
              )}
            </div>
          )}

          {member.notes && (
            <div className="mt-3 w-full bg-charcoal-light rounded-xl px-3 py-2 text-left">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{isEN ? "Notes" : "Notas"}</p>
              <p className="text-cream/70 text-xs">{member.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
