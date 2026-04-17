import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { Shield, Check, X, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PendingRule {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  color: string;
  submitted_by: string | null;
  submitted_source: string;
  created_at: string;
  is_universal: boolean;
  property_id: string | null;
  propertyName?: string;
  submitterName?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  chat: "via Chat",
  ronin_ai: "via Ronin AI",
  staff: "Staff suggestion",
  guest: "Guest suggestion",
  manual: "Manual entry",
};

export function usePendingRulesCount() {
  const { isMasterAdmin } = usePermissions();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!isMasterAdmin) return;
    const { count: c } = await supabase
      .from("property_rules")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval");
    setCount(c ?? 0);
  }, [isMasterAdmin]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!isMasterAdmin) return;
    const channel = supabase
      .channel("pending-rules-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "property_rules" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isMasterAdmin, load]);

  return { count, reload: load };
}

export function PendingRulesWidget() {
  const { isMasterAdmin, userId } = usePermissions();
  const { setActiveSection } = useNavigation();
  const [pending, setPending] = useState<PendingRule[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectionText, setRejectionText] = useState<Record<string, string>>({});
  const [showReject, setShowReject] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!isMasterAdmin) return;
    setLoading(true);
    // Narrow column list — only what this widget renders. Skips heavy
    // arrays (enacted_keywords, enacted_event_types, enacted_occupant_ids,
    // applies_to_roles, visible_to_user_ids) and unused fields. Cap at 50
    // so even an extreme backlog doesn't bloat the payload.
    const { data } = await supabase
      .from("property_rules")
      .select("id, title, description, icon, color, submitted_by, submitted_source, created_at, is_universal, property_id")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: true })
      .limit(50);

    if (!data) { setLoading(false); return; }

    // Fetch property names and submitter names
    const propIds = [...new Set(data.filter(r => r.property_id).map(r => r.property_id as string))];
    const userIds = [...new Set(data.filter(r => r.submitted_by).map(r => r.submitted_by as string))];

    const [{ data: props }, { data: profiles }] = await Promise.all([
      propIds.length > 0 ? supabase.from("properties").select("id, name").in("id", propIds) : { data: [] },
      userIds.length > 0 ? supabase.from("profiles").select("id, full_name").in("id", userIds) : { data: [] },
    ]);

    const propMap: Record<string, string> = {};
    (props ?? []).forEach((p: any) => { propMap[p.id] = p.name; });
    const nameMap: Record<string, string> = {};
    (profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name ?? "Unknown"; });

    setPending(data.map(r => ({
      ...r,
      propertyName: r.property_id ? propMap[r.property_id] : undefined,
      submitterName: r.submitted_by ? nameMap[r.submitted_by] : undefined,
    })));
    setLoading(false);
  }, [isMasterAdmin]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Realtime ping to refresh
  useEffect(() => {
    if (!isMasterAdmin) return;
    const channel = supabase
      .channel("pending-rules-widget")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "property_rules" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isMasterAdmin, load]);

  const approve = async (rule: PendingRule) => {
    setActing(rule.id);
    await supabase.from("property_rules").update({
      status: "active",
      is_active: true,
      submitted_by: rule.submitted_by,
    }).eq("id", rule.id);
    setPending(prev => prev.filter(r => r.id !== rule.id));
    setActing(null);
  };

  const reject = async (rule: PendingRule) => {
    setActing(rule.id);
    await supabase.from("property_rules").update({
      status: "rejected",
      is_active: false,
      rejection_reason: rejectionText[rule.id] || null,
    }).eq("id", rule.id);
    setPending(prev => prev.filter(r => r.id !== rule.id));
    setActing(null);
    setShowReject(prev => ({ ...prev, [rule.id]: false }));
  };

  if (!isMasterAdmin) return null;

  const count = pending.length;

  return (
    <div className="fixed bottom-20 right-4 z-40">
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "relative flex items-center gap-2 px-3 py-2.5 rounded-2xl shadow-xl border transition-all",
          count > 0
            ? "bg-[hsl(var(--status-pending))] border-[hsl(var(--status-pending)/0.5)] text-white animate-pulse-slow"
            : "bg-card border-border text-muted-foreground"
        )}
      >
        <Shield size={16} />
        {count > 0 ? (
          <>
            <span className="text-xs font-bold">{count} pending rule{count !== 1 ? "s" : ""}</span>
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive rounded-full text-[9px] text-white font-bold flex items-center justify-center">
              {count}
            </span>
          </>
        ) : (
          <span className="text-xs font-medium">Rules</span>
        )}
        {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {/* Expanded panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-12 right-0 w-80 max-h-[60vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col z-40 overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[hsl(var(--status-pending))]" />
                <span className="text-sm font-semibold">Pending Approvals</span>
                {count > 0 && (
                  <span className="bg-[hsl(var(--status-pending))] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </div>
              <button
                onClick={() => { setOpen(false); setActiveSection("rules"); }}
                className="text-[10px] text-gold hover:underline"
              >
                View all rules →
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="p-4 space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
                </div>
              ) : pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <Shield size={28} className="text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">No pending rules</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">All caught up!</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {pending.map(rule => (
                    <div key={rule.id} className="p-4 space-y-2">
                      {/* Rule info */}
                      <div className="flex items-start gap-2">
                        <span className="text-lg flex-shrink-0">{rule.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-snug">{rule.title}</p>
                          {rule.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                              {rule.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {rule.submitterName && (
                              <span className="text-[10px] text-muted-foreground">
                                From {rule.submitterName}
                              </span>
                            )}
                            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                              {SOURCE_LABEL[rule.submitted_source] ?? rule.submitted_source}
                            </span>
                            {rule.propertyName && (
                              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                                {rule.propertyName}
                              </span>
                            )}
                            {rule.is_universal && (
                              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                                Universal
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Rejection reason input */}
                      {showReject[rule.id] && (
                        <input
                          value={rejectionText[rule.id] ?? ""}
                          onChange={e => setRejectionText(prev => ({ ...prev, [rule.id]: e.target.value }))}
                          placeholder="Reason for rejection (optional)"
                          className="w-full text-xs bg-muted border border-border rounded-lg px-3 py-1.5 outline-none focus:border-gold text-foreground placeholder:text-muted-foreground"
                        />
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => approve(rule)}
                          disabled={acting === rule.id}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[hsl(var(--status-done)/0.12)] border border-[hsl(var(--status-done)/0.3)] text-[hsl(var(--status-done))] rounded-lg text-xs font-medium hover:bg-[hsl(var(--status-done)/0.2)] transition-colors disabled:opacity-40"
                        >
                          <Check size={12} /> Approve
                        </button>
                        {showReject[rule.id] ? (
                          <button
                            onClick={() => reject(rule)}
                            disabled={acting === rule.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg text-xs font-medium hover:bg-destructive/20 transition-colors disabled:opacity-40"
                          >
                            <X size={12} /> Confirm Reject
                          </button>
                        ) : (
                          <button
                            onClick={() => setShowReject(prev => ({ ...prev, [rule.id]: true }))}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-muted border border-border text-muted-foreground rounded-lg text-xs font-medium hover:text-foreground transition-colors"
                          >
                            <X size={12} /> Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
