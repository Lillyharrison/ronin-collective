import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import roninLogo from "@/assets/ronin-logo.png";

type Mode = "login" | "signup" | "forgot";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: "Account created!",
          description: "Please check your email to confirm your account.",
        });

      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setForgotSent(true);
      }
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <img src={roninLogo} alt="Ronin Collective" className="h-10 object-contain" />
        <p className="text-muted-foreground text-sm tracking-widest uppercase font-light">
          Property Management
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-8">
        {mode === "forgot" ? (
          forgotSent ? (
            <div className="text-center space-y-3">
              <div className="text-3xl">📬</div>
              <h2 className="font-semibold text-foreground">Check your inbox</h2>
              <p className="text-sm text-muted-foreground">
                We've sent a password reset link to <strong>{email}</strong>
              </p>
              <button
                onClick={() => { setMode("login"); setForgotSent(false); }}
                className="text-sm text-accent underline underline-offset-4 mt-2"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-foreground mb-1">Reset password</h2>
              <p className="text-sm text-muted-foreground mb-6">Enter your email and we'll send a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </form>
              <button onClick={() => setMode("login")} className="mt-4 text-sm text-muted-foreground underline underline-offset-4 w-full text-center">
                Back to sign in
              </button>
            </>
          )
        ) : (
          <>
            <h2 className="text-xl font-semibold text-foreground mb-1">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {mode === "login" ? "Sign in to your Ronin account." : "Sign up to get started."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "login" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs text-muted-foreground underline underline-offset-4">
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>Don't have an account?{" "}
                  <button onClick={() => setMode("signup")} className="text-accent underline underline-offset-4">Sign up</button>
                </>
              ) : (
                <>Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="text-accent underline underline-offset-4">Sign in</button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <p className="mt-8 text-xs text-muted-foreground/50">© {new Date().getFullYear()} Ronin Collective</p>
    </div>
  );
}
