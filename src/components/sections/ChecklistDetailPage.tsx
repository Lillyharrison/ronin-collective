import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChecklistItems, useChecklistSessions, useChecklistComments, ChecklistTemplate, ChecklistProduct, ChecklistItem } from "@/hooks/useChecklists";
import { SortableChecklistItem } from "@/components/manuals/SortableChecklistItem";
import { cn } from "@/lib/utils";
import { fireConfetti } from "@/lib/confetti";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  ArrowLeft, Printer, CheckCircle2, Plus, Send,
  MessageSquare, Settings, Calendar, User,
  RefreshCw, Bell, Trash2, Pencil, ExternalLink,
  Image as ImageIcon, Link, Package, X, Camera, Share2,
} from "lucide-react";
import { SectionsManager, ItemSectionPicker } from "@/components/checklists/SectionsManager";
import { toast } from "sonner";

const COLOR_BG: Record<string, string> = {
  green:  "bg-[hsl(var(--status-done)/0.15)] border-[hsl(var(--status-done)/0.3)] text-[hsl(var(--status-done))]",
  amber:  "bg-[hsl(var(--status-progress)/0.15)] border-[hsl(var(--status-progress)/0.3)] text-[hsl(var(--status-progress))]",
  red:    "bg-[hsl(var(--status-urgent)/0.15)] border-[hsl(var(--status-urgent)/0.3)] text-[hsl(var(--status-urgent))]",
  blue:   "bg-blue-500/15 border-blue-500/30 text-blue-500",
  gold:   "bg-[hsl(var(--gold)/0.15)] border-[hsl(var(--gold)/0.3)] text-[hsl(var(--gold))]",
  purple: "bg-purple-500/15 border-purple-500/30 text-purple-400",
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: "One-off", daily: "Daily", weekly: "Weekly",
  biweekly: "Bi-weekly", monthly: "Monthly", annual: "Annual",
};

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const ICON_BANK = ["🧹","🛏️","🚿","🍳","🗑️","💧","🧴","🧽","💡","🔒","🌿","📸","❄️","🔧","⚠️","✅","☀️","🪣","🧊","🔑","📅","🛒","🕯️","🥂","🍷","🌸","🎵","📺","🔊","📶","🚨","📹","🏊","🪑","🌬️","🔌","💎","🎨","🪵","⬜","✨","🛋️","🌀","🔋","⛔","📄","💼","💻","💃","⚽","⚾","🏀","⛷️","⛵","🔥","🥩","🥗","🧺","🪴","🛁","🪟","🏡","🔑","🗝️","📦","🧲","🎯","🫧","🪥","🧻"];

interface Props {
  template: ChecklistTemplate;
  propertyId: string | null;
  propertyName?: string;
}

export function ChecklistDetailPage({ template: initialTemplate, propertyId, propertyName }: Props) {
  const { closeChecklistDetail } = useNavigation();
  const { isAdmin, isMasterAdmin, userId } = usePermissions();
  const { language } = useLanguage();

  // Live template state (so edits reflect immediately without full reload)
  const [template, setTemplate] = useState(initialTemplate);

  const { items, loading, setItems } = useChecklistItems(template.id);
  const { completedIds, sessionMap, toggle } = useChecklistSessions(template.id, propertyId);
  const { comments, addComment } = useChecklistComments(template.id, propertyId);

  const [commentText, setCommentText] = useState("");
  const [showAdminPanel, setShowAdminPanel] = useState(!!isAdmin);
  const [addingItem, setAddingItem] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);

  // ── Title editing ──────────────────────────────────────────────
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(template.title);
  const [editingIcon, setEditingIcon] = useState(false);

  const saveTitle = async () => {
    if (!titleDraft.trim() || titleDraft === template.title) { setEditingTitle(false); return; }
    await supabase.from("checklist_templates").update({ title: titleDraft.trim() }).eq("id", template.id);
    setTemplate(t => ({ ...t, title: titleDraft.trim() }));
    setEditingTitle(false);
  };

  const saveIcon = async (icon: string) => {
    await supabase.from("checklist_templates").update({ icon }).eq("id", template.id);
    setTemplate(t => ({ ...t, icon }));
    setEditingIcon(false);
  };

  // ── Cover image ────────────────────────────────────────────────
  const coverRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  const handleCoverUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setCoverUploading(true);
    const ext = file.name.split(".").pop();
    const path = `checklist-covers/${template.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("manuals").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("manuals").getPublicUrl(path);
      await supabase.from("checklist_templates").update({ cover_image_url: data.publicUrl }).eq("id", template.id);
      setTemplate(t => ({ ...t, cover_image_url: data.publicUrl }));
    }
    setCoverUploading(false);
  };

  const removeCover = async () => {
    await supabase.from("checklist_templates").update({ cover_image_url: null }).eq("id", template.id);
    setTemplate(t => ({ ...t, cover_image_url: null }));
  };

  // ── Manual link ────────────────────────────────────────────────
  const [editingManualLink, setEditingManualLink] = useState(false);
  const [manualLinkUrl, setManualLinkUrl] = useState(template.manual_link_url ?? "");
  const [manualLinkLabel, setManualLinkLabel] = useState(template.manual_link_label ?? "");

  const saveManualLink = async () => {
    await supabase.from("checklist_templates").update({
      manual_link_url: manualLinkUrl.trim() || null,
      manual_link_label: manualLinkLabel.trim() || null,
    }).eq("id", template.id);
    setTemplate(t => ({
      ...t,
      manual_link_url: manualLinkUrl.trim() || null,
      manual_link_label: manualLinkLabel.trim() || null,
    }));
    setEditingManualLink(false);
  };

  const removeManualLink = async () => {
    await supabase.from("checklist_templates").update({ manual_link_url: null, manual_link_label: null }).eq("id", template.id);
    setTemplate(t => ({ ...t, manual_link_url: null, manual_link_label: null }));
    setManualLinkUrl(""); setManualLinkLabel("");
  };

  // ── Products ───────────────────────────────────────────────────
  const [products, setProducts] = useState<ChecklistProduct[]>(
    Array.isArray(template.products) ? template.products : []
  );
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const productImgRef = useRef<{ [id: string]: HTMLInputElement | null }>({});

  const persistProducts = async (updated: ChecklistProduct[]) => {
    setProducts(updated);
    await supabase.from("checklist_templates").update({ products: updated as any }).eq("id", template.id);
  };

  const addProduct = async () => {
    if (!newProductName.trim()) return;
    const newProd: ChecklistProduct = {
      id: crypto.randomUUID(),
      name: newProductName.trim(),
      notes: null,
      image_url: null,
    };
    await persistProducts([...products, newProd]);
    setNewProductName(""); setAddingProduct(false);
  };

  const removeProduct = (id: string) => persistProducts(products.filter(p => p.id !== id));

  const updateProduct = (id: string, changes: Partial<ChecklistProduct>) =>
    persistProducts(products.map(p => p.id === id ? { ...p, ...changes } : p));

  const handleProductImage = async (productId: string, file: File) => {
    if (!file.type.startsWith("image/")) return;
    const ext = file.name.split(".").pop();
    const path = `checklist-products/${productId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("manuals").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("manuals").getPublicUrl(path);
      await updateProduct(productId, { image_url: data.publicUrl });
    }
  };

  // ── Admin settings ─────────────────────────────────────────────
  const [recurrence, setRecurrence] = useState(template.recurrence ?? "none");
  const [recurrenceDay, setRecurrenceDay] = useState<number>(template.recurrence_day ?? 4);
  const [assignedRole, setAssignedRole] = useState(template.assigned_role ?? "");
  const [assignedDepartment, setAssignedDepartment] = useState(template.assigned_department ?? "");
  const [notifyOnDay, setNotifyOnDay] = useState(template.notify_on_day ?? false);
  const [onlyWhenOccupied, setOnlyWhenOccupied] = useState(template.only_when_occupied ?? false);
  const [savingSettings, setSavingSettings] = useState(false);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, sort_order: idx }));
    setItems(reordered);
    // Persist all sort_order changes
    await Promise.all(
      reordered.map(item => supabase.from("checklist_items").update({ sort_order: item.sort_order }).eq("id", item.id))
    );
  };

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const today = new Date().toISOString().slice(0, 10);
  const progress = items.length > 0 ? Math.round((completedIds.size / items.length) * 100) : 0;
  const colorCls = COLOR_BG[template.color] ?? COLOR_BG.green;
  const isAllComplete = items.length > 0 && completedIds.size === items.length;

  const handleUpdate = async (id: string, changes: Partial<ChecklistItem>) => {
    // Optimistic local update so saved edits (title, icon, notes, photo, etc.) appear immediately
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
    const { error } = await supabase.from("checklist_items").update(changes).eq("id", id);
    if (error) {
      toast.error("Could not save change");
      // Revert by reloading from DB
      const { data } = await supabase
        .from("checklist_items")
        .select("id, template_id, title, icon, color, container, section, photo_url, notes, is_required, sort_order, created_at, updated_at")
        .eq("template_id", template.id)
        .order("sort_order")
        .limit(500);
      setItems((data as ChecklistItem[]) ?? []);
    }
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
    const { data: completerProfile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    const completerName = completerProfile?.full_name ?? "Staff";
    await addComment(`✅ List marked complete by ${completerName}`);
    fireConfetti();
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const notifBody = `${completerName} completed all ${items.length} items${propertyName ? ` at ${propertyName}` : ""} on ${dateStr}.`;
    const notifTitle = `${template.icon} ${template.title} — Completed`;
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id, role").in("role", ["master_admin", "manager"]);
    const recipientIds = new Set<string>([userId]);
    const checklistDept = template.assigned_department;
    for (const row of (adminRoles ?? [])) {
      if (row.role === "master_admin") { recipientIds.add(row.user_id); }
      else if (row.role === "manager" && propertyId) {
        const { data: mgr } = await supabase.from("profiles").select("assigned_property_ids, department").eq("id", row.user_id).single();
        if (mgr?.assigned_property_ids?.includes(propertyId) && (!checklistDept || mgr?.department === checklistDept)) {
          recipientIds.add(row.user_id);
        }
      }
    }
    await supabase.from("notifications").insert(
      Array.from(recipientIds).map(uid => ({
        user_id: uid, title: notifTitle, body: notifBody,
        type: "success", action_url: "checklists", property_id: propertyId ?? null,
      }))
    );
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
      const timeStr = session?.completed_at ? new Date(session.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
      return `<tr><td>${done ? "☑" : "☐"}</td><td>${item.icon} ${item.title}${item.is_required ? " *" : ""}</td><td>${timeStr}</td></tr>`;
    }).join("");
    win.document.write(`<html><head><title>${template.title}</title><style>@page{size:letter;margin:0.75in}body{font-family:'Georgia',serif;font-size:11pt}table{width:100%;border-collapse:collapse}tr{border-bottom:1px solid #eee}td{padding:6px 4px}</style></head><body><h1>${template.icon} ${template.title}</h1><p>${dateStr}</p><table>${rows}</table></body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="min-h-screen bg-background animate-fade-in">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="sticky top-14 z-20 bg-charcoal border-b border-charcoal-light">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={closeChecklistDetail} className="w-9 h-9 flex items-center justify-center rounded-xl text-cream/60 hover:text-cream hover:bg-charcoal-light transition-colors flex-shrink-0">
            <ArrowLeft size={20} />
          </button>

          {/* Icon — clickable for master admin */}
          <div className="relative">
            <button
              disabled={!isMasterAdmin}
              onClick={() => isMasterAdmin && setEditingIcon(v => !v)}
              className={cn("w-9 h-9 rounded-xl border flex items-center justify-center text-base flex-shrink-0 transition-all", colorCls, isMasterAdmin && "hover:opacity-80 cursor-pointer")}
            >
              {template.icon}
            </button>
            {editingIcon && isMasterAdmin && (
              <div className="absolute top-10 left-0 z-50 bg-card border border-border rounded-xl p-2 grid grid-cols-8 gap-1 shadow-xl w-72 max-h-48 overflow-y-auto">
                {ICON_BANK.map(ic => (
                  <button key={ic} onClick={() => saveIcon(ic)}
                    className={cn("text-base p-1 rounded hover:bg-muted", template.icon === ic && "bg-muted")}>
                    {ic}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title — inline edit for master admin */}
          <div className="flex-1 min-w-0">
            {editingTitle && isMasterAdmin ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(template.title); } }}
                className="w-full bg-charcoal-light border border-gold/40 rounded-lg px-2 py-1 text-cream text-sm font-semibold outline-none"
              />
            ) : (
              <div className="flex items-center gap-1.5 group/title">
                <h2 className="text-cream font-semibold text-sm leading-tight truncate">{template.title}</h2>
                {isMasterAdmin && (
                  <button onClick={() => { setEditingTitle(true); setTitleDraft(template.title); }}
                    className="opacity-0 group-hover/title:opacity-100 transition-opacity text-cream/40 hover:text-gold">
                    <Pencil size={11} />
                  </button>
                )}
              </div>
            )}
            {propertyName && <p className="text-cream/40 text-[10px] truncate">{propertyName}</p>}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isAdmin && (
              <button
                onClick={async () => {
                  const slugify = (s: string) =>
                    (s || "checklist")
                      .toLowerCase()
                      .normalize("NFKD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, "")
                      .slice(0, 60) || "checklist";
                  const baseSlug = slugify(template.title || "checklist");
                  const suffix = Math.random().toString(36).slice(2, 6);
                  let token = `${baseSlug}-${suffix}`;
                  let { error } = await supabase.from("checklist_public_sessions").insert({
                    share_token: token,
                    template_id: template.id,
                    property_id: propertyId,
                    created_by: userId,
                  });
                  if (error) {
                    // Likely unique-collision — retry with a longer suffix
                    token = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
                    const retry = await supabase.from("checklist_public_sessions").insert({
                      share_token: token,
                      template_id: template.id,
                      property_id: propertyId,
                      created_by: userId,
                    });
                    if (retry.error) { toast.error(t("couldNotCreateShareLink")); return; }
                  }
                  const langSuffix = language === "es" ? "?lang=es" : "";
                  const url = `${window.location.origin}/checklist-share/${token}${langSuffix}`;
                  await navigator.clipboard.writeText(url).catch(() => {});
                  toast.success(t("publicLinkCopied"));
                }}
                title="Create public share link"
                className="p-2 rounded-xl text-cream/50 hover:text-cream hover:bg-charcoal-light transition-colors"
              >
                <Share2 size={16} />
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setShowAdminPanel(v => !v)}
                className={cn("p-2 rounded-xl transition-colors", showAdminPanel ? "bg-gold/20 text-gold border border-gold/30" : "text-cream/50 hover:text-cream hover:bg-charcoal-light border border-transparent")}>
                <Settings size={16} />
              </button>
            )}
            <button onClick={handlePrint} className="p-2 rounded-xl text-cream/50 hover:text-cream hover:bg-charcoal-light transition-colors">
              <Printer size={16} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {items.length > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-charcoal-light rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500", isAllComplete ? "bg-[hsl(var(--status-done))]" : "bg-[hsl(var(--gold))]")} style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[11px] text-cream/50 whitespace-nowrap font-mono">{completedIds.size}/{items.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Admin settings panel ─────────────────────────────── */}
      {showAdminPanel && (
        <div className="bg-card border-b border-border px-4 py-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin Settings</p>

          {/* ── Publish / Draft toggle ── */}
          {isMasterAdmin && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {template.is_published ? "Published" : "Draft"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {template.is_published ? "Visible to assigned staff" : "Only visible to you"}
                </p>
              </div>
              <button
                onClick={async () => {
                  const next = !template.is_published;
                  await supabase.from("checklist_templates").update({ is_published: next }).eq("id", template.id);
                  setTemplate(t => ({ ...t, is_published: next }));
                }}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative flex-shrink-0",
                  template.is_published ? "bg-[hsl(var(--status-done))]" : "bg-muted"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                  template.is_published ? "translate-x-6" : "translate-x-0.5"
                )} />
              </button>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><RefreshCw size={11} /> Recurrence</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                <button key={key} onClick={() => setRecurrence(key)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    recurrence === key ? "bg-gold text-charcoal border-gold" : "border-border text-muted-foreground hover:border-gold/40")}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(recurrence === "weekly" || recurrence === "biweekly") && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><Calendar size={11} /> Trigger Day</label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((d, i) => (
                  <button key={i} onClick={() => setRecurrenceDay(i)}
                    className={cn("px-2.5 py-1 rounded-lg text-xs border transition-colors",
                      recurrenceDay === i ? "bg-gold text-charcoal border-gold" : "border-border text-muted-foreground")}>
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><User size={11} /> Assign to Role</label>
            <div className="flex flex-wrap gap-2">
              {["", "staff", "manager", "admin"].map(r => (
                <button key={r} onClick={() => setAssignedRole(r)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    assignedRole === r ? "bg-gold text-charcoal border-gold" : "border-border text-muted-foreground")}>
                  {r === "" ? "All Roles" : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><User size={11} /> Assign to Department</label>
            <div className="flex flex-wrap gap-2">
              {["", "interior", "exterior", "kitchen", "security", "office"].map(d => (
                <button key={d} onClick={() => setAssignedDepartment(d)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize",
                    assignedDepartment === d ? "bg-gold text-charcoal border-gold" : "border-border text-muted-foreground")}>
                  {d === "" ? "All Departments" : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5"><Bell size={11} /> Notify staff on trigger day</label>
            <button onClick={() => setNotifyOnDay(v => !v)} className={cn("w-10 h-5 rounded-full transition-colors relative", notifyOnDay ? "bg-gold" : "bg-muted")}>
              <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", notifyOnDay ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-muted-foreground flex items-center gap-1.5">🏠 Only when occupied</label>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 ml-5">Disables when the property is vacant</p>
            </div>
            <button onClick={() => setOnlyWhenOccupied(v => !v)} className={cn("w-10 h-5 rounded-full transition-colors relative flex-shrink-0", onlyWhenOccupied ? "bg-gold" : "bg-muted")}>
              <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", onlyWhenOccupied ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </div>

          <button onClick={handleSaveSettings} disabled={savingSettings}
            className="w-full py-2.5 bg-gold text-charcoal text-sm font-semibold rounded-xl active:scale-95 transition-transform disabled:opacity-50">
            {savingSettings ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}

      {/* ── Metadata badges ───────────────────────────────────── */}
      {((template.recurrence && template.recurrence !== "none") || template.assigned_role || template.assigned_department) && (
        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {template.recurrence && template.recurrence !== "none" && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              <RefreshCw size={9} /> {RECURRENCE_LABELS[template.recurrence] ?? template.recurrence}
            </span>
          )}
          {template.recurrence_day !== null && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">
              <Calendar size={9} /> Every {DAY_NAMES[template.recurrence_day ?? 0]}
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

      {/* ── Cover image ───────────────────────────────────────── */}
      {(template.cover_image_url || isMasterAdmin) && (
        <div className="px-4 mt-4">
          {template.cover_image_url ? (
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img src={template.cover_image_url} alt="Cover" loading="lazy" className="w-full h-44 object-cover" />
              {isMasterAdmin && (
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button onClick={() => coverRef.current?.click()}
                    className="p-1.5 rounded-lg bg-charcoal/80 text-cream hover:bg-charcoal transition-colors backdrop-blur-sm">
                    <Camera size={13} />
                  </button>
                  <button onClick={removeCover}
                    className="p-1.5 rounded-lg bg-charcoal/80 text-[hsl(var(--status-urgent))] hover:bg-charcoal transition-colors backdrop-blur-sm">
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          ) : isMasterAdmin ? (
            <button
              onClick={() => coverRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCoverUpload(f); }}
              className="w-full h-28 border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-gold hover:text-foreground transition-all bg-card"
            >
              {coverUploading ? (
                <span className="text-xs animate-pulse">Uploading…</span>
              ) : (
                <>
                  <ImageIcon size={20} />
                  <span className="text-xs">Add reference image — drag & drop or tap to upload</span>
                </>
              )}
            </button>
          ) : null}
          <input ref={coverRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }} />
        </div>
      )}

      {/* ── Manual link ───────────────────────────────────────── */}
      <div className="px-4 mt-3">
        {template.manual_link_url ? (
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5">
            <Link size={14} className="text-[hsl(var(--gold))] flex-shrink-0" />
            <a href={template.manual_link_url} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-sm text-foreground hover:text-[hsl(var(--gold))] transition-colors truncate flex items-center gap-1">
              {template.manual_link_label || template.manual_link_url}
              <ExternalLink size={11} className="flex-shrink-0 opacity-50" />
            </a>
            {isMasterAdmin && (
              <div className="flex gap-1">
                <button onClick={() => { setManualLinkUrl(template.manual_link_url ?? ""); setManualLinkLabel(template.manual_link_label ?? ""); setEditingManualLink(true); }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"><Pencil size={12} /></button>
                <button onClick={removeManualLink} className="p-1 rounded hover:bg-muted text-[hsl(var(--status-urgent))]"><X size={12} /></button>
              </div>
            )}
          </div>
        ) : isMasterAdmin ? (
          <button onClick={() => setEditingManualLink(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
            <Link size={12} /> Link manual or SOP
          </button>
        ) : null}

        {editingManualLink && (
          <div className="mt-2 bg-card border border-border rounded-xl p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">Link a Manual or SOP</p>
            <input value={manualLinkLabel} onChange={e => setManualLinkLabel(e.target.value)}
              placeholder="Label (e.g. Oven cleaning cycle guide)"
              className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold" />
            <input value={manualLinkUrl} onChange={e => setManualLinkUrl(e.target.value)}
              placeholder="URL (https://…)"
              className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-gold" />
            <div className="flex gap-2">
              <button onClick={saveManualLink} className="flex-1 py-2 bg-gold text-charcoal text-xs font-semibold rounded-lg">Save</button>
              <button onClick={() => setEditingManualLink(false)} className="px-3 py-2 text-xs text-muted-foreground rounded-lg hover:bg-muted">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sections manager ──────────────────────────────────── */}
      <SectionsManager
        template={template}
        items={items}
        isAdmin={!!isAdmin}
        onTemplateChange={(sections) => setTemplate(t => ({ ...t, sections }))}
        onItemsChange={(next) => setItems(next)}
      />

      {/* ── Checklist items (grouped by section) ──────────────── */}
      <div className="mt-4">
        {loading ? (
          <div className="px-4 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-card border border-border rounded-xl animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-xs text-muted-foreground italic text-center">No items yet — add some below.</p>
        ) : (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {(() => {
                const sectionList = template.sections ?? [];
                const groupKeys = [...sectionList, ...Array.from(new Set(items.map(i => i.section).filter((s): s is string => !!s && !sectionList.includes(s)))), null as unknown as string];
                return groupKeys.map((group, gIdx) => {
                  const groupItems = items.filter(i => (group === null ? !i.section : i.section === group));
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={group ?? "__ungrouped__"} className="mb-4">
                      {group && (
                        <p className="px-5 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--gold))]">{group}</p>
                      )}
                      <div className="bg-card border border-border rounded-xl mx-4 overflow-hidden">
                        {groupItems.map((item, idx) => {
                          const session = sessionMap.get(item.id);
                          const completedAt = session?.completed_at
                            ? new Date(session.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                            : null;
                          return (
                            <div key={item.id} className={idx > 0 ? "border-t border-border" : ""}>
                              <SortableChecklistItem
                                item={item} isCompleted={completedIds.has(item.id)}
                                isAdmin={!!isAdmin} onToggle={() => toggle(item.id, completedIds.has(item.id))}
                                onUpdate={handleUpdate} onDelete={handleDelete} onPhotoUpload={handlePhotoUpload}
                              />
                              {isAdmin && (template.sections ?? []).length > 0 && (
                                <div className="px-12 pb-2">
                                  <ItemSectionPicker
                                    item={item}
                                    sections={template.sections ?? []}
                                    onChange={async (next) => {
                                      await supabase.from("checklist_items").update({ section: next }).eq("id", item.id);
                                      setItems(prev => prev.map(i => i.id === item.id ? { ...i, section: next } : i));
                                    }}
                                  />
                                </div>
                              )}
                              {completedAt && <p className="px-12 pb-1.5 text-[10px] text-[hsl(var(--status-done))] opacity-70">✓ {completedAt}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </SortableContext>
          </DndContext>
        )}

        {isAdmin && (
          <div className="px-4 mt-3">
            {addingItem ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAddingItem(false); }}
                  placeholder="New item…"
                  className="flex-1 text-sm bg-card border border-border rounded-xl px-3 py-2 outline-none focus:border-gold" />
                <button onClick={addItem} className="text-xs px-3 py-2 bg-primary text-primary-foreground rounded-xl">Add</button>
                <button onClick={() => setAddingItem(false)} className="text-xs text-muted-foreground">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingItem(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                <Plus size={12} /> Add item
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Products section ──────────────────────────────────── */}
      {(products.length > 0 || isMasterAdmin) && (
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Products</p>
            </div>
            {isMasterAdmin && (
              <button onClick={() => setAddingProduct(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Plus size={12} /> Add
              </button>
            )}
          </div>

          {products.length === 0 && isMasterAdmin && (
            <p className="text-xs text-muted-foreground italic">No products yet — add approved products for this checklist.</p>
          )}

          <div className="space-y-2">
            {products.map(prod => (
              <div key={prod.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-start gap-3 px-3 py-3">
                  {/* Product image */}
                  <div
                    className="w-12 h-12 rounded-lg border border-border flex-shrink-0 overflow-hidden bg-muted cursor-pointer"
                    onClick={() => isMasterAdmin && productImgRef.current[prod.id]?.click()}
                  >
                    {prod.image_url ? (
                      <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        {isMasterAdmin ? <Camera size={14} /> : <Package size={14} />}
                      </div>
                    )}
                  </div>
                  <input type="file" accept="image/*" className="hidden"
                    ref={el => { productImgRef.current[prod.id] = el; }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleProductImage(prod.id, f); }} />

                  <div className="flex-1 min-w-0">
                    {editingProductId === prod.id ? (
                      <div className="space-y-1.5">
                        <input autoFocus value={prod.name}
                          onChange={e => updateProduct(prod.id, { name: e.target.value })}
                          onBlur={() => setEditingProductId(null)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingProductId(null); }}
                          className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-gold" />
                        <input value={prod.notes ?? ""}
                          onChange={e => updateProduct(prod.id, { notes: e.target.value || null })}
                          placeholder="Notes (optional)…"
                          className="w-full text-xs bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-gold" />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-foreground">{prod.name}</p>
                        {prod.notes && <p className="text-xs text-muted-foreground mt-0.5">{prod.notes}</p>}
                      </>
                    )}
                  </div>

                  {isMasterAdmin && editingProductId !== prod.id && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setEditingProductId(prod.id)} className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={14} /></button>
                      <button onClick={() => removeProduct(prod.id)} className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {addingProduct && (
            <div className="mt-2 flex items-center gap-2">
              <input autoFocus value={newProductName} onChange={e => setNewProductName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addProduct(); if (e.key === "Escape") setAddingProduct(false); }}
                placeholder="Product name…"
                className="flex-1 text-sm bg-card border border-border rounded-xl px-3 py-2 outline-none focus:border-gold" />
              <button onClick={addProduct} className="text-xs px-3 py-2 bg-primary text-primary-foreground rounded-xl">Add</button>
              <button onClick={() => setAddingProduct(false)} className="text-xs text-muted-foreground">Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* ── Mark Complete button ──────────────────────────────── */}
      {items.length > 0 && (
        <div className="px-4 mt-6">
          <button onClick={handleMarkComplete} disabled={!isAllComplete || isMarkingComplete}
            className={cn("w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
              isAllComplete ? "bg-[hsl(var(--status-done))] text-white shadow-lg active:scale-95" : "bg-muted text-muted-foreground cursor-not-allowed opacity-60")}>
            <CheckCircle2 size={16} />
            {isAllComplete ? (isMarkingComplete ? "Completing…" : "Mark List Complete 🎉") : `${items.length - completedIds.size} item${items.length - completedIds.size !== 1 ? "s" : ""} remaining`}
          </button>
        </div>
      )}

      {/* ── Comments ─────────────────────────────────────────── */}
      <div className="px-4 mt-6 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes & Comments</p>
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
                    <span className="text-gold text-[10px] font-semibold">{(c.profile?.full_name ?? "U")[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground">{c.profile?.full_name ?? "Staff"}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input value={commentText} onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { addComment(commentText); setCommentText(""); } }}
            placeholder="Add a note or comment…"
            className="flex-1 text-sm bg-card border border-border rounded-xl px-3 py-2.5 outline-none focus:border-gold placeholder:text-muted-foreground/50" />
          <button onClick={() => { if (commentText.trim()) { addComment(commentText); setCommentText(""); } }}
            disabled={!commentText.trim()}
            className="w-10 h-10 rounded-xl bg-gold text-charcoal flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
