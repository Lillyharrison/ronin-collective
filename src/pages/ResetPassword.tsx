import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import roninLogo from "@/assets/ronin-logo.png";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Supabase appends the token as a URL hash fragment.
    // We need to let onAuthStateChange handle the token exchange BEFORE
    // checking getSession(), so listen first.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setValidSession(true);
        setSessionChecked(true);
      } else if (event === "SIGNED_OUT") {
        setValidSession(false);
        setSessionChecked(true);
      }
    });

    // Also handle already-active sessions (e.g. user refreshes page)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true);
        setSessionChecked(true);
      } else {
        // Give onAuthStateChange a moment to process the hash token
        setTimeout(() => setSessionChecked(true), 2000);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setDone(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="mb-10 flex flex-col items-center gap-3">
        <img src={roninLogo} alt="Ronin Collective" className="h-10 object-contain" />
      </div>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-8">
        {done ? (
          <div className="text-center space-y-3">
            <div className="text-3xl">✅</div>
            <h2 className="font-semibold text-foreground">Password set!</h2>
            <p className="text-sm text-muted-foreground">Your account is ready. You can now sign in.</p>
            <Button className="w-full mt-2" onClick={() => window.location.href = "/"}>Open Ronin</Button>
          </div>
        ) : !sessionChecked ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Verifying your invite link…</p>
          </div>
        ) : !validSession ? (
          <div className="text-center space-y-3">
            <div className="text-3xl">⚠️</div>
            <h2 className="font-semibold text-foreground">Link expired or invalid</h2>
            <p className="text-sm text-muted-foreground">
              This invite link has expired or already been used. Ask your admin to resend the invitation.
            </p>
            <Button variant="outline" className="w-full mt-2" onClick={() => window.location.href = "/auth"}>
              Go to Sign In
            </Button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-foreground mb-1">Set your password</h2>
            <p className="text-sm text-muted-foreground mb-6">Choose a strong password to complete your account setup.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm password</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Setting password…" : "Set Password & Continue"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
