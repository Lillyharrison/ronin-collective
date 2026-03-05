import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChecklistItems, useChecklistSessions, useChecklistComments, ChecklistTemplate } from "@/hooks/useChecklists";
import { ChecklistItemRow } from "@/components/manuals/ChecklistItemRow";
import { cn } from "@/lib/utils";
import { fireConfetti } from "@/lib/confetti";
import {
  ArrowLeft, Printer, CheckCircle2, Plus, Send,
  MessageSquare, RotateCcw, Settings, Calendar, User,
  RefreshCw, Bell, Trash2,
} from "lucide-react";

const COLOR_BG: Record<string, string> = {
  green:  "bg-[hsl(var(--status-done)/0.15)] border-[hsl(var(--status-done)/0.3)] text-[hsl(var(--status-done))]",
  amber:  "bg-[hsl(var(--status-progress)/0.15)] border-[hsl(var(--status-progress)/0.3)] text-[hsl(var(--status-progress))]",
  red:    "bg-[hsl(var(--status-urgent)/0.15)] border-[hsl(var(--status-urgent)/0.3)] text-[hsl(var(--status-urgent))]",
  blue:   "bg-blue-500/15 border-blue-500/30 text-blue-500",
  gold:   "bg-[hsl(var(--gold)/0.15)] border-[hsl(var(--gold)/0.3)] text-[hsl(var(--gold))]",
  purple: "bg-purple-500/15 border-purple-500/30 text-purple-400",
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: "One-off",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  annual: "Annual",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  template: ChecklistTemplate;
  propertyId: string | null;
  propertyName?: string;
}

export function ChecklistDetailPage({ template, propertyId, propertyName }: Props) {
  const { closeChecklistDetail } = useNavigation();
  const { isAdmin, userId } = usePermissions();
  const { language } = useLanguage();

  const { items, loading, setItems } = useChecklistItems(template.id);
  const { completedIds, sessionMap, toggle } = useChecklistSessions(template.id, propertyId);
  const { comments, addComment } = useChecklistComments(template.id, propertyId);

  const [commentText, setCommentText] = useState("");
  const [showAdminPanel, setShowAdminPanel] = useState(!!isAdmin);
  const [addingItem, setAddingItem] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);

  // Admin template edit state
  const [recurrence, setRecurrence] = useState(template.recurrence ?? "none");
  const [recurrenceDay, setRecurrenceDay] = useState<number>(template.recurrence_day ?? 4);
  const [assignedRole, setAssignedRole] = useState(template.assigned_role ?? "");
  const [assignedDepartment, setAssignedDepartment] = useState(template.assigned_department ?? "");
  const [notifyOnDay, setNotifyOnDay] = useState(template.notify_on_day ?? false);
  const [onlyWhenOccupied, setOnlyWhenOccupied] = useState(template.only_when_occupied ?? false);
  const [savingSettings, setSavingSettings] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const progress = items.length > 0 ? Math.round((completedIds.size / items.length) * 100) : 0;
  const colorCls = COLOR_BG[template.color] ?? COLOR_BG.green;
  const isAllComplete = items.length > 0 && completedIds.size === items.length;

  const handleUpdate = async (id: string, changes: Partial<{ title: string; icon: string }>) => {
    await supabase.from("checklist_items").update(changes).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("checklist_items").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handlePhotoUpload = async (id: string, url: string) => {
    await supabase.from("checklist_items").update({ photo_url: url }).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, photo_url: url } : i));
  };

  const addItem = async () => {
    if (!newTitle.trim()) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
    const { data } = await supabase.from("checklist_items").insert({
      template_id: template.id, title: newTitle.trim(),
      icon: "▸", color: "default", sort_order: maxOrder, is_required: false,
    }).select().single();
    if (data) setItems(prev => [...prev, data as any]);
    setNewTitle(""); setAddingItem(false);
  };

  const handleMarkComplete = async () => {
    if (!userId || !isAllComplete) return;
    setIsMarkingComplete(true);

    // Get completer's name for the notification message
    const { data: completerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    const completerName = completerProfile?.full_name ?? "Staff";

    await addComment(`✅ List marked complete by ${completerName}`);
    fireConfetti();

    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const notifBody = `${completerName} completed all ${items.length} items${propertyName ? ` at ${propertyName}` : ""} on ${dateStr}.`;
    const notifTitle = `${template.icon} ${template.title} — Completed`;

    // Collect all users who should receive the notification:
    // 1. The completer themselves
    // 2. All admins and master_admins
    // 3. Managers assigned to this property
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["master_admin", "admin", "manager"]);

    const recipientIds = new Set<string>([userId]);

    for (const row of (adminRoles ?? [])) {
      if (row.role === "master_admin" || row.role === "admin") {
        recipientIds.add(row.user_id);
      } else if (row.role === "manager" && propertyId) {
        // Check if manager is assigned to this property
        const { data: mgr } = await supabase
          .from("profiles")
          .select("assigned_property_ids")
          .eq("id", row.user_id)
          .single();
        if (mgr?.assigned_property_ids?.includes(propertyId)) {
          recipientIds.add(row.user_id);
        }
      }
    }

    // Insert a notification for each recipient
    const notifRows = Array.from(recipientIds).map(uid => ({
      user_id: uid,
      title: notifTitle,
      body: notifBody,
      type: "success",
      action_url: "checklists",
      property_id: propertyId ?? null,
    }));

    await supabase.from("notifications").insert(notifRows);

    setIsMarkingComplete(false);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    await supabase.from("checklist_templates").update({
      recurrence,
      recurrence_day: recurrence === "weekly" || recurrence === "biweekly" ? recurrenceDay : null,
      assigned_role: assignedRole || null,
      assigned_department: assignedDepartment || null,
      notify_on_day: notifyOnDay,
      only_when_occupied: onlyWhenOccupied,
    }).eq("id", template.id);
    setSavingSettings(false);
    setShowAdminPanel(false);
  };

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const rows = items.map(item => {
      const done = completedIds.has(item.id);
      const session = sessionMap.get(item.id);
      const timeStr = session?.completed_at
        ? new Date(session.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "";
      return `<tr>
        <td style="width:24px;text-align:center;">${done ? "☑" : "☐"}</td>
        <td style="padding:4px 8px;">${item.icon} ${item.title}${item.is_required ? " *" : ""}</td>
        <td style="font-size:8pt;color:#aaa;white-space:nowrap;">${timeStr}</td>
      </tr>`;
    }).join("");
    const commentRows = comments.map(c =>
      `<p style="margin:4px 0;font-size:9pt;border-left:2px solid #ddd;padding-left:8px;">${c.content}</p>`
    ).join("");
    win.document.write(`<html><head><title>${template.title}</title>
      <style>
        @page{size:letter;margin:0.75in}body{font-family:'Georgia',serif;font-size:11pt;color:#1C1D20}
        h1{font-size:18pt;margin-bottom:4px}.meta{color:#888;font-size:9pt;margin-bottom:16px}
        table{width:100%;border-collapse:collapse}tr{border-bottom:1px solid #eee}td{padding:6px 4px;vertical-align:top}
        .footer{margin-top:20px;font-size:8pt;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:8px}
      </style></head><body>
      <h1>${template.icon} ${template.title}</h1>
      <p class="meta">${dateStr}${propertyName ? ` · ${propertyName}` : ""}</p>
      <p style="font-size:9pt;color:#888;margin-bottom:12px;">Progress: ${completedIds.size}/${items.length} (${progress}%)</p>
      <table>${rows}</table>
      ${comments.length > 0 ? `<h3 style="margin-top:20px;font-size:11pt;">Notes</h3>${commentRows}` : ""}
      <p class="footer">* Required items &nbsp;|&nbsp; Ronin Collective</p>
    </body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      {/* Header */}
      <div className="sticky top-14 z-20 bg-charcoal border-b border-charcoal-light">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={closeChecklistDetail}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-cream/60 hover:text-cream hover:bg-charcoal-light transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center text-base flex-shrink-0", colorCls)}>
            {template.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-cream font-semibold text-sm leading-tight truncate">{template.title}</h2>
            {propertyName && <p className="text-cream/40 text-[10px] truncate">{propertyName}</p>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(v => !v)}
                className={cn("p-2 rounded-xl transition-colors text-xs font-medium",
                  showAdminPanel ? "bg-gold/20 text-gold border border-gold/30" : "text-cream/50 hover:text-cream hover:bg-charcoal-light border border-transparent")}
                title="Toggle settings"
              >
                <Settings size={16} />
              </button>
            )}
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl text-cream/50 hover:text-cream hover:bg-charcoal-light transition-colors"
              title="Print"
            >
              <Printer size={16} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {items.length > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-charcoal-light rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500",
                    isAllComplete ? "bg-[hsl(var(--status-done))]" : "bg-[hsl(var(--gold))]"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[11px] text-cream/50 whitespace-nowrap font-mono">
                {completedIds.size}/{items.length}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Admin panel */}
      {showAdminPanel && (
        <div className="bg-card border-b border-border px-4 py-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin Settings</p>

          {/* Recurrence */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><RefreshCw size={11} /> Recurrence</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRecurrence(key)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    recurrence === key ? "bg-gold text-charcoal border-gold" : "border-border text-muted-foreground hover:border-gold/40"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Day trigger */}
          {(recurrence === "weekly" || recurrence === "biweekly") && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><Calendar size={11} /> Trigger Day</label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setRecurrenceDay(i)}
                    className={cn("px-2.5 py-1 rounded-lg text-xs border transition-colors",
                      recurrenceDay === i ? "bg-gold text-charcoal border-gold" : "border-border text-muted-foreground"
                    )}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Assigned role */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><User size={11} /> Assign to Role</label>
            <div className="flex flex-wrap gap-2">
              {["", "staff", "manager", "admin"].map(r => (
                <button
                  key={r}
                  onClick={() => setAssignedRole(r)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    assignedRole === r ? "bg-gold text-charcoal border-gold" : "border-border text-muted-foreground"
                  )}
                >
                  {r === "" ? "All Roles" : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Assigned department */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><User size={11} /> Assign to Department</label>
            <div className="flex flex-wrap gap-2">
              {["", "interior", "exterior", "kitchen", "security", "office"].map(d => (
                <button
                  key={d}
                  onClick={() => setAssignedDepartment(d)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize",
                    assignedDepartment === d ? "bg-gold text-charcoal border-gold" : "border-border text-muted-foreground"
                  )}
                >
                  {d === "" ? "All Departments" : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
            {assignedRole && assignedDepartment && (
              <p className="text-[10px] text-muted-foreground mt-2 bg-muted rounded-lg px-2 py-1.5">
                ↳ Will appear in the task list of <strong>{assignedRole}</strong> staff in the <strong>{assignedDepartment}</strong> department assigned to this property.
              </p>
            )}
          </div>


          {/* Notify toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5"><Bell size={11} /> Notify staff on trigger day</label>
            <button
              onClick={() => setNotifyOnDay(v => !v)}
              className={cn("w-10 h-5 rounded-full transition-colors relative",
                notifyOnDay ? "bg-gold" : "bg-muted"
              )}
            >
              <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                notifyOnDay ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
          </div>

          {/* Only when occupied toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                🏠 Only when occupied
              </label>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 ml-5">Disables this checklist when the property is vacant</p>
            </div>
            <button
              onClick={() => setOnlyWhenOccupied(v => !v)}
              className={cn("w-10 h-5 rounded-full transition-colors relative flex-shrink-0",
                onlyWhenOccupied ? "bg-gold" : "bg-muted"
              )}
            >
              <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                onlyWhenOccupied ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="w-full py-2.5 bg-gold text-charcoal text-sm font-semibold rounded-xl active:scale-95 transition-transform disabled:opacity-50"
          >
            {savingSettings ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}

      {/* Checklist metadata badges */}
      {((template.recurrence && template.recurrence !== "none") || template.assigned_role || template.assigned_department) && (
        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {template.recurrence && template.recurrence !== "none" && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              <RefreshCw size={9} /> {RECURRENCE_LABELS[template.recurrence] ?? template.recurrence}
            </span>
          )}
          {template.recurrence_day !== null && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              <Calendar size={9} /> Every {DAY_NAMES[template.recurrence_day]}
            </span>
          )}
          {template.assigned_role && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              <User size={9} /> {template.assigned_role}
            </span>
          )}
          {template.assigned_department && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 capitalize">
              <User size={9} /> {template.assigned_department}
            </span>
          )}
        </div>
      )}

      {/* Items list */}
      <div className="mt-3">
        {loading ? (
          <div className="px-4 space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-card border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-xs text-muted-foreground italic text-center">No items yet — add some below.</p>
        ) : (
          <div className="bg-card border border-border rounded-xl mx-4 overflow-hidden">
            {items.map((item, idx) => {
              const session = sessionMap.get(item.id);
              const completedAt = session?.completed_at
                ? new Date(session.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                : null;
              return (
                <div key={item.id} className={idx > 0 ? "border-t border-border" : ""}>
                  <ChecklistItemRow
                    item={item}
                    isCompleted={completedIds.has(item.id)}
                    isAdmin={!!isAdmin}
                    onToggle={() => toggle(item.id, completedIds.has(item.id))}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onPhotoUpload={handlePhotoUpload}
                  />
                  {completedAt && (
                    <p className="px-12 pb-1.5 text-[10px] text-[hsl(var(--status-done))] opacity-70">
                      ✓ {completedAt}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add item (admin) */}
        {isAdmin && (
          <div className="px-4 mt-3">
            {addingItem ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAddingItem(false); }}
                  placeholder="New item…"
                  className="flex-1 text-sm bg-card border border-border rounded-xl px-3 py-2 outline-none focus:border-gold"
                />
                <button onClick={addItem} className="text-xs px-3 py-2 bg-primary text-primary-foreground rounded-xl">Add</button>
                <button onClick={() => setAddingItem(false)} className="text-xs text-muted-foreground">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingItem(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <Plus size={12} /> Add item
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mark Complete button */}
      {items.length > 0 && (
        <div className="px-4 mt-6">
          <button
            onClick={handleMarkComplete}
            disabled={!isAllComplete || isMarkingComplete}
            className={cn(
              "w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
              isAllComplete
                ? "bg-[hsl(var(--status-done))] text-white shadow-lg active:scale-95"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
            )}
          >
            <CheckCircle2 size={16} />
            {isAllComplete
              ? (isMarkingComplete ? "Completing…" : "Mark List Complete 🎉")
              : `${items.length - completedIds.size} item${items.length - completedIds.size !== 1 ? "s" : ""} remaining`}
          </button>
        </div>
      )}

      {/* Comments section */}
      <div className="px-4 mt-6 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Notes & Comments
          </p>
          <span className="text-[10px] text-muted-foreground">({today})</span>
        </div>

        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic mb-3">No comments yet — add a note below.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {comments.map(c => (
              <div key={c.id} className="bg-card border border-border rounded-xl px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-gold text-[10px] font-semibold">
                      {(c.profile?.full_name ?? "U")[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {c.profile?.full_name ?? "Staff"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comment input */}
        <div className="flex items-center gap-2">
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { addComment(commentText); setCommentText(""); } }}
            placeholder="Add a note or comment…"
            className="flex-1 text-sm bg-card border border-border rounded-xl px-3 py-2.5 outline-none focus:border-gold placeholder:text-muted-foreground/50"
          />
          <button
            onClick={() => { if (commentText.trim()) { addComment(commentText); setCommentText(""); } }}
            disabled={!commentText.trim()}
            className="w-10 h-10 rounded-xl bg-gold text-charcoal flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
