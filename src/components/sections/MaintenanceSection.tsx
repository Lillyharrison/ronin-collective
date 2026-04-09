import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  Plus, Search, Filter, SortAsc, Wrench, ChevronDown,
  LayoutGrid, Table2, RefreshCw, MapPin, User, Calendar,
  Flag, Tag, Clock, CheckCircle2, CalendarClock,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useMaintenanceIssues, MaintenanceIssue, IssueStatus, MaintenanceFilters } from "@/hooks/useMaintenanceIssues";
import { usePlannedMaintenance, PlannedMaintenanceEntry } from "@/hooks/usePlannedMaintenance";
import { PlannedMaintenanceModal } from "@/components/maintenance/PlannedMaintenanceModal";
import { PlannedMaintenanceList } from "@/components/maintenance/PlannedMaintenanceList";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { IssueCard } from "@/components/maintenance/IssueCard";
import { IssueModal } from "@/components/maintenance/IssueModal";
import { IssueStatusBadge, IssuePriorityBadge } from "@/components/maintenance/IssueStatusBadge";
import { IssueDetailDrawer } from "@/components/maintenance/IssueDetailDrawer";
import { cn } from "@/lib/utils";
import { notifySection } from "@/lib/notifySection";
import { useNavigation } from "@/contexts/NavigationContext";
import { format, parseISO } from "date-fns";
import { useBatchTranslation } from "@/hooks/useEntryTranslation";
import { sortProperties } from "@/hooks/useScopedProperties";
import { toast } from "sonner";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
type ViewMode = "board" | "list" | "table";
type MaintenanceTab = "repairs" | "planned";

export function MaintenanceSection() {
  const { isAdmin, isManager, isMasterAdmin, isFamily, userId, assignedPropertyIds, canEdit } = usePermissions();
  const { t, language } = useLanguage();
  const canManage = isMasterAdmin || isAdmin || isManager || canEdit("maintenance");
  const [activeTab, setActiveTab] = useLocalStorage<MaintenanceTab>("maintenance_tab", "repairs");
  // Pass scoped property IDs to the hook so non-admins only fetch their properties server-side
  const scopedPropertyIds = (isMasterAdmin || isAdmin || isManager) ? undefined : assignedPropertyIds;

  // Debounce search to avoid a DB query on every keystroke
  const [search,      setSearch]      = useState("");
  const [filterProp,  setFilterProp]  = useState("");
  const [filterCat,   setFilterCat]   = useState("");
  const [filterPri,   setFilterPri]   = useState("");
  const [sortBy,      setSortBy]      = useState<"newest"|"oldest"|"priority"|"status">("newest");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const dbFilters = useMemo<MaintenanceFilters>(() => ({
    search: debouncedSearch || undefined,
    category: filterCat || undefined,
    priority: filterPri || undefined,
  }), [debouncedSearch, filterCat, filterPri]);

  const { issues, categories, loading, hasMore, loadMore, fetchIssues, createIssue, updateIssue, deleteIssue, addCategory } = useMaintenanceIssues(scopedPropertyIds, dbFilters);
  const { pendingMaintenanceIssueId, setPendingMaintenanceIssueId, pendingMaintenanceIssueIdRef, activePropertyId, setActivePropertyId } = useNavigation();

  // Planned maintenance
  const { entries: plannedEntries, loading: plannedLoading, refetch: refetchPlanned, createEntry, updateEntry, deleteEntry } = usePlannedMaintenance(scopedPropertyIds);
  const [plannedModalOpen, setPlannedModalOpen] = useState(false);
  const [editPlanned, setEditPlanned] = useState<PlannedMaintenanceEntry | null>(null);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);

  // Guard against double-firing notifications on rapid re-renders / StrictMode
  const notifyingRef = useRef<Set<string>>(new Set());

  // filterProp stays client-side (property picker in the UI — no DB round-trip needed)
  const [viewMode,    setViewMode]    = useLocalStorage<ViewMode>("maintenance_view_mode", "board");
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editIssue,   setEditIssue]   = useState<MaintenanceIssue | null>(null);
  const [detailIssue, setDetailIssue] = useState<MaintenanceIssue | null>(null);
  const [allProperties, setAllProperties] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; name: string; avatar: string | null }[]>([]);

  const properties = (isMasterAdmin || isAdmin || isManager)
    ? allProperties
    : allProperties.filter(p => assignedPropertyIds.includes(p.id));

  useEffect(() => {
    supabase.from("properties").select("id, name, is_primary")
      .then(({ data }) => setAllProperties(sortProperties((data ?? []) as { id: string; name: string; is_primary?: boolean }[])));
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name")
      .then(({ data }) => setProfiles((data ?? []).map((p: any) => ({
        id: p.id, name: p.full_name ?? "Unknown", avatar: p.avatar_url,
      }))));
    supabase.from("vendors").select("id, name").eq("is_active", true).order("name")
      .then(({ data }) => setVendors(data ?? []));
  }, []);

  // Pre-filter by property when arriving from Property section deep-link
  useEffect(() => {
    if (activePropertyId) {
      setFilterProp(activePropertyId);
      setActivePropertyId(null);
    }
  }, [activePropertyId]); // eslint-disable-line react-hooks/exhaustive-deps


  // Deep-link: open specific issue when arriving from a notification click.
  // Reads from the ref (always current) so we don't miss the value when
  // the section first mounts in the same render cycle as navigation.
  useEffect(() => {
    const pendingId = pendingMaintenanceIssueIdRef.current;
    if (!pendingId) return;
    if (loading) return;
    const issue = issues.find(i => i.id === pendingId);
    if (issue) {
      setDetailIssue(issue);
      setPendingMaintenanceIssueId(null);
    } else if (issues.length > 0) {
      // Issues loaded but this one isn't visible (RLS / property filter) — clear gracefully
      setPendingMaintenanceIssueId(null);
    }
  }, [pendingMaintenanceIssueIdRef, pendingMaintenanceIssueId, issues, loading, setPendingMaintenanceIssueId]);

  const STATUS_COLUMNS: { key: IssueStatus; label: string; labelEs: string }[] = [
    { key: "reported",    label: "Reported",     labelEs: "Reportado" },
    { key: "approved",    label: "Approved",     labelEs: "Aprobado" },
    { key: "assigned",    label: "Assigned",     labelEs: "Asignado" },
    { key: "scheduled",   label: "Scheduled",    labelEs: "Programado" },
    { key: "in_progress", label: "In Progress",  labelEs: "En Progreso" },
    { key: "resolved",    label: "Resolved",     labelEs: "Resuelto" },
  ];

  // Only sort + property-picker filter remain client-side; search/cat/priority go to DB
  const filtered = useCallback(() => {
    let list = [...issues];
    if (filterProp) list = list.filter(i => i.property_id === filterProp);
    list.sort((a, b) => {
      if (sortBy === "newest")   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest")   return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      return 0;
    });
    return list;
  }, [issues, filterProp, sortBy]);

  const rawIssues = filtered();

  // Translate issue titles + descriptions when language is Spanish
  const { items: displayIssues } = useBatchTranslation(
    language,
    rawIssues,
    ["title", "description"],
  );

  const openCount = displayIssues.filter(i => i.status !== "resolved").length;
  const reportedCount = displayIssues.filter(i => i.status === "reported").length;

  const handleCreate = async (payload: Partial<MaintenanceIssue>) => {
    if (!userId) return;
    const { data: newIssue } = await createIssue({ ...payload, reported_by: userId } as Parameters<typeof createIssue>[0]);
    if (newIssue) {
      const key = `create-${newIssue.id}`;
      if (notifyingRef.current.has(key)) return;
      notifyingRef.current.add(key);
      await notifySection("maintenance", {
        title: `🔧 New issue reported: ${payload.title ?? "Maintenance issue"}`,
        body: payload.location_detail ? `Location: ${payload.location_detail}` : undefined,
        type: "warning",
        action_url: "maintenance",
        entity_id: newIssue.id,
        entity_type: "maintenance_issue",
        property_id: payload.property_id ?? undefined,
      }, userId);
      setTimeout(() => notifyingRef.current.delete(key), 5000);
    }
  };

  const handleEdit = async (patch: Partial<MaintenanceIssue>) => {
    if (!editIssue) return;
    await updateIssue(editIssue.id, patch);
    setEditIssue(null);
  };

  const handleStatusChange = async (issue: MaintenanceIssue, newStatus: IssueStatus, scheduledDate?: string) => {
    if (!canManage) return;
    if (issue.status === "reported" && newStatus === "approved" && !isAdmin && !isMasterAdmin) return;
    const patch: Partial<MaintenanceIssue> = { status: newStatus };
    if (newStatus === "resolved") patch.resolved_at = new Date().toISOString();
    if (newStatus === "scheduled" && scheduledDate) {
      patch.scheduled_date = scheduledDate;
    } else if (newStatus !== "scheduled") {
      patch.scheduled_date = null;
    }
    await updateIssue(issue.id, patch);
    // Sync the detail drawer so the dropdown doesn't revert to the old status
    setDetailIssue(prev => prev?.id === issue.id ? { ...prev, ...patch } : prev);
    if (newStatus === "approved" && userId) {
      const key = `approve-${issue.id}`;
      if (notifyingRef.current.has(key)) return;
      notifyingRef.current.add(key);
      const approverProfile = profiles.find(p => p.id === userId);
      const approverName = approverProfile?.name ?? "Admin";
      await notifySection("maintenance", {
        title: `Issue approved: ${issue.title}`,
        body: `${approverName} approved a maintenance issue for ${issue.property_name ?? "a property"}.`,
        type: "success",
        action_url: "maintenance",
        entity_id: issue.id,
        entity_type: "maintenance_issue",
        property_id: issue.property_id ?? undefined,
      }, userId);
      setTimeout(() => notifyingRef.current.delete(key), 5000);
    }
  };

  const handleApprove = (issue: MaintenanceIssue) => handleStatusChange(issue, "approved");

  // ─── Planned maintenance ──────────────────────────────────────────────────────
  const handleCreatePlanned = async (payload: Parameters<typeof createEntry>[0]) => {
    const entry = await createEntry(payload);
    if (!entry) return;

    // Build a calendar event (place month-only entries on the 1st of the month)
    let calStartDate: string;
    if (payload.date_type === "specific" && payload.scheduled_date) {
      calStartDate = `${payload.scheduled_date}T09:00:00`;
    } else if (payload.date_type === "month_only" && payload.scheduled_month && payload.scheduled_year) {
      const mm = String(payload.scheduled_month).padStart(2, "0");
      calStartDate = `${payload.scheduled_year}-${mm}-01T09:00:00`;
    } else {
      calStartDate = new Date().toISOString();
    }

    const calTitle = `🔧 ${payload.title}`;
    const { data: calEvent } = await supabase
      .from("calendar_events")
      .insert({
        title: calTitle,
        description: payload.description ?? undefined,
        event_type: "maintenance",
        start_date: calStartDate,
        property_id: payload.property_id ?? undefined,
        status: payload.date_type === "month_only" ? "unconfirmed" : "upcoming",
        calendar_source: "planned_maintenance",
        created_by: userId ?? undefined,
      })
      .select()
      .single();

    // Link calendar event back to the entry
    if (calEvent) {
      await supabase
        .from("planned_maintenance")
        .update({ calendar_event_id: calEvent.id })
        .eq("id", entry.id);
    }

    // Notify section
    if (userId) {
      const key = `planned-create-${entry.id}`;
      if (!notifyingRef.current.has(key)) {
        notifyingRef.current.add(key);
        // Build a human-readable scheduled date for the notification body
        let scheduledLabel: string | undefined;
        if (payload.date_type === "specific" && payload.scheduled_date) {
          scheduledLabel = `Scheduled: ${new Date(payload.scheduled_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
        } else if (payload.date_type === "month_only" && payload.scheduled_month && payload.scheduled_year) {
          const monthName = new Date(payload.scheduled_year, payload.scheduled_month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
          scheduledLabel = `Scheduled: ${monthName} (date TBC)`;
        }
        const notifBody = [scheduledLabel, payload.description].filter(Boolean).join(" · ") || undefined;
        await notifySection("maintenance", {
          title: `🔧 Planned maintenance scheduled: ${payload.title}`,
          body: notifBody,
          type: "info",
          action_url: "maintenance",
          entity_id: entry.id,
          entity_type: "planned_maintenance",
          property_id: payload.property_id ?? undefined,
        }, userId);
        setTimeout(() => notifyingRef.current.delete(key), 5000);
      }
    }

    refetchPlanned();
  };

  const handleUpdatePlanned = async (payload: Parameters<typeof updateEntry>[1]) => {
    if (!editPlanned) return;
    await updateEntry(editPlanned.id, payload);

    // Sync linked calendar event with updated dates
    await syncCalendarForPlanned(editPlanned.id, editPlanned.calendar_event_id, {
      ...editPlanned,
      ...payload,
    } as PlannedMaintenanceEntry);

    setEditPlanned(null);
  };

  const isL = language === "es";

  // ─── Family read-only ─────────────────────────────────────────────────────────
  if (isFamily && !canManage) {
    const openIssues = displayIssues.filter(i => i.status !== "resolved");
    return (
      <div className="animate-fade-in px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl text-foreground">{t("maintenance")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {openIssues.length} {openIssues.length !== 1 ? t("openIssuesPlural") : t("openIssues")}
            </p>
          </div>
          <button onClick={() => { setModalOpen(true); setEditIssue(null); }}
            className="flex items-center gap-2 bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> {t("reportButton")}
          </button>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {properties.map(p => (
            <button key={p.id} onClick={() => setFilterProp(filterProp === p.id ? "" : p.id)}
              className={cn("flex-shrink-0 text-xs rounded-full border px-3 py-1 font-medium transition-colors",
                filterProp === p.id ? "bg-gold/10 border-gold/50 text-gold" : "border-border text-muted-foreground hover:border-gold/30"
              )}>
              {p.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : openIssues.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-8 text-center">
            <Wrench size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="font-medium text-foreground text-sm">{t("allClear")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("noOpenIssues")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openIssues.map(issue => (
              <IssueCard key={issue.id} issue={issue} onClick={() => setDetailIssue(issue)} compact />
            ))}
          </div>
        )}

        <IssueModal open={modalOpen} onClose={() => { setModalOpen(false); setEditIssue(null); }} onSave={editIssue ? handleEdit : handleCreate}
          initial={editIssue ?? undefined}
          categories={categories} onCategoryAdded={fetchIssues}
          properties={properties} profiles={profiles}
          existingIssues={issues.map(i => ({ id: i.id, title: i.title, created_at: i.created_at }))}
          mode={editIssue ? "edit" : "create"} />
        {detailIssue && (
          <IssueDetailDrawer issue={detailIssue} onClose={() => setDetailIssue(null)}
            onEdit={(issue) => { setEditIssue(issue); setModalOpen(true); setDetailIssue(null); }}
            categories={categories} />
        )}
      </div>
    );
  }

  // ─── Staff read-only ─────────────────────────────────────────────────────────
  if (!canManage) {
    return (
      <div className="animate-fade-in px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl text-foreground">{t("maintenance")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {openCount} {openCount !== 1 ? t("openIssuesPlural") : t("openIssues")}
            </p>
          </div>
          <button onClick={() => { setModalOpen(true); setEditIssue(null); }}
            className="flex items-center gap-2 bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> {t("reportButton")}
          </button>
        </div>
        <div className="space-y-3">
          {displayIssues.map(issue => (
            <IssueCard key={issue.id} issue={issue} onClick={() => setDetailIssue(issue)} compact />
          ))}
        </div>
        <IssueModal open={modalOpen} onClose={() => { setModalOpen(false); setEditIssue(null); }}
          onSave={editIssue ? handleEdit : handleCreate}
          initial={editIssue ?? undefined}
          categories={categories} onCategoryAdded={fetchIssues}
          properties={properties} profiles={profiles}
          existingIssues={issues.map(i => ({ id: i.id, title: i.title, created_at: i.created_at }))}
          mode={editIssue ? "edit" : "create"} />
        {detailIssue && (
          <IssueDetailDrawer issue={detailIssue} onClose={() => setDetailIssue(null)}
            // Allow reporter to edit their own reported issues before approval
            onEdit={detailIssue.reported_by === userId && detailIssue.status === "reported"
              ? (issue) => { setEditIssue(issue); setModalOpen(true); setDetailIssue(null); }
              : undefined}
            categories={categories} />
        )}
      </div>
    );
  }

  // ─── Admin / Manager full board ───────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-foreground">{t("maintenance")}</h2>
            {activeTab === "repairs" && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {openCount} {isL ? "abiertos" : "open"} · {displayIssues.filter(i => i.status === "resolved").length} {isL ? "resueltos" : "resolved"}
                {reportedCount > 0 && (
                  <span className="ml-2 text-amber-400 font-semibold">· {reportedCount} {t("awaitingApproval")}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "repairs" ? (
              <>
                <button onClick={fetchIssues}
                  className={cn("p-2 rounded-lg border border-border hover:bg-muted transition-colors", loading ? "text-gold" : "text-muted-foreground")}>
                  <RefreshCw size={15} className={cn(loading && "animate-spin")} />
                </button>
                <button onClick={() => { setEditIssue(null); setModalOpen(true); }}
                  className="flex items-center gap-1.5 bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                  <Plus size={14} /> {t("reportIssueTitle")}
                </button>
              </>
            ) : (
              <button onClick={() => { setEditPlanned(null); setPlannedModalOpen(true); }}
                className="flex items-center gap-1.5 bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                <Plus size={14} /> Add Entry
              </button>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setActiveTab("repairs")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors",
              activeTab === "repairs"
                ? "bg-amber-500/15 text-amber-400 border-r border-amber-500/30"
                : "text-muted-foreground hover:bg-muted border-r border-border"
            )}>
            <Wrench size={12} /> Repairs
          </button>
          <button
            onClick={() => setActiveTab("planned")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors",
              activeTab === "planned"
                ? "bg-blue-500/15 text-blue-400"
                : "text-muted-foreground hover:bg-muted"
            )}>
            <CalendarClock size={12} /> Planned
          </button>
        </div>

        {/* Repairs-only controls */}
        {activeTab === "repairs" && (
          <>
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("searchIssues")}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>

            {/* Filter/sort bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => setShowFilters(!showFilters)}
                className={cn("flex-shrink-0 flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 font-medium transition-colors",
                  showFilters ? "bg-gold/10 border-gold/50 text-gold" : "border-border text-muted-foreground hover:border-gold/30"
                )}>
                <Filter size={11} /> {isL ? "Filtros" : "Filters"} {(filterProp || filterCat || filterPri) ? "●" : ""}
              </button>

              <div className="relative flex-shrink-0">
                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className="appearance-none text-xs rounded-full border border-border bg-background pl-7 pr-6 py-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold/30 cursor-pointer">
                  <option value="newest">{t("newestFirst")}</option>
                  <option value="oldest">{t("oldestFirst")}</option>
                  <option value="priority">{t("byPriority")}</option>
                  <option value="status">{t("byStatus")}</option>
                </select>
                <SortAsc size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>

              {/* View toggle */}
              <div className="flex-shrink-0 flex items-center border border-border rounded-full overflow-hidden ml-auto">
                <button onClick={() => setViewMode("board")} title="Kanban board"
                  className={cn("p-1.5 transition-colors", viewMode === "board" ? "bg-gold/20 text-gold" : "text-muted-foreground hover:text-foreground")}>
                  <LayoutGrid size={13} />
                </button>
                <button onClick={() => setViewMode("table")} title="Spreadsheet"
                  className={cn("p-1.5 transition-colors", viewMode === "table" ? "bg-gold/20 text-gold" : "text-muted-foreground hover:text-foreground")}>
                  <Table2 size={13} />
                </button>
                <button onClick={() => setViewMode("list")} title="List"
                  className={cn("p-1.5 transition-colors", viewMode === "list" ? "bg-gold/20 text-gold" : "text-muted-foreground hover:text-foreground")}>
                  <Filter size={13} />
                </button>
              </div>
            </div>

            {/* Expanded filters */}
            {showFilters && (
              <div className="grid grid-cols-3 gap-2 p-3 bg-muted/30 rounded-xl border border-border">
                <select value={filterProp} onChange={e => setFilterProp(e.target.value)}
                  className="text-xs rounded-lg border border-input bg-background px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30">
                  <option value="">{t("allPropertiesFilter")}</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                  className="text-xs rounded-lg border border-input bg-background px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30">
                  <option value="">{t("allCategories")}</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                </select>
                <select value={filterPri} onChange={e => setFilterPri(e.target.value)}
                  className="text-xs rounded-lg border border-input bg-background px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30">
                  <option value="">{t("allPriorities")}</option>
                  <option value="urgent">🔴 {isL ? "Urgente" : "Urgent"}</option>
                  <option value="high">🟠 {isL ? "Alto" : "High"}</option>
                  <option value="medium">🟡 {isL ? "Medio" : "Medium"}</option>
                  <option value="low">⚪ {isL ? "Bajo" : "Low"}</option>
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Planned tab content ─── */}
      {activeTab === "planned" ? (
        <PlannedMaintenanceList
          entries={plannedEntries}
          loading={plannedLoading}
          canManage={canManage}
          properties={properties}
          propertyFilter={filterProp}
          onPropertyFilterChange={setFilterProp}
          onAdd={() => { setEditPlanned(null); setPlannedModalOpen(true); }}
          onEdit={(entry) => { setEditPlanned(entry); setPlannedModalOpen(true); }}
          onDelete={deleteEntry}
          onStatusChange={async (id, status) => { await updateEntry(id, { status }); }}
          refetch={refetchPlanned}
        />
      ) : (
      <>
      {/* ─── Repairs content ─── */}
      {loading ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : displayIssues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3">
          <Wrench size={40} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{isL ? "Sin problemas encontrados" : "No issues found"}</p>
        </div>
      ) : viewMode === "board" ? (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STATUS_COLUMNS.map(col => {
              const colIssues = displayIssues.filter(i => i.status === col.key);
              // On mobile: skip empty columns entirely to avoid wasted whitespace
              const isEmpty = colIssues.length === 0;
              return (
                <div key={col.key} className={cn("min-w-0", isEmpty && "hidden sm:block")}>
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-t-xl border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {isL ? col.labelEs : col.label}
                      </span>
                      <span className="text-[10px] bg-black/10 text-foreground/60 px-1.5 py-0.5 rounded-full font-bold">
                        {colIssues.length}
                      </span>
                    </div>
                  </div>
                  <div className="bg-muted/20 rounded-b-xl p-2 space-y-2 min-h-[100px] max-h-[60vh] overflow-y-auto">
                    {colIssues.map(issue => (
                      <div key={issue.id} className="relative group/card">
                        <IssueCard
                          issue={issue}
                          onClick={() => setDetailIssue(issue)}
                          compact
                        />
                        {/* Quick approve button — only on Reported column for admins */}
                        {col.key === "reported" && (isMasterAdmin || isAdmin) && (
                          <button
                            onClick={e => { e.stopPropagation(); handleApprove(issue); }}
                            className="absolute bottom-2 right-2 opacity-0 group-hover/card:opacity-100 flex items-center gap-1 bg-[hsl(var(--status-done)/0.9)] hover:bg-[hsl(var(--status-done))] text-white text-[10px] font-semibold px-2 py-1 rounded-full transition-all shadow-lg"
                            title="Quick approve"
                          >
                            <CheckCircle2 size={10} /> {isL ? "Aprobar" : "Approve"}
                          </button>
                        )}
                      </div>
                    ))}
                    {colIssues.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/40 italic text-center py-4">
                        {isL ? "Sin problemas" : "No issues"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === "list" ? (
        <div className="px-4 pb-4 space-y-3">
          {displayIssues.map(issue => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onClick={() => setDetailIssue(issue)}
              compact
            />
          ))}
          {hasMore && (
            <button onClick={loadMore} disabled={loading}
              className="w-full py-2.5 text-xs text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors">
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      ) : (
        /* Table view */
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[
                  isL ? "Título" : "Title",
                  isL ? "Estado" : "Status",
                  isL ? "Prioridad" : "Priority",
                  isL ? "Categoría" : "Category",
                  isL ? "Propiedad" : "Property",
                  isL ? "Asignado a" : "Assigned",
                  isL ? "Fecha" : "Date",
                ].map((h, i) => (
                  <th key={i} className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayIssues.map(issue => (
                <tr
                  key={issue.id}
                  onClick={() => setDetailIssue(issue)}
                  className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground truncate max-w-[200px]">{issue.title}</p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <IssueStatusBadge status={issue.status} size="xs" />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <IssuePriorityBadge priority={issue.priority} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="text-xs text-muted-foreground">{issue.category}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {issue.property_name
                      ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={9} /> {issue.property_name}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {issue.assignee_name
                      ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><User size={9} /> {issue.assignee_name}</span>
                      : <span className="text-xs text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar size={9} />
                      {format(new Date(issue.created_at), "dd/MM/yy")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {/* ─── Shared modals ─── */}
      <IssueModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditIssue(null); }}
        onSave={editIssue ? handleEdit : handleCreate}
        initial={editIssue ?? undefined}
        categories={categories}
        onCategoryAdded={fetchIssues}
        properties={properties}
        profiles={profiles}
        existingIssues={issues.map(i => ({ id: i.id, title: i.title, created_at: i.created_at }))}
        mode={editIssue ? "edit" : "create"}
      />

      {detailIssue && (
        <IssueDetailDrawer
          issue={detailIssue}
          onClose={() => setDetailIssue(null)}
          onEdit={(issue) => { setEditIssue(issue); setModalOpen(true); setDetailIssue(null); }}
          onStatusChange={canManage ? handleStatusChange : undefined}
          onDelete={(isMasterAdmin || isAdmin) ? async (id) => { await deleteIssue(id); setDetailIssue(null); } : undefined}
          categories={categories}
        />
      )}

      <PlannedMaintenanceModal
        open={plannedModalOpen}
        onClose={() => { setPlannedModalOpen(false); setEditPlanned(null); }}
        onSave={editPlanned ? handleUpdatePlanned : handleCreatePlanned}
        initial={editPlanned}
        vendors={vendors}
        properties={properties}
        profiles={profiles}
        userId={userId}
      />
    </div>
  );
}
