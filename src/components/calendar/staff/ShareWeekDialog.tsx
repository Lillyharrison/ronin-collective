import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";

interface ShareRow {
  id: string;
  share_token: string;
  week_start: string;
  label: string | null;
  revoked_at: string | null;
  created_at: string;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ShareWeekDialog({
  open,
  onOpenChange,
  weekStart,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  weekStart: Date;
  userId: string | null;
}) {
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");

  const loadShares = async () => {
    const { data } = await supabase
      .from("staff_schedule_shares")
      .select("id, share_token, week_start, label, revoked_at, created_at")
      .eq("week_start", weekStartStr)
      .order("created_at", { ascending: false })
      .limit(20);
    setShares((data as ShareRow[]) ?? []);
  };

  useEffect(() => {
    if (open) loadShares();
  }, [open, weekStartStr]);

  const createShare = async () => {
    if (!userId) return;
    setCreating(true);
    const token = randomToken();
    const { error } = await supabase.from("staff_schedule_shares").insert({
      share_token: token,
      week_start: weekStartStr,
      label: label.trim() || null,
      created_by: userId,
    });
    setCreating(false);
    if (error) {
      toast.error("Couldn't create share link");
      return;
    }
    setLabel("");
    toast.success("Share link ready");
    loadShares();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("staff_schedule_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Couldn't revoke"); return; }
    toast.success("Link revoked");
    loadShares();
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/schedule-share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — long-press to copy: " + url);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col max-w-md">
        <DialogHeader>
          <DialogTitle>Share this week</DialogTitle>
          <DialogDescription>
            Generates a link that lets a non-user edit shifts for the week of{" "}
            <span className="text-foreground font-medium">{format(weekStart, "d MMM yyyy")}</span> only.
            Changes save live. You can revoke anytime.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="share-label" className="text-xs">Label (optional)</Label>
            <Input
              id="share-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Maria — cover week"
              className="text-base"
            />
            <Button onClick={createShare} disabled={creating || !userId} className="w-full gap-2">
              <Link2 size={14} /> Create share link
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Active links for this week
            </p>
            {shares.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No links yet.</p>
            ) : (
              shares.map((s) => {
                const url = `${window.location.origin}/schedule-share/${s.share_token}`;
                const revoked = !!s.revoked_at;
                return (
                  <div
                    key={s.id}
                    className={`rounded-lg border p-3 space-y-2 ${revoked ? "opacity-50" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {s.label || "Untitled link"}
                          {revoked && <span className="ml-2 text-xs text-destructive">(revoked)</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{url}</p>
                      </div>
                    </div>
                    {!revoked && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5 h-8 text-xs"
                          onClick={() => copyLink(s.share_token)}
                        >
                          <Copy size={12} /> Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-destructive hover:text-destructive"
                          onClick={() => revoke(s.id)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
