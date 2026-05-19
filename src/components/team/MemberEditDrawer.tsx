// MemberEditDrawer — extracted from MeetTeamSection.tsx during the conservative refactor.
// Behavior is unchanged. State stays local to the drawer; parent passes member + callbacks.

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  X, Check, Eye, Pencil, Bell, Save, Loader2, Trash2, Mail,
  Zap,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALL_SECTIONS, LEVEL_OPTIONS, DEPT_OPTIONS, LEVEL_COLORS, DEPT_COLORS, ROLE_MAP,
  defaultPermissionsForLevel, defaultQuickActionsForLevel,
  type TeamMember, type Property, type Level, type Department, type AppRole, type SectionPermissions,
} from "./teamConstants";
import {
  PropertyToggles, QuickActionToggles, FieldLabel, EditField,
} from "./teamSharedComponents";

export function MemberEditDrawer({ member, properties, isEN, canEdit, isMasterAdmin, onClose, onSaved, onDeleted }: {
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
  const [resettingPwd, setResettingPwd] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  // Draft state
  const [isDraft, setIsDraft] = useState(member.is_draft ?? false);
  const [draftEmail, setDraftEmail] = useState("");

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

  // Work roster (for staff-schedule worked-vs-expected calculator)
  const m = member as TeamMember & {
    contracted_days_per_week?: number | null;
    contracted_hours_per_week?: number | null;
    annual_leave_days?: number | null;
  };
  const [contractedDays, setContractedDays] = useState<string>(
    m.contracted_days_per_week != null ? String(m.contracted_days_per_week) : "5"
  );
  const [contractedHours, setContractedHours] = useState<string>(
    m.contracted_hours_per_week != null ? String(m.contracted_hours_per_week) : "40"
  );
  const [annualLeave, setAnnualLeave] = useState<string>(
    m.annual_leave_days != null ? String(m.annual_leave_days) : "25"
  );

  // Principal designation toggle — only relevant when level = principal
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [principalLoading, setPrincipalLoading] = useState(false);

  // Load current principal from system_settings on mount
  useEffect(() => {
    supabase.from("system_settings").select("value").eq("key", "principal_user_id").maybeSingle()
      .then(({ data }) => {
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

  // Quick actions — read from dedicated `quick_actions` column on profile
  const [quickActions, setQuickActions] = useState<string[]>(() => {
    if (Array.isArray(member.quick_actions) && member.quick_actions.length > 0) {
      return member.quick_actions;
    }
    return defaultQuickActionsForLevel(member.level || "staff");
  });

  function togglePerm(sectionKey: string, field: "view" | "edit" | "notifications") {
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

  function setScope(sectionKey: string, scope: "own" | "department" | "all") {
    setPerms(prev => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], scope },
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

      // Build perm rows for the dedicated table — single source of truth
      const permRows = Object.entries(perms)
        .filter(([k, v]) => k !== "_quick_actions" && v && typeof v === "object" && !Array.isArray(v))
        .map(([section, v]) => {
          const p = v as { view?: boolean; edit?: boolean; notifications?: boolean; scope?: "own" | "department" | "all" };
          return {
            user_id: member.id,
            section,
            can_view: p.view === true,
            can_edit: p.edit === true,
            notifications: p.notifications === true,
            scope: p.scope ?? null,
          };
        });

      if (isDraft) {
        // Draft profiles: save via edge function so is_draft flag is preserved
        await supabase.functions.invoke("ronin-ai", {
          body: {
            action: "save_draft_user",
            profile_id: member.id,
            full_name: fullName || null,
            job_title: jobTitle || null,
            phone: phone || null,
            level,
            department: (level === "staff" || level === "manager") ? (department || null) : null,
            start_date: startDate || null,
            birthday: birthday || null,
            notes: notes || null,
            assigned_property_ids: assignedProps,
            quick_actions: quickActions,
            section_permissions_rows: permRows,
            role: roleToSet,
            send_invitation: false,
          },
        });
      } else {
        // Regular (non-draft) profiles: update directly
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
          quick_actions: quickActions,
          contracted_days_per_week: contractedDays === "" ? null : Number(contractedDays),
          contracted_hours_per_week: contractedHours === "" ? null : Number(contractedHours),
          annual_leave_days: annualLeave === "" ? null : Number(annualLeave),
        } as never).eq("id", member.id);

        // Write permissions to the dedicated table — the ONLY source of truth
        if (permRows.length > 0) {
          await supabase.from("user_section_permissions").upsert(permRows, { onConflict: "user_id,section" });
        }

        // Update role if changed
        if (roleToSet !== member.role) {
          await supabase.from("user_roles").update({ role: roleToSet }).eq("user_id", member.id);
        }
      }

      onSaved({ ...member, full_name: fullName, job_title: jobTitle, phone, level, department, notes, assigned_property_ids: assignedProps, section_permissions: perms, quick_actions: quickActions, role: roleToSet, is_draft: isDraft });
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function handleSendInvitation() {
    if (!fullName || !draftEmail) return;
    setSendingInvite(true);
    try {
      const resolvedRole = level ? (ROLE_MAP[level] ?? member.role ?? "staff") : (member.role ?? "staff");
      const permRows = Object.entries(perms)
        .filter(([k, v]) => k !== "_quick_actions" && v && typeof v === "object" && !Array.isArray(v))
        .map(([section, v]) => {
          const p = v as { view?: boolean; edit?: boolean; notifications?: boolean; scope?: "own" | "department" | "all" };
          return {
            user_id: member.id,
            section,
            can_view: p.view === true,
            can_edit: p.edit === true,
            notifications: p.notifications === true,
            scope: p.scope ?? null,
          };
        });
      const { error } = await supabase.functions.invoke("ronin-ai", {
        body: {
          action: "save_draft_user",
          profile_id: member.id,
          full_name: fullName,
          email: draftEmail,
          job_title: jobTitle || null,
          phone: phone || null,
          level,
          department: (level === "staff" || level === "manager") ? (department || null) : null,
          start_date: startDate || null,
          birthday: birthday || null,
          notes: notes || null,
          assigned_property_ids: assignedProps,
          quick_actions: quickActions,
          section_permissions_rows: permRows,
          role: resolvedRole,
          send_invitation: true,
        },
      });
      if (error) throw error;
      setIsDraft(false);
      toast.success(isEN ? "Invitation sent!" : "¡Invitación enviada!", {
        description: isEN ? `A login invite has been sent to ${draftEmail}` : `Se envió un enlace de invitación a ${draftEmail}`,
      });
      onSaved({ ...member, full_name: fullName, is_draft: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send invitation.";
      toast.error(msg);
    }
    setSendingInvite(false);
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
              <div className="flex items-center gap-2">
                <p className="text-cream font-semibold text-sm leading-none">{member.full_name || (isDraft ? "Draft Account" : "—")}</p>
                {isDraft && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-400">
                    Draft
                  </span>
                )}
              </div>
              {lvlInfo && <p className={`text-[10px] tracking-widest uppercase mt-0.5 ${LEVEL_COLORS[member.level || "staff"].split(" ")[0]}`}>{isEN ? lvlInfo.label : lvlInfo.labelEs}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isMasterAdmin && !isDraft && (
              <ViewAsButton targetUserId={member.id} targetName={member.full_name || "User"} onAfter={onClose} isEN={isEN} />
            )}
            <button onClick={onClose} className="text-cream/50 hover:text-cream"><X size={20} /></button>
          </div>
        </div>

        {/* Draft banner */}
        {isDraft && (
          <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/30 shrink-0">
            <p className="text-amber-400 text-xs font-medium">
              {isEN
                ? "This is a draft account — only admins can see it. Add a name and email, then send the invitation to activate."
                : "Esta es una cuenta borrador — solo los administradores pueden verla. Agrega nombre y correo, luego envía la invitación para activarla."}
            </p>
          </div>
        )}

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
              {/* Email field shown only for drafts — needed to send the invitation */}
              {isDraft && canEdit && (
                <div>
                  <FieldLabel label={isEN ? "Email (required to send invitation)" : "Correo (requerido para invitar)"} />
                  <Input
                    type="email"
                    value={draftEmail}
                    onChange={e => setDraftEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="bg-charcoal-light border-charcoal-light text-cream"
                  />
                </div>
              )}
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
                              await supabase.from("system_settings").delete().eq("key", "principal_user_id");
                              setIsPrincipal(false);
                            } else {
                              await supabase.from("system_settings").upsert({
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

              {/* Work roster — powers the staff-schedule worked-vs-expected calculator */}
              {canEdit && (level === "staff" || level === "manager") && (
                <div className="rounded-xl border border-charcoal-light bg-charcoal-light/40 p-3 space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {isEN ? "Work Roster" : "Horario Contratado"}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <FieldLabel label={isEN ? "Days/week" : "Días/sem"} />
                      <Input type="number" min={0} max={7} value={contractedDays}
                        onChange={(e) => setContractedDays(e.target.value)}
                        className="bg-charcoal border-charcoal-light text-cream h-9" />
                    </div>
                    <div>
                      <FieldLabel label={isEN ? "Hours/week" : "Horas/sem"} />
                      <Input type="number" min={0} max={80} step={0.5} value={contractedHours}
                        onChange={(e) => setContractedHours(e.target.value)}
                        className="bg-charcoal border-charcoal-light text-cream h-9" />
                    </div>
                    <div>
                      <FieldLabel label={isEN ? "Annual leave" : "Vacaciones"} />
                      <Input type="number" min={0} max={60} value={annualLeave}
                        onChange={(e) => setAnnualLeave(e.target.value)}
                        className="bg-charcoal border-charcoal-light text-cream h-9" />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {isEN
                      ? "Used by Staff Schedule to compute worked vs expected days/hours and annual leave remaining."
                      : "Usado por el horario del personal para calcular días/horas trabajados y vacaciones restantes."}
                  </p>
                </div>
              )}

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
                    <div key={section.key} className={`flex flex-col gap-1 px-3 py-2 rounded-lg transition-colors ${sp.view ? "bg-charcoal-light" : "opacity-50"}`}>
                      <div className="flex items-center gap-1">
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
                      {section.hasScope && sp.view && (
                        <div className="flex items-center gap-2 pl-2">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{isEN ? "Visibility" : "Visibilidad"}</span>
                          <select
                            value={sp.scope ?? "own"}
                            onChange={(e) => canEdit && setScope(section.key, e.target.value as "own" | "department" | "all")}
                            disabled={!canEdit}
                            className="text-[11px] bg-charcoal border border-charcoal-light rounded px-1.5 py-0.5 text-cream focus:outline-none focus:border-gold/50 disabled:opacity-50"
                          >
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
            {/* Draft: show Send Invitation CTA; non-draft: show Resend Invitation */}
            {isDraft ? (
              <Button
                disabled={sendingInvite || saving || deleting || !fullName || !draftEmail}
                onClick={handleSendInvitation}
                className="w-full bg-gold hover:bg-gold/90 text-charcoal font-semibold gap-2"
              >
                {sendingInvite ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                {sendingInvite
                  ? (isEN ? "Sending…" : "Enviando…")
                  : (isEN ? "Send Invitation" : "Enviar Invitación")}
              </Button>
            ) : (
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
            )}

            {/* Master admin: send password reset to existing users */}
            {isMasterAdmin && !isDraft && (
              <Button
                variant="outline"
                disabled={resettingPwd || saving || deleting || resending}
                onClick={handleSendPasswordReset}
                className="w-full bg-charcoal-light border border-gold/30 text-cream hover:bg-gold/10 hover:border-gold/60 gap-2 font-semibold"
              >
                {resettingPwd ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                {resettingPwd
                  ? (isEN ? "Sending…" : "Enviando…")
                  : (isEN ? "Send Password Reset" : "Enviar Restablecer Contraseña")}
              </Button>
            )}

            <Button onClick={handleSave} disabled={saving || deleting} className="w-full bg-gold hover:bg-gold/90 text-charcoal font-semibold">
              {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
              {saving ? (isEN ? "Saving…" : "Guardando…") : (isDraft ? (isEN ? "Save Draft" : "Guardar Borrador") : (isEN ? "Save Changes" : "Guardar Cambios"))}
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
