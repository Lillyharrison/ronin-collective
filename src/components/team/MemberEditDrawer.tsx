// MemberEditDrawer — tabbed team member editor (Details, Houses, Access, Home screen).
// Designed to fit without scrolling: one access group open at a time, always-visible footer.

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  X, Check, Eye, Loader2, Mail, Archive, Trash2, MoreHorizontal, ChevronDown, Plus, KeyRound, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LEVEL_OPTIONS, DEPT_OPTIONS, LEVEL_COLORS, ROLE_MAP,
  type TeamMember, type Property, type Level, type Department, type AppRole, type SectionPermissions,
} from "./teamConstants";
import {
  accessGroups, sectionInfo, togglePermission, setGroup, groupOnCount, sectionsOn, switchesOn,
  buildPermissionRows, allowedQuickActions, isValidEmail, type PermField,
} from "./memberAccess";
import { ALL_QUICK_ACTIONS } from "./teamConstants";
import { cn } from "@/lib/utils";

type TabKey = "details" | "houses" | "access" | "home";

const ROLE_LABELS: Record<string, { en: string; es: string }> = {
  master_admin: { en: "Master admin", es: "Administrador principal" },
  admin: { en: "Admin", es: "Administrador" },
  manager: { en: "Manager", es: "Gerente" },
  staff: { en: "Staff", es: "Personal" },
  principal: { en: "Family", es: "Familia" },
};

// Gold "on" track so switches read clearly on the dark panel.
const switchCls = "scale-90 data-[state=checked]:bg-gold data-[state=unchecked]:bg-charcoal-light border-cream/20";
const inputCls = "h-10 bg-charcoal-light border-charcoal-light text-cream text-base disabled:opacity-50";

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cn("block min-w-0", wide && "col-span-full")}>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

export function MemberEditDrawer({ member, properties, isEN, canEdit, isMasterAdmin, onClose, onSaved, onDeleted, onArchive }: {
  member: TeamMember;
  properties: Property[];
  isEN: boolean;
  canEdit: boolean;
  isMasterAdmin: boolean;
  onClose: () => void;
  onSaved: (updated: TeamMember) => void;
  onDeleted: () => void;
  onArchive?: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("details");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [resettingPwd, setResettingPwd] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [confirmEmptyInvite, setConfirmEmptyInvite] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [settingPwd, setSettingPwd] = useState(false);

  const [isDraft, setIsDraft] = useState(member.is_draft ?? false);
  const [draftEmail, setDraftEmail] = useState("");

  const [fullName, setFullName] = useState(member.full_name || "");
  const [jobTitle, setJobTitle] = useState(member.job_title || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [level, setLevel] = useState<Level | "">(member.level as Level || "");
  const [department, setDepartment] = useState<Department | "">(member.department as Department || "");
  const [startDate, setStartDate] = useState(member.start_date || "");
  const [birthday, setBirthday] = useState(member.birthday || "");
  const [notes, setNotes] = useState(member.notes || "");
  const [assignedProps, setAssignedProps] = useState<string[]>(member.assigned_property_ids || []);
  const [houseSearch, setHouseSearch] = useState("");

  const [isPrincipal, setIsPrincipal] = useState(false);
  const [principalLoading, setPrincipalLoading] = useState(false);
  useEffect(() => {
    supabase.from("system_settings").select("value").eq("key", "principal_user_id").maybeSingle()
      .then(({ data }) => { if (data?.value === member.id) setIsPrincipal(true); });
  }, [member.id]);

  // Access shows only the person's real explicit settings — never level defaults.
  const [perms, setPerms] = useState<SectionPermissions>(() => ({ ...(member.section_permissions ?? {}) }));
  const [quickActions, setQuickActions] = useState<string[]>(() => Array.isArray(member.quick_actions) ? member.quick_actions : []);
  const [openGroup, setOpenGroup] = useState<string | null>("core");
  const [choosingShortcut, setChoosingShortcut] = useState(false);

  const groups = useMemo(() => accessGroups(member.section_permissions ?? {}), [member.section_permissions]);
  const resolvedRole: AppRole = (member.role === "master_admin" ? "master_admin" : (level ? (ROLE_MAP[level] ?? member.role ?? "staff") : (member.role ?? "staff"))) as AppRole;
  const isAdminRole = resolvedRole === "admin" || resolvedRole === "master_admin";
  const switchCount = switchesOn(perms);
  const accessCount = sectionsOn(perms);
  const nothingOn = switchCount === 0;
  const canInvite = !!fullName.trim() && isValidEmail(draftEmail);

  function toggle(section: string, field: PermField, value: boolean) {
    setPerms(prev => ({ ...prev, [section]: togglePermission(prev[section], field, value) }));
  }
  function setScope(section: string, scope: "own" | "department" | "all") {
    setPerms(prev => ({ ...prev, [section]: { ...prev[section], scope } }));
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
        toast.error(msg);
        setDeleteDialogOpen(false);
        return;
      }
      setDeleteDialogOpen(false);
      onDeleted();
    } catch (e) {
      console.error("Delete user exception:", e);
      toast.error("An unexpected error occurred.");
    } finally {
      setDeleting(false);
    }
  }

  async function writeDirectPermissions() {
    const { upserts, deletes } = buildPermissionRows(perms);
    if (upserts.length) {
      const { error } = await supabase.from("user_section_permissions")
        .upsert(upserts.map(r => ({ ...r, user_id: member.id })), { onConflict: "user_id,section" });
      if (error) throw error;
    }
    if (deletes.length) {
      const { error } = await supabase.from("user_section_permissions").delete().eq("user_id", member.id).in("section", deletes);
      if (error) throw error;
    }
  }

  function draftBody(sendInvitation: boolean) {
    const { upserts, deletes } = buildPermissionRows(perms);
    return {
      action: "save_draft_user",
      profile_id: member.id,
      full_name: fullName || null,
      ...(sendInvitation ? { email: draftEmail.trim() } : {}),
      job_title: jobTitle || null,
      phone: phone || null,
      level,
      department: (level === "staff" || level === "manager") ? (department || null) : null,
      start_date: startDate || null,
      birthday: birthday || null,
      notes: notes || null,
      assigned_property_ids: assignedProps,
      quick_actions: quickActions,
      section_permissions_rows: upserts,
      section_permissions_delete: deletes,
      role: resolvedRole,
      send_invitation: sendInvitation,
    };
  }

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    try {
      if (isDraft) {
        const { error } = await supabase.functions.invoke("ronin-ai", { body: draftBody(false) });
        if (error) throw error;
      } else {
        const { error: profileErr } = await supabase.from("profiles").update({
          full_name: fullName, job_title: jobTitle, phone: phone || null, level,
          department: (level === "staff" || level === "manager") ? (department || null) : null,
          start_date: startDate || null, birthday: birthday || null, notes: notes || null,
          assigned_property_ids: assignedProps, quick_actions: quickActions,
        } as never).eq("id", member.id);
        if (profileErr) throw profileErr;
        await writeDirectPermissions();
        if (resolvedRole !== member.role) {
          const { error: roleErr } = await supabase.from("user_roles").update({ role: resolvedRole }).eq("user_id", member.id);
          if (roleErr) throw roleErr;
        }
      }
      toast.success(isEN ? "Saved" : "Guardado");
      onSaved({
        ...member, full_name: fullName, job_title: jobTitle, phone, level, department, notes,
        assigned_property_ids: assignedProps, section_permissions: perms, quick_actions: quickActions,
        role: resolvedRole, is_draft: isDraft,
      });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : (isEN ? "Failed to save changes" : "No se pudieron guardar los cambios"));
    }
    setSaving(false);
  }

  function requestInvite() {
    if (!canInvite) return;
    if (nothingOn) { setConfirmEmptyInvite(true); return; }
    void handleSendInvitation();
  }

  async function handleSendInvitation() {
    setConfirmEmptyInvite(false);
    if (!canInvite) return;
    setSendingInvite(true);
    try {
      const { data: inviteRes, error } = await supabase.functions.invoke("ronin-ai", { body: draftBody(true) });
      if (error) {
        let serverMsg: string | undefined;
        try { serverMsg = (await (error as { context?: Response }).context?.json())?.error; } catch { /* ignore */ }
        throw new Error(serverMsg || error.message);
      }
      setIsDraft(false);
      toast.success(isEN ? "Invitation sent!" : "¡Invitación enviada!", {
        description: isEN ? `A login invite has been sent to ${draftEmail}` : `Se envió un enlace de invitación a ${draftEmail}`,
      });
      const newId = (inviteRes as { user_id?: string } | null)?.user_id || member.id;
      onSaved({ ...member, id: newId, full_name: fullName, is_draft: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send invitation.");
    }
    setSendingInvite(false);
  }


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

  async function handleSendPasswordReset() {
    setResettingPwd(true);
    try {
      const { data, error } = await supabase.functions.invoke("ronin-ai", {
        body: { action: "send_password_reset", target_user_id: member.id },
      });
      if (error) throw error;
      const sentTo = (data as { email?: string } | null)?.email;
      toast.success(
        isEN
          ? `Password reset link sent${sentTo ? ` to ${sentTo}` : ""}.`
          : `Enlace de restablecimiento enviado${sentTo ? ` a ${sentTo}` : ""}.`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send password reset.";
      toast.error(msg);
    }
    setResettingPwd(false);
  }

  async function handleSetPassword() {
    setSettingPwd(true);
    try {
      const { data, error } = await supabase.functions.invoke("set-user-password", {
        body: { userId: member.id, password: newPwd },
      });
      let errMsg = (data as { error?: string } | null)?.error;
      if (error && !errMsg) {
        // Non-2xx: read the real reason from the response body
        try {
          const ctx = (error as { context?: Response }).context;
          const body = ctx ? await ctx.json() : null;
          errMsg = body?.error;
        } catch { /* ignore */ }
      }
      if (error || errMsg) throw new Error(errMsg || error?.message || "Failed");
      toast.success(isEN ? "Password set — share it with them so they can sign in." : "Contraseña guardada.");
      setNewPwd("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to set password.");
    }
    setSettingPwd(false);
  }

  const roleLabel = ROLE_LABELS[resolvedRole] ?? ROLE_LABELS.staff;
  const filteredHouses = properties.filter(p => !houseSearch.trim() || p.name.toLowerCase().includes(houseSearch.trim().toLowerCase()));
  const allowedShortcuts = allowedQuickActions(perms, isAdminRole);
  const addable = allowedShortcuts.filter(a => !quickActions.includes(a.key));
  const busy = saving || deleting || sendingInvite;

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: "details", label: isEN ? "Details" : "Datos" },
    { key: "houses", label: isEN ? "Houses" : "Casas", count: assignedProps.length },
    { key: "access", label: isEN ? "Access" : "Acceso", count: accessCount },
    { key: "home", label: isEN ? "Home screen" : "Inicio", count: quickActions.length },
  ];

  const statusText = nothingOn
    ? (isEN ? "Nothing switched on yet. They can sign in but will see only their home screen."
            : "Nada activado todavía. Pueden iniciar sesión pero solo verán su pantalla de inicio.")
    : (isEN
        ? `${assignedProps.length} ${assignedProps.length === 1 ? "house" : "houses"}, ${switchCount} ${switchCount === 1 ? "switch" : "switches"} on`
        : `${assignedProps.length} ${assignedProps.length === 1 ? "casa" : "casas"}, ${switchCount} ${switchCount === 1 ? "opción activada" : "opciones activadas"}`);

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={fullName || (isEN ? "Team member" : "Miembro del equipo")}
        className="relative bg-charcoal w-full h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl flex flex-col shadow-2xl sm:border border-charcoal-light overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-charcoal-light shrink-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${LEVEL_COLORS[member.level || "staff"]}`}>
            {member.avatar_url
              ? <img src={member.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              : <span className="font-display text-base">{(fullName || member.full_name || "?")[0].toUpperCase()}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-cream font-semibold text-base leading-tight truncate">{fullName || (isDraft ? (isEN ? "Draft account" : "Cuenta borrador") : "—")}</p>
              {isDraft && <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-400">{isEN ? "Draft" : "Borrador"}</span>}
            </div>
            <p className="text-[11px] tracking-widest uppercase text-muted-foreground truncate">{isEN ? roleLabel.en : roleLabel.es}</p>
          </div>
          {isMasterAdmin && !isDraft && (
            <ViewAsButton targetUserId={member.id} targetName={member.full_name || "User"} onAfter={onClose} isEN={isEN} />
          )}
          <button onClick={onClose} aria-label={isEN ? "Close" : "Cerrar"} className="w-11 h-11 -mr-2 flex items-center justify-center text-cream/60 hover:text-cream shrink-0"><X size={20} /></button>
        </div>

        {/* Status line */}
        <p data-testid="member-status" className={cn("px-4 py-1.5 text-xs leading-snug border-b border-charcoal-light shrink-0",
          nothingOn ? "bg-amber-500/10 text-amber-400" : "text-muted-foreground")}>{statusText}</p>

        {/* Tabs */}
        <div role="tablist" className="grid grid-cols-4 border-b border-charcoal-light shrink-0">
          {TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cn("min-w-0 min-h-11 px-1 py-1.5 text-[13px] font-semibold leading-tight transition-colors border-b-2",
                tab === t.key ? "text-gold border-gold" : "text-muted-foreground border-transparent hover:text-cream")}>
              {t.label}{t.count !== undefined && <span className="ml-1 tabular-nums opacity-80">({t.count})</span>}
            </button>
          ))}
        </div>

        {/* Body — sized to fit; the single scroll area is only a safety net */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {tab === "details" && (
            <div className="px-4 py-3 grid grid-cols-1 min-[360px]:grid-cols-2 gap-x-3 gap-y-2.5">
              <Field label={isEN ? "Full name" : "Nombre"}>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} disabled={!canEdit} className={inputCls} />
              </Field>
              {isDraft ? (
                <Field label={isEN ? "Email (to invite)" : "Correo (para invitar)"}>
                  <Input type="email" value={draftEmail} onChange={e => setDraftEmail(e.target.value)} disabled={!canEdit}
                    placeholder="jane@example.com" aria-invalid={!!draftEmail && !isValidEmail(draftEmail)} className={inputCls} />
                </Field>
              ) : (
                <Field label={isEN ? "Phone" : "Teléfono"}>
                  <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={!canEdit} className={inputCls} />
                </Field>
              )}
              <Field label={isEN ? "Job title" : "Puesto"}>
                <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} disabled={!canEdit} className={inputCls} />
              </Field>
              {isDraft && (
                <Field label={isEN ? "Phone" : "Teléfono"}>
                  <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={!canEdit} className={inputCls} />
                </Field>
              )}
              <Field label={isEN ? "Level" : "Nivel"}>
                <select value={level} disabled={!canEdit || member.role === "master_admin"} onChange={e => setLevel(e.target.value as Level)}
                  className={cn(inputCls, "w-full rounded-md border px-2")}>
                  <option value="" disabled>{isEN ? "Choose…" : "Elegir…"}</option>
                  {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{isEN ? o.label : o.labelEs}</option>)}
                </select>
              </Field>
              <Field label={isEN ? `Department · role: ${roleLabel.en}` : `Departamento · rol: ${roleLabel.es}`}>
                <select value={department} disabled={!canEdit || !(level === "staff" || level === "manager")}
                  onChange={e => setDepartment(e.target.value as Department | "")} className={cn(inputCls, "w-full rounded-md border px-2")}>
                  <option value="">{(level === "staff" || level === "manager") ? (isEN ? "None" : "Ninguno") : (isEN ? "Not needed" : "No aplica")}</option>
                  {DEPT_OPTIONS.map(o => <option key={o.value} value={o.value}>{isEN ? o.label : o.labelEs}</option>)}
                </select>
              </Field>
              <Field label={isEN ? "Start date" : "Fecha de inicio"}>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={!canEdit} className={inputCls} />
              </Field>
              <Field label={isEN ? "Birthday" : "Cumpleaños"}>
                <Input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} disabled={!canEdit} className={inputCls} />
              </Field>
              {level === "principal" && canEdit && (
                <div className="col-span-full flex items-center justify-between gap-3 rounded-lg border border-charcoal-light bg-charcoal-light/60 px-3 py-1.5">
                  <span className="text-sm text-cream">👑 {isEN ? "Principal (shown as main location on home screen)" : "Principal (ubicación principal en inicio)"}</span>
                  <Switch className={switchCls} checked={isPrincipal} disabled={principalLoading} aria-label="Principal"
                    onCheckedChange={async () => {
                      setPrincipalLoading(true);
                      try {
                        if (isPrincipal) { await supabase.from("system_settings").delete().eq("key", "principal_user_id"); setIsPrincipal(false); }
                        else { await supabase.from("system_settings").upsert({ key: "principal_user_id", value: member.id, updated_at: new Date().toISOString() }); setIsPrincipal(true); }
                      } catch (e) { console.error(e); }
                      setPrincipalLoading(false);
                    }} />
                </div>
              )}
              <Field label={isEN ? "Notes" : "Notas"} wide>
                <Input value={notes} onChange={e => setNotes(e.target.value)} disabled={!canEdit} className={inputCls} />
              </Field>
            </div>
          )}

          {tab === "houses" && (
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-cream">{isEN ? `${assignedProps.length} of ${properties.length} selected` : `${assignedProps.length} de ${properties.length} seleccionadas`}</p>
                {canEdit && (
                  <div className="flex items-center gap-1 text-sm">
                    <button className="min-h-11 px-2 text-gold hover:underline" onClick={() => setAssignedProps(properties.map(p => p.id))}>{isEN ? "Select all" : "Todas"}</button>
                    <button className="min-h-11 px-2 text-gold hover:underline" onClick={() => setAssignedProps([])}>{isEN ? "None" : "Ninguna"}</button>
                  </div>
                )}
              </div>
              {properties.length > 15 && (
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={houseSearch} onChange={e => setHouseSearch(e.target.value)} placeholder={isEN ? "Search houses" : "Buscar casas"} className={cn(inputCls, "pl-9")} />
                </div>
              )}
              {properties.length === 0 ? <p className="text-sm text-muted-foreground">{isEN ? "No houses yet" : "Aún no hay casas"}</p> : (
                <div className="flex flex-wrap gap-2">
                  {filteredHouses.map(p => {
                    const on = assignedProps.includes(p.id);
                    return (
                      <button key={p.id} disabled={!canEdit} aria-pressed={on}
                        onClick={() => setAssignedProps(on ? assignedProps.filter(id => id !== p.id) : [...assignedProps, p.id])}
                        className={cn("max-w-full min-h-10 px-3 rounded-full border text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50",
                          on ? "bg-gold/15 border-gold/60 text-gold" : "bg-charcoal-light border-charcoal-light text-cream/60 hover:text-cream")}>
                        {on && <Check size={14} className="shrink-0" />}<span className="truncate">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "access" && (() => {
            const visible = groups.filter(g => g.sections.length > 0);
            const current = visible.find(g => g.key === openGroup) ?? null;
            return (
            <div className="px-3 sm:px-4 py-2 space-y-2">
              {/* Group headers: one group open at a time */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {visible.map(g => {
                  const on = groupOnCount(perms, g.sections);
                  const open = openGroup === g.key;
                  return (
                    <div key={g.key} className={cn("flex items-center gap-1 rounded-lg border pr-1.5 min-w-0",
                      open ? "border-gold/60 bg-gold/10" : "border-charcoal-light bg-charcoal-light/50")}>
                      <button aria-expanded={open} onClick={() => setOpenGroup(open ? null : g.key)}
                        className="flex-1 min-w-0 min-h-11 flex flex-col justify-center pl-2.5 text-left">
                        <span className={cn("text-sm font-semibold truncate", open ? "text-gold" : "text-cream")}>{isEN ? g.label : g.labelEs}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{isEN ? `${on} of ${g.sections.length} on` : `${on} de ${g.sections.length}`}</span>
                      </button>
                      <Switch checked={on > 0} disabled={!canEdit} aria-label={isEN ? `All of ${g.label}` : `Todo ${g.labelEs}`}
                        className={switchCls} onCheckedChange={v => setPerms(prev => setGroup(prev, g.sections, v))} />
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="flex-1 normal-case tracking-normal text-xs">{isEN ? "Home and Profile: always on" : "Inicio y Perfil: siempre activo"}</span>
                {current && [isEN ? "See" : "Ver", isEN ? "Change" : "Editar", isEN ? "Alerts" : "Alertas"].map(h => <span key={h} className="w-12 text-center">{h}</span>)}
              </div>
              {current ? (
                <div className="rounded-lg border border-charcoal-light px-2">
                  {current.sections.map(key => {
                    const info = sectionInfo(key);
                    const sp = perms[key];
                    const name = isEN ? info.label : info.labelEs;
                    return (
                      <div key={key}>
                        <div className="flex items-center min-h-10 sm:min-h-8">
                          <span className={cn("flex-1 min-w-0 truncate text-sm", sp?.view ? "text-cream" : "text-cream/60")}>{name}</span>
                          {(["view", "edit", "notifications"] as PermField[]).map(f => (
                            <span key={f} className="w-12 flex justify-center">
                              <Switch checked={!!sp?.[f]} disabled={!canEdit || (f === "edit" && !info.hasEdit)}
                                aria-label={`${name} ${f === "view" ? (isEN ? "see" : "ver") : f === "edit" ? (isEN ? "change" : "editar") : (isEN ? "alerts" : "alertas")}`}
                                className={switchCls} onCheckedChange={v => toggle(key, f, v)} />
                            </span>
                          ))}
                        </div>
                        {info.hasScope && sp?.view && (
                          <div className="flex items-center gap-2 pb-1 pl-2">
                            <span className="text-xs text-muted-foreground">{isEN ? "Shows" : "Muestra"}</span>
                            <select value={sp.scope ?? "own"} disabled={!canEdit} onChange={e => setScope(key, e.target.value as "own" | "department" | "all")}
                              className="h-8 text-sm bg-charcoal border border-charcoal-light rounded px-1.5 text-cream">
                              <option value="own">{isEN ? "Own only" : "Solo propio"}</option>
                              <option value="department">{isEN ? "Their department" : "Su departamento"}</option>
                              <option value="all">{isEN ? "All staff" : "Todo el personal"}</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="px-1 text-sm text-muted-foreground">{isEN ? "Choose a group to see its switches." : "Elige un grupo para ver sus opciones."}</p>}
            </div>
            );
          })()}

          {tab === "home" && (
            <div className="px-4 py-3 space-y-3">
              {choosingShortcut ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-cream">{isEN ? "Add a shortcut" : "Añadir acceso directo"}</p>
                    <button className="min-h-11 px-2 text-sm text-gold" onClick={() => setChoosingShortcut(false)}>{isEN ? "Done" : "Listo"}</button>
                  </div>
                  {addable.length === 0
                    ? <p className="text-sm text-muted-foreground">{isEN ? "Nothing else their access allows. Switch on more in Access." : "No hay más opciones con su acceso actual."}</p>
                    : <div className="flex flex-wrap gap-2">
                        {addable.map(a => (
                          <button key={a.key} onClick={() => setQuickActions(q => [...q, a.key])}
                            className="min-h-10 px-3 rounded-full border border-charcoal-light bg-charcoal-light text-sm text-cream flex items-center gap-1.5 hover:border-gold/50">
                            <span aria-hidden>{a.icon}</span>{isEN ? a.label : a.labelEs}
                          </button>
                        ))}
                      </div>}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{isEN ? "Shortcuts on their home screen." : "Accesos directos en su pantalla de inicio."}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {quickActions.map(k => {
                      const a = ALL_QUICK_ACTIONS.find(x => x.key === k);
                      if (!a) return null;
                      return (
                        <div key={k} className="relative rounded-xl border border-charcoal-light bg-charcoal-light px-2 py-3 flex flex-col items-center gap-1 min-h-[76px]">
                          <span className="text-xl" aria-hidden>{a.icon}</span>
                          <span className="text-xs text-cream text-center leading-tight">{isEN ? a.label : a.labelEs}</span>
                          {canEdit && (
                            <button aria-label={isEN ? `Remove ${a.label}` : `Quitar ${a.labelEs}`} onClick={() => setQuickActions(q => q.filter(x => x !== k))}
                              className="absolute -top-1 -right-1 w-8 h-8 flex items-center justify-center text-cream/60 hover:text-cream"><X size={14} /></button>
                          )}
                        </div>
                      );
                    })}
                    {canEdit && (
                      <button onClick={() => setChoosingShortcut(true)}
                        className="rounded-xl border border-dashed border-gold/50 text-gold px-2 py-3 flex flex-col items-center justify-center gap-1 min-h-[76px] hover:bg-gold/5">
                        <Plus size={20} /><span className="text-xs">{isEN ? "Add shortcut" : "Añadir"}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer — always visible */}
        {canEdit && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-t border-charcoal-light pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={isEN ? "More" : "Más"} className="h-11 w-11 shrink-0"><MoreHorizontal size={18} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="z-[90]">
                {!isDraft && <DropdownMenuItem disabled={resending} onSelect={() => void handleResendInvitation()}><Mail size={14} className="mr-2" />{isEN ? "Resend invitation" : "Reenviar invitación"}</DropdownMenuItem>}
                {isMasterAdmin && !isDraft && <DropdownMenuItem disabled={resettingPwd} onSelect={() => void handleSendPasswordReset()}><Mail size={14} className="mr-2" />{isEN ? "Send password reset" : "Enviar restablecer contraseña"}</DropdownMenuItem>}
                {isMasterAdmin && !isDraft && <DropdownMenuItem onSelect={() => setPwdOpen(true)}><KeyRound size={14} className="mr-2" />{isEN ? "Set password…" : "Establecer contraseña…"}</DropdownMenuItem>}
                {(onArchive || isMasterAdmin) && !isDraft && <DropdownMenuSeparator />}
                {onArchive && <DropdownMenuItem disabled={busy} onSelect={() => onArchive()}><Archive size={14} className="mr-2" />{isEN ? "Archive (left)" : "Archivar (salió)"}</DropdownMenuItem>}
                {isMasterAdmin && <DropdownMenuItem disabled={deleting} onSelect={() => setDeleteDialogOpen(true)} className="text-destructive focus:text-destructive"><Trash2 size={14} className="mr-2" />{isEN ? "Delete user" : "Eliminar usuario"}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            {isDraft ? (
              <>
                <Button variant="outline" onClick={handleSave} disabled={busy} className="h-11 flex-1 min-w-0">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : (isEN ? "Save draft" : "Guardar borrador")}
                </Button>
                <Button onClick={requestInvite} disabled={busy || !canInvite} className="h-11 flex-[1.3] min-w-0 bg-gold hover:bg-gold/90 text-charcoal font-semibold gap-1.5">
                  {sendingInvite ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} className="shrink-0" />}
                  <span className="truncate">{isEN ? "Send invitation" : "Enviar invitación"}</span>
                </Button>
              </>
            ) : (
              <Button onClick={handleSave} disabled={busy} className="h-11 flex-1 bg-gold hover:bg-gold/90 text-charcoal font-semibold">
                {saving ? <Loader2 size={16} className="animate-spin" /> : (isEN ? "Save changes" : "Guardar cambios")}
              </Button>
            )}
          </div>
        )}

        {/* In-panel confirmations (kept inside the panel so they always sit above it) */}
        {(confirmEmptyInvite || deleteDialogOpen || pwdOpen) && (
          <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4">
            <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-xl border border-charcoal-light bg-charcoal p-4 space-y-3 shadow-2xl">
              {confirmEmptyInvite && (<>
                <p className="text-base text-cream">{isEN ? "This person will see nothing yet. Send invitation anyway?" : "Esta persona aún no verá nada. ¿Enviar la invitación de todos modos?"}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11" onClick={() => setConfirmEmptyInvite(false)}>{isEN ? "Cancel" : "Cancelar"}</Button>
                  <Button className="h-11 bg-gold hover:bg-gold/90 text-charcoal" onClick={() => void handleSendInvitation()}>{isEN ? "Send" : "Enviar"}</Button>
                </div>
              </>)}
              {deleteDialogOpen && !confirmEmptyInvite && (<>
                <p className="text-sm font-semibold text-destructive">{isEN ? "Permanently delete this user?" : "¿Eliminar permanentemente este usuario?"}</p>
                <p className="text-sm text-muted-foreground">{isEN
                  ? `${member.full_name || "This user"} and all their data will be deleted. This cannot be undone.`
                  : `${member.full_name || "Este usuario"} y todos sus datos serán eliminados. Esta acción no se puede deshacer.`}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11" disabled={deleting} onClick={() => setDeleteDialogOpen(false)}>{isEN ? "Cancel" : "Cancelar"}</Button>
                  <Button className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting} onClick={() => void handleDelete()}>
                    {deleting ? <Loader2 size={16} className="animate-spin" /> : (isEN ? "Delete" : "Eliminar")}
                  </Button>
                </div>
              </>)}
              {pwdOpen && !confirmEmptyInvite && !deleteDialogOpen && (<>
                <p className="text-sm font-semibold text-cream">{isEN ? "Set password directly" : "Establecer contraseña"}</p>
                <Input type="text" autoComplete="new-password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  placeholder={isEN ? "Min. 8 characters" : "Mín. 8 caracteres"} className="text-base" />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11" onClick={() => { setPwdOpen(false); setNewPwd(""); }}>{isEN ? "Cancel" : "Cancelar"}</Button>
                  <Button className="h-11" disabled={settingPwd || newPwd.length < 8} onClick={async () => { await handleSetPassword(); setPwdOpen(false); }}>
                    {settingPwd ? <Loader2 size={16} className="animate-spin" /> : (isEN ? "Set password" : "Guardar")}
                  </Button>
                </div>
              </>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Master-admin helper: enter "View as" preview mode for the selected user ──
import { usePermissionsControl } from "@/hooks/usePermissions";
import { useState as useStateInner } from "react";

function ViewAsButton({ targetUserId, targetName, onAfter, isEN }: {
  targetUserId: string;
  targetName: string;
  onAfter: () => void;
  isEN: boolean;
}) {
  const { enterPreview } = usePermissionsControl();
  const [busy, setBusy] = useStateInner(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await enterPreview(targetUserId);
          onAfter();
        } finally {
          setBusy(false);
        }
      }}
      title={isEN ? `View the app as ${targetName}` : `Ver la app como ${targetName}`}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider bg-gold/10 hover:bg-gold/20 text-gold border border-gold/40 transition-colors disabled:opacity-50"
    >
      <Eye size={12} />
      {busy ? "…" : (isEN ? "View as" : "Ver como")}
    </button>
  );
}
