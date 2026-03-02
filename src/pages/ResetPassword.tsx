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
  const { toast } = useToast();

  useEffect(() => {
    // Handle both password reset and new user invite flows
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setValidSession(true);
    });
    // Also check if we already have a session (invite token already exchanged)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
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
            <h2 className="font-semibold text-foreground">Password updated!</h2>
            <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
            <Button className="w-full mt-2" onClick={() => window.location.href = "/"}>Go to app</Button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-foreground mb-1">Set new password</h2>
            <p className="text-sm text-muted-foreground mb-6">Choose a strong password for your account.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>New password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm password</Label>
                <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
