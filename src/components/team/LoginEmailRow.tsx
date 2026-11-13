import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { isValidEmail } from "./memberAccess";

export const canChangeLoginEmail = (admin: boolean, draft: boolean, role?: string | null) => admin && !draft && role !== "master_admin";

async function invoke(body: { user_id: string; action?: "current"; new_email?: string }) {
  const { data, error } = await supabase.functions.invoke("admin-change-email", { body });
  if (error) {
    let message = error.message;
    try { message = (await (error as { context?: Response }).context?.json())?.error || message; } catch { /* use fallback */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as { masked_email?: string; ok?: boolean; emailSent?: boolean };
}

export function LoginEmailRow({ userId, isEN }: { userId: string; isEN: boolean }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const key = ["login-email-mask", user?.id, userId];
  const query = useQuery({ queryKey: key, queryFn: () => invoke({ user_id: userId, action: "current" }), retry: false });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setEmail(""); setUnderstood(false); } }, [open]);
  async function change() {
    if (!understood || !isValidEmail(email) || busy) return;
    setBusy(true);
    try {
      const newEmail = email.trim().toLowerCase();
      const result = await invoke({ user_id: userId, new_email: newEmail });
      if (!result.ok) throw new Error(isEN ? "The email could not be changed." : "No se pudo cambiar el correo.");
      toast.success(result.emailSent
        ? (isEN ? `Email changed. A link to set a new password was sent to ${newEmail}` : `Correo cambiado. Se envió un enlace para elegir una nueva contraseña a ${newEmail}`)
        : (isEN ? "Email changed, but the email could not be sent. Use Send password reset to try again." : "Correo cambiado, pero no se pudo enviar el mensaje. Usa Enviar restablecimiento de contraseña para volver a intentarlo."));
      await cache.invalidateQueries({ queryKey: key });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (isEN ? "Please try again." : "Inténtalo de nuevo."));
      await cache.invalidateQueries({ queryKey: key });
    } finally { setBusy(false); }
  }
  // A successful masked lookup is the proof this person actually has a login;
  // no-login profiles are not necessarily drafts.
  if (!query.data?.masked_email) return null;
  return <>
    <div className="col-span-full flex min-w-0 items-center justify-between gap-2">
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{isEN ? "Login email" : "Correo de acceso"}</p><p className="text-base text-cream break-all">{query.data.masked_email}</p></div>
      <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setOpen(true)}>{isEN ? "Change email" : "Cambiar correo"}</Button>
    </div>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="z-[100] bg-charcoal text-cream border-charcoal-light h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col w-full max-w-md top-auto bottom-0 translate-y-0 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2">
        <DialogTitle>{isEN ? "Change email" : "Cambiar correo"}</DialogTitle>
        <DialogDescription>{isEN ? "They will be signed out everywhere and we will email them a link to choose a new password." : "Se cerrará su sesión en todos los dispositivos y le enviaremos un enlace para elegir una nueva contraseña."}</DialogDescription>
        <label className="min-w-0 text-base">{isEN ? "New email" : "Nuevo correo"}<Input type="email" autoComplete="off" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} className="mt-2 min-h-11 text-base bg-charcoal-light text-cream border-charcoal-light" /></label>
        <label className="flex items-center gap-3 min-h-11 text-base"><Checkbox className="border-gold data-[state=checked]:bg-gold data-[state=checked]:text-charcoal" checked={understood} disabled={busy} onCheckedChange={v => setUnderstood(v === true)} />{isEN ? "I understand" : "Entiendo"}</label>
        <Button className="min-h-11 mt-auto sm:mt-2 bg-gold text-charcoal hover:bg-gold/90" disabled={busy || !understood || !isValidEmail(email)} onClick={() => void change()}>{busy ? (isEN ? "Changing…" : "Cambiando…") : (isEN ? "Change email" : "Cambiar correo")}</Button>
      </DialogContent>
    </Dialog>
  </>;
}