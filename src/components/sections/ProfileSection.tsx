import { useState, useRef, useEffect } from "react";
import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  User, Trophy, Star, Flame, LogOut, Camera, Pencil, X, Check,
  Lock, Mail, Phone, Cake, BadgeCheck, Bell, BellOff, BellRing
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


type EditField = "name" | "email" | "phone" | "birthday" | "password" | null;

export function ProfileSection() {
  const { setActiveSection } = useNavigation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { userId: effectiveUserId, fullName, role, avatarUrl, canSee, loading: permLoading, isPreviewing, previewName } = usePermissions();
  const { toast } = useToast();
  const { supported: pushSupported, permission: pushPermission, subscribed: pushSubscribed, requestAndSubscribe } = usePushNotifications(user?.id ?? null);
  const [enablingPush, setEnablingPush] = useState(false);

  const [editField, setEditField] = useState<EditField>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Local state for editable fields (pre-populated from profile)
  const [localName, setLocalName] = useState("");
  const [localEmail, setLocalEmail] = useState(isPreviewing ? "" : (user?.email ?? ""));
  const [localPhone, setLocalPhone] = useState("");
  const [localBirthday, setLocalBirthday] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatarUrl);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showAchievements = canSee("achievements");
  const displayName = fullName || user?.user_metadata?.full_name || user?.email || "Profile";
  const initials = displayName.charAt(0).toUpperCase();

  // ─── load profile on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!effectiveUserId) return;
    supabase.from("profiles")
      .select("full_name, phone, birthday, avatar_url")
      .eq("id", effectiveUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setLocalName(data.full_name ?? "");
        setLocalPhone(data.phone ?? "");
        setLocalBirthday(data.birthday ?? "");
        setLocalAvatar(data.avatar_url ?? null);
      });
    // Email is auth-bound — only show real user's email when not previewing
    if (!isPreviewing) setLocalEmail(user?.email ?? "");
    else setLocalEmail("");
  }, [effectiveUserId, isPreviewing, user?.email]);

  // ─── open edit ────────────────────────────────────────────────────────
  const startEdit = (field: EditField) => {
    setEditField(field);
    setNewPassword("");
    setConfirmPassword("");
  };
  const cancelEdit = () => setEditField(null);

  // ─── save profile field ───────────────────────────────────────────────
  const saveProfile = async (updates: Record<string, string | null>) => {
    if (!effectiveUserId) return;
    setSaving(true);
    const { error } = await supabase.from("profiles")
      .update(updates)
      .eq("id", effectiveUserId);
    setSaving(false);
    if (error) {
      toast({ title: language === "es" ? "Error" : "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: language === "es" ? "Guardado" : "Saved", description: language === "es" ? "Perfil actualizado." : "Profile updated." });
      setEditField(null);
    }
  };

  // ─── save email (auth + profile) ─────────────────────────────────────
  const saveEmail = async () => {
    if (isPreviewing) {
      toast({ title: "Not allowed", description: "Email is auth-bound — exit preview to change your own email, or set it from User Management.", variant: "destructive" });
      return;
    }
    if (!localEmail.trim()) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ email: localEmail.trim() });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: language === "es" ? "Verificación enviada" : "Verification sent",
        description: language === "es"
          ? "Revisa tu bandeja para confirmar el nuevo correo."
          : "Check your inbox to confirm the new email address.",
      });
      setEditField(null);
    }
  };

  // ─── save password ────────────────────────────────────────────────────
  const savePassword = async () => {
    if (isPreviewing) {
      toast({ title: "Not allowed", description: "Use User Management to set this user's password.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: language === "es" ? "Error" : "Error", description: language === "es" ? "Las contraseñas no coinciden." : "Passwords don't match.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: language === "es" ? "Error" : "Error", description: language === "es" ? "Mínimo 6 caracteres." : "Minimum 6 characters.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: language === "es" ? "¡Listo!" : "Done!", description: language === "es" ? "Contraseña actualizada." : "Password updated successfully." });
      setEditField(null);
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  // ─── avatar upload ────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveUserId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: language === "es" ? "El archivo debe ser menor a 5MB." : "File must be under 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${effectiveUserId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast({ title: "Error", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", effectiveUserId);
    setLocalAvatar(publicUrl);
    setUploading(false);
    toast({ title: language === "es" ? "¡Foto actualizada!" : "Photo updated!", description: "" });
  };

  const t = (en: string, es: string) => language === "es" ? es : en;

  return (
    <div className="animate-fade-in pb-8">

      {/* ── Profile Hero ────────────────────────────────────────────── */}
      <div className="bg-charcoal px-5 pt-8 pb-6 border-b border-charcoal-light flex flex-col items-center text-center">
        {/* Avatar with camera overlay */}
        <div className="relative mb-4 group">
          <div className="w-24 h-24 rounded-full bg-gold/20 border-2 border-gold/60 flex items-center justify-center overflow-hidden">
            {localAvatar ? (
              <img
                src={localAvatar}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={() => setLocalAvatar(null)}
              />
            ) : (
              <span className="font-display text-gold text-4xl">{initials}</span>
            )}
          </div>
          {/* Upload overlay */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            {uploading ? (
              <span className="text-[10px] text-white font-medium">
                {t("Uploading…", "Subiendo…")}
              </span>
            ) : (
              <Camera size={20} className="text-white" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <h1 className="font-display text-2xl text-cream">{displayName}</h1>
        <span className="mt-1 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold text-[10px] tracking-widest uppercase font-semibold">
          {role ? role.replace("_", " ") : "Staff"}
        </span>

        {/* Mini stats — show real zeros, no fake data */}
        {showAchievements && !permLoading && (
          <div className="flex items-center gap-6 mt-4">
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-gold">
                <Star size={12} />
                <span className="text-cream font-semibold text-base">0</span>
              </div>
              <span className="text-cream/40 text-[9px] uppercase tracking-wider">
                {t("Points", "Puntos")}
              </span>
            </div>
            <div className="w-px h-8 bg-charcoal-light" />
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-status-urgent">
                <Flame size={12} />
                <span className="text-cream font-semibold text-base">0</span>
              </div>
              <span className="text-cream/40 text-[9px] uppercase tracking-wider">
                {t("Streak", "Racha")}
              </span>
            </div>
            <div className="w-px h-8 bg-charcoal-light" />
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1 text-gold">
                <Trophy size={12} />
                <span className="text-cream font-semibold text-base">0</span>
              </div>
              <span className="text-cream/40 text-[9px] uppercase tracking-wider">
                {t("Badges", "Logros")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Personal Information ─────────────────────────────────────── */}
      <div className="px-4 mt-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          {t("Personal Information", "Información Personal")}
        </p>

        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">

          {/* Preferred Name */}
          <ProfileRow
            icon={<User size={15} />}
            label={t("Preferred Name", "Nombre Preferido")}
            value={localName || displayName}
            editing={editField === "name"}
            onEdit={() => startEdit("name")}
            onCancel={cancelEdit}
            onSave={() => saveProfile({ full_name: localName.trim() || null })}
            saving={saving}
          >
            <Input
              value={localName}
              onChange={e => setLocalName(e.target.value)}
              placeholder={t("Your preferred name", "Tu nombre preferido")}
              className="h-9 text-sm"
              autoFocus
            />
          </ProfileRow>

          {/* Email */}
          <ProfileRow
            icon={<Mail size={15} />}
            label={t("Email Address", "Correo Electrónico")}
            value={user?.email ?? ""}
            editing={editField === "email"}
            onEdit={() => { setLocalEmail(user?.email ?? ""); startEdit("email"); }}
            onCancel={cancelEdit}
            onSave={saveEmail}
            saving={saving}
            saveLabel={t("Send verification", "Enviar verificación")}
          >
            <Input
              type="email"
              value={localEmail}
              onChange={e => setLocalEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-9 text-sm"
              autoFocus
            />
          </ProfileRow>

          {/* Phone */}
          <ProfileRow
            icon={<Phone size={15} />}
            label={t("Phone", "Teléfono")}
            value={localPhone || t("Not set", "Sin registrar")}
            editing={editField === "phone"}
            onEdit={() => startEdit("phone")}
            onCancel={cancelEdit}
            onSave={() => saveProfile({ phone: localPhone.trim() || null })}
            saving={saving}
          >
            <Input
              type="tel"
              value={localPhone}
              onChange={e => setLocalPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="h-9 text-sm"
              autoFocus
            />
          </ProfileRow>

          {/* Birthday */}
          <ProfileRow
            icon={<Cake size={15} />}
            label={t("Birthday", "Cumpleaños")}
            value={localBirthday
              ? new Date(localBirthday + "T12:00:00").toLocaleDateString(language === "es" ? "es-MX" : "en-US", { month: "long", day: "numeric" })
              : t("Not set", "Sin registrar")}
            editing={editField === "birthday"}
            onEdit={() => startEdit("birthday")}
            onCancel={cancelEdit}
            onSave={() => saveProfile({ birthday: localBirthday || null })}
            saving={saving}
          >
            <Input
              type="date"
              value={localBirthday}
              onChange={e => setLocalBirthday(e.target.value)}
              className="h-9 text-sm"
              autoFocus
            />
          </ProfileRow>

        </div>
      </div>

      {/* ── Security ─────────────────────────────────────────────────── */}
      <div className="px-4 mt-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          {t("Security", "Seguridad")}
        </p>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {editField === "password" ? (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-foreground">
                  <Lock size={15} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{t("Change Password", "Cambiar Contraseña")}</span>
                </div>
                <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("New password", "Nueva contraseña")}</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("Confirm password", "Confirmar contraseña")}</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 text-sm"
                  onKeyDown={e => e.key === "Enter" && savePassword()}
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={savePassword}
                disabled={saving || !newPassword || !confirmPassword}
              >
                {saving ? t("Saving…", "Guardando…") : t("Update Password", "Actualizar Contraseña")}
              </Button>
            </div>
          ) : (
            <button
              onClick={() => startEdit("password")}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Lock size={15} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t("Change Password", "Cambiar Contraseña")}</p>
                  <p className="text-xs text-muted-foreground">••••••••</p>
                </div>
              </div>
              <Pencil size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* ── Read-only info ────────────────────────────────────────────── */}
      <div className="px-4 mt-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          {t("Your Role & Access", "Tu Rol y Acceso")}
        </p>
        <div className="rounded-xl border border-border bg-card px-4 py-3.5">
          <div className="flex items-center gap-3">
            <BadgeCheck size={15} className="text-gold" />
            <div>
              <p className="text-sm font-medium text-foreground capitalize">
                {role ? role.replace("_", " ") : "Staff"}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Managed by your administrator", "Gestionado por tu administrador")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Push Notifications ───────────────────────────────────────── */}
      {pushSupported && (
        <div className="px-4 mt-5">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
            {t("Notifications", "Notificaciones")}
          </p>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                {pushPermission === "granted" && pushSubscribed ? (
                  <BellRing size={15} className="text-[hsl(var(--status-done))]" />
                ) : pushPermission === "denied" ? (
                  <BellOff size={15} className="text-destructive" />
                ) : (
                  <Bell size={15} className="text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("Push Notifications", "Notificaciones Push")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pushPermission === "denied"
                      ? t("Blocked in browser settings", "Bloqueado en configuración del navegador")
                      : pushSubscribed
                        ? t("Active on this device", "Activo en este dispositivo")
                        : t("Get alerts for new messages", "Recibe alertas de nuevos mensajes")}
                  </p>
                </div>
              </div>
              {pushPermission !== "denied" && !pushSubscribed && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={enablingPush}
                  onClick={async () => {
                    setEnablingPush(true);
                    const ok = await requestAndSubscribe();
                    setEnablingPush(false);
                    if (ok) {
                      toast({ title: t("Notifications enabled!", "¡Notificaciones activadas!"), description: t("You'll receive alerts on this device.", "Recibirás alertas en este dispositivo.") });
                    } else {
                      toast({ title: t("Couldn't enable", "No se pudo activar"), description: t("Check your browser settings.", "Revisa la configuración del navegador."), variant: "destructive" });
                    }
                  }}
                  className="text-xs"
                >
                  {enablingPush ? t("Enabling…", "Activando…") : t("Enable", "Activar")}
                </Button>
              )}
              {pushSubscribed && (
                <span className="text-[10px] text-[hsl(var(--status-done))] font-semibold uppercase tracking-wider">
                  {t("On", "Activo")}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Badges — placeholder until achievements system is live ─── */}
      {showAchievements && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("My Badges", "Mis Logros")}
            </p>
            <button
              onClick={() => setActiveSection("achievements")}
              className="text-gold text-xs flex items-center gap-1"
            >
              {t("View all", "Ver todos")} →
            </button>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <Trophy size={24} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">{t("No badges earned yet", "Aún no hay logros")}</p>
          </div>
        </div>
      )}

      {/* ── Sign out ─────────────────────────────────────────────────── */}
      <div className="px-4 mt-6">
        <Button
          variant="outline"
          className="w-full gap-2 text-muted-foreground border-border hover:border-destructive hover:text-destructive"
          onClick={async () => { await supabase.auth.signOut(); }}
        >
          <LogOut size={15} />
          {t("Sign out", "Cerrar sesión")}
        </Button>
      </div>
    </div>
  );
}

// ─── Reusable editable row ─────────────────────────────────────────────────
interface ProfileRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
  children: React.ReactNode;
}

function ProfileRow({ icon, label, value, editing, onEdit, onCancel, onSave, saving, saveLabel, children }: ProfileRowProps) {
  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{icon}</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>
        {children}
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={onSave}
          disabled={saving}
        >
          {saving
            ? "Saving…"
            : saveLabel ?? <><Check size={13} className="mr-1" />Save</>
          }
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={onEdit}
      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-muted-foreground flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm text-foreground truncate">{value}</p>
        </div>
      </div>
      <Pencil size={14} className="text-muted-foreground flex-shrink-0 ml-2" />
    </button>
  );
}
