import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  Plus, Search, Filter, SortAsc, Wrench, ChevronDown, ChevronUp,
  LayoutGrid, Table2, RefreshCw, MapPin, User, Calendar,
  Flag, Tag, Clock, CheckCircle2, CalendarClock, Download,
} from "lucide-react";
import { exportRepairsPDF } from "@/components/maintenance/repairsExportPDF";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import { filterAssignableStaff } from "@/lib/assignableStaff";
import { toast } from "sonner";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
type ViewMode = "board" | "list" | "table";
type MaintenanceTab = "repairs" | "planned";
type StaffProfileRow = { id: string; full_name: string | null; avatar_url: string | null; level?: string | null };
const PLANNED_FULL_COLS = "id, title, description, vendor_id, property_id, assigned_to, date_type, scheduled_date, scheduled_time, scheduled_month, scheduled_year, reminder_days, recurrence_months, status, last_service_date, calendar_event_id, created_by, created_at, updated_at";

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
  const {
    pendingMaintenanceIssueId,
    setPendingMaintenanceIssueId,
    pendingMaintenanceIssueIdRef,
    pendingPlannedMaintenanceEntryId,
    setPendingPlannedMaintenanceEntryId,
    pendingPlannedMaintenanceEntryIdRef,
    activePropertyId,
    setActivePropertyId,
  } = useNavigation();

  // Planned maintenance
  const { entries: plannedEntries, loading: plannedLoading, refetch: refetchPlanned, createEntry, updateEntry, deleteEntry } = usePlannedMaintenance(scopedPropertyIds);
  const [plannedModalOpen, setPlannedModalOpen] = useState(false);
  const [editPlanned, setEditPlanned] = useState<PlannedMaintenanceEntry | null>(null);
  const [vendors, setVendors] = useState<{ id: string; name: string; company: string | null; property_ids: string[] }[]>([]);

  // Guard against double-firing notifications on rapid re-renders / StrictMode
  const notifyingRef = useRef<Set<string>>(new Set());

  // filterProp stays client-side (property picker in the UI — no DB round-trip needed)
  const [viewMode,    setViewMode]    = useLocalStorage<ViewMode>("maintenance_view_mode", "board");
  const [includeNotes, setIncludeNotes] = useLocalStorage<boolean>("maintenance_pdf_include_notes", false);
  // Last "family report" baseline — used to highlight NEW/UPDATED items in the PDF.
  const [lastFamilyReportAt, setLastFamilyReportAt] =
    useLocalStorage<string | null>("repairs.lastFamilyReportAt", null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMarkAsFamily, setExportMarkAsFamily] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editIssue,   setEditIssue]   = useState<MaintenanceIssue | null>(null);
  const [detailIssue, setDetailIssue] = useState<MaintenanceIssue | null>(null);
  const [allProperties, setAllProperties] = useState<{ id: string; name: string; is_primary?: boolean }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; name: string; avatar: string | null }[]>([]);
  const [defaultPropApplied, setDefaultPropApplied] = useState(false);

  const properties = (isMasterAdmin || isAdmin || isManager)
    ? allProperties
    : allProperties.filter(p => assignedPropertyIds.includes(p.id));
  const issueById = useMemo(() => new Map(issues.map(issue => [issue.id, issue])), [issues]);
  const getCanonicalIssue = useCallback((issue: MaintenanceIssue) => issueById.get(issue.id) ?? issue, [issueById]);
  const openIssueDetail = useCallback((issue: MaintenanceIssue) => {
    setDetailIssue(getCanonicalIssue(issue));
  }, [getCanonicalIssue]);
  const openIssueEditor = useCallback((issue: MaintenanceIssue) => {
    setEditIssue(getCanonicalIssue(issue));
    setModalOpen(true);
    setDetailIssue(null);
  }, [getCanonicalIssue]);

  useEffect(() => {
    // Properties + vendors are tiny lookups (≤ a few dozen rows) — no limit needed.
    // Profiles can grow; cap at 500 staff which is well above any realistic team size.
    supabase.from("properties").select("id, name, is_primary")
      .then(({ data }) => setAllProperties(sortProperties((data ?? []) as { id: string; name: string; is_primary?: boolean }[])));
    // Family members (principal / extended_family) are never assigned maintenance work — exclude from picker.
    supabase.from("profiles").select("id, full_name, avatar_url, level").order("full_name").limit(500)
      .then(({ data }) => setProfiles(filterAssignableStaff((data ?? []) as StaffProfileRow[]).map((p) => ({
        id: p.id, name: p.full_name ?? "Unknown", avatar: p.avatar_url,
      }))));
    supabase.from("vendors").select("id, name, company, property_ids").eq("is_active", true).order("name").limit(200)
      .then(({ data }) => setVendors(data ?? []));
  }, []);

  // Default managers/admins to the primary property — but only on the Planned
  // tab. Repairs should default to "All properties" so nothing is hidden.
  // View-only users always start on All assigned properties.
  useEffect(() => {
    if (defaultPropApplied || properties.length === 0) return;
    if (!canManage) { setDefaultPropApplied(true); return; }
    // Don't override if a deep-link already set the filter
    if (filterProp) { setDefaultPropApplied(true); return; }
    if (activeTab === "planned") {
      const primary = properties.find(p => p.is_primary);
      if (primary) setFilterProp(primary.id);
    }
    setDefaultPropApplied(true);
  }, [properties, defaultPropApplied, filterProp, canManage, activeTab]);

  // If permissions change (including preview mode), discard any stale property
  // filter that the effective user is not allowed to see.
  useEffect(() => {
    if (!filterProp || properties.length === 0) return;
    if (!properties.some(p => p.id === filterProp)) setFilterProp("");
  }, [filterProp, properties]);

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
    let cancelled = false;
    const pendingId = pendingMaintenanceIssueIdRef.current;
    if (!pendingId) return;
    if (loading) return;
    const issue = issues.find(i => i.id === pendingId);
    if (issue) {
      openIssueDetail(issue);
      setActiveTab("repairs");
      setPendingMaintenanceIssueId(null);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("maintenance_issues")
        .select("id, title, description, category, priority, status, property_id, location_detail, reported_by, assigned_to, photo_url, close_out_photo_url, scheduled_date, resolved_at, source, related_issue_id, is_draft, created_at, updated_at")
        .eq("id", pendingId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setPendingMaintenanceIssueId(null); return; }

      const profileIds = [data.reported_by, data.assigned_to].filter(Boolean) as string[];
      const [propsRes, profilesRes, relatedRes] = await Promise.all([
        data.property_id ? supabase.from("properties").select("id, name").eq("id", data.property_id).maybeSingle() : Promise.resolve({ data: null }),
        profileIds.length ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", profileIds) : Promise.resolve({ data: [] }),
        data.related_issue_id ? supabase.from("maintenance_issues").select("id, title").eq("id", data.related_issue_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;

      const profileMap = new Map(((profilesRes.data ?? []) as StaffProfileRow[]).map((p) => [p.id, p]));
      setDetailIssue({
        ...(data as MaintenanceIssue),
        property_name: propsRes.data?.name,
        reporter_name: profileMap.get(data.reported_by)?.full_name ?? undefined,
        assignee_name: data.assigned_to ? profileMap.get(data.assigned_to)?.full_name ?? undefined : undefined,
        assignee_avatar: data.assigned_to ? profileMap.get(data.assigned_to)?.avatar_url ?? undefined : undefined,
        related_issue_title: relatedRes.data?.title,
      });
      setActiveTab("repairs");
      setPendingMaintenanceIssueId(null);
    })();

    return () => { cancelled = true; };
  }, [pendingMaintenanceIssueIdRef, pendingMaintenanceIssueId, issues, loading, setPendingMaintenanceIssueId, setActiveTab, openIssueDetail]);

  // Deep-link: open a planned maintenance entry when arriving from the calendar.
  useEffect(() => {
    let cancelled = false;
    const pendingId = pendingPlannedMaintenanceEntryIdRef.current;
    if (!pendingId) return;
    if (plannedLoading) return;
    const entry = plannedEntries.find(e => e.id === pendingId);
    if (entry) {
      setActiveTab("planned");
      setEditPlanned(entry);
      setPlannedModalOpen(true);
      setPendingPlannedMaintenanceEntryId(null);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("planned_maintenance")
        .select(PLANNED_FULL_COLS)
        .eq("id", pendingId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setPendingPlannedMaintenanceEntryId(null); return; }
      setActiveTab("planned");
      setEditPlanned(data as PlannedMaintenanceEntry);
      setPlannedModalOpen(true);
      setPendingPlannedMaintenanceEntryId(null);
    })();

    return () => { cancelled = true; };
  }, [pendingPlannedMaintenanceEntryIdRef, pendingPlannedMaintenanceEntryId, plannedEntries, plannedLoading, setPendingPlannedMaintenanceEntryId, setActiveTab]);

  const STATUS_COLUMNS: { key: IssueStatus; label: string; labelEs: string }[] = [
    { key: "reported",            label: "Reported",              labelEs: "Reportado" },
    { key: "under_investigation", label: "Under Investigation",   labelEs: "En Investigación" },
    { key: "approved",            label: "Summer Maintenance",    labelEs: "Mantenimiento de Verano" },
    { key: "scheduled",           label: "Scheduled/In Progress", labelEs: "Programado/En Progreso" },
  ];

  // Toggle between the active kanban and the resolved-only archive view
  const [showResolved, setShowResolved] = useState(false);
  // When in the resolved view, optionally include archived items (default: hidden, excluded from PDF)
  const [showArchived, setShowArchived] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<IssueStatus | null>(null);

  // Sortable column headers in the table view
  type TableSortKey = "title" | "status" | "priority" | "category" | "property" | "assignee" | "date";
  const [tableSort, setTableSort] = useState<{ key: TableSortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const toggleTableSort = (key: TableSortKey) => {
    setTableSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };
  const STATUS_ORDER: Record<string, number> = { reported: 0, under_investigation: 1, approved: 2, scheduled: 3, in_progress: 3, resolved: 4 };
  const sortForTable = (list: MaintenanceIssue[]): MaintenanceIssue[] => {
    const { key, dir } = tableSort;
    const mul = dir === "asc" ? 1 : -1;
    const cmp = (a: MaintenanceIssue, b: MaintenanceIssue): number => {
      switch (key) {
        case "title":    return (a.title ?? "").localeCompare(b.title ?? "") * mul;
        case "status":   return ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)) * mul;
        case "priority": return ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)) * mul;
        case "category": return (a.category ?? "").localeCompare(b.category ?? "") * mul;
        case "property": return (a.property_name ?? "").localeCompare(b.property_name ?? "") * mul;
        case "assignee": return (a.assignee_name ?? "").localeCompare(b.assignee_name ?? "") * mul;
        case "date":     return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * mul;
      }
    };
    return [...list].sort(cmp);
  };

  // Only sort + property-picker filter remain client-side; search/cat/priority go to DB
  const filtered = useCallback(() => {
    let list = [...issues];
    if (filterProp) list = list.filter(i => i.property_id === filterProp);
    // Archived items are hidden by default. Only surface them when the user
    // is in the resolved-only view AND has explicitly opted in.
    if (!(showResolved && showArchived)) {
      list = list.filter(i => !i.is_archived);
    }
    list.sort((a, b) => {
      if (sortBy === "newest")   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest")   return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      if (sortBy === "status")   return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      return 0;
    });
    return list;
  }, [issues, filterProp, sortBy, showResolved, showArchived]);

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
    if (!userId) return false;
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
    return Boolean(newIssue);
  };

  const handleEdit = async (patch: Partial<MaintenanceIssue>) => {
    if (!editIssue) return false;
    const { error } = await updateIssue(editIssue.id, patch);
    if (!error) setEditIssue(null);
    return !error;
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
        title: `Issue marked for Summer Maintenance: ${issue.title}`,
        body: `${approverName} marked a maintenance issue for Summer Maintenance on ${issue.property_name ?? "a property"}.`,
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

  // Archive / unarchive a resolved issue. Archived items are hidden from the
  // default views and excluded from PDF downloads so the resolved list does
  // not grow unbounded over time.
  const handleArchiveToggle = async (issue: MaintenanceIssue, archived: boolean) => {
    await updateIssue(issue.id, { is_archived: archived });
    setDetailIssue(prev => prev?.id === issue.id ? { ...prev, is_archived: archived } : prev);
  };

  // ─── Calendar sync helper for planned maintenance ──────────────────────────
  const syncCalendarForPlanned = async (
    entryId: string,
    calendarEventId: string | null,
    entry: Partial<PlannedMaintenanceEntry>,
  ) => {
    // Weekly and monthly tasks are excluded from the calendar
    if (entry.recurrence_months === -1 || entry.recurrence_months === -2) return;

    // Build calendar start/end date from the entry's current date fields
    let calStartDate: string | null = null;
    let calEndDate: string | null = null;
    if (entry.date_type === "specific" && entry.scheduled_date) {
      const time = entry.scheduled_time ? entry.scheduled_time.slice(0, 5) : "09:00";
      calStartDate = `${entry.scheduled_date}T${time}:00`;
      // End = start + 1 hour
      const [h, m] = time.split(":").map(Number);
      const endH = String(Math.min(h + 1, 23)).padStart(2, "0");
      calEndDate = `${entry.scheduled_date}T${endH}:${String(m).padStart(2, "0")}:00`;
    } else if (entry.date_type === "month_only" && entry.scheduled_month && entry.scheduled_year) {
      const mm = String(entry.scheduled_month).padStart(2, "0");
      calStartDate = `${entry.scheduled_year}-${mm}-01T09:00:00`;
      calEndDate = `${entry.scheduled_year}-${mm}-01T17:00:00`;
    }

    if (!calStartDate) return;

    const calTitle = `🔧 ${entry.title ?? "Maintenance"}`;
    const calStatus = entry.date_type === "month_only" ? "unconfirmed" : "upcoming";

    if (calendarEventId) {
      // Update existing calendar event
      await supabase
        .from("calendar_events")
        .update({
          title: calTitle,
          description: entry.description ?? undefined,
          start_date: calStartDate,
          end_date: calEndDate,
          property_id: entry.property_id ?? undefined,
          status: calStatus,
          calendar_source: "planned_maintenance",
        })
        .eq("id", calendarEventId);
    } else {
      // Create a new calendar event and link it
      const { data: calEvent } = await supabase
        .from("calendar_events")
        .insert({
          title: calTitle,
          description: entry.description ?? undefined,
          event_type: "maintenance",
          start_date: calStartDate,
          end_date: calEndDate,
          property_id: entry.property_id ?? undefined,
          status: calStatus,
          calendar_source: "planned_maintenance",
          created_by: userId ?? undefined,
        })
        .select()
        .single();

      if (calEvent) {
        await supabase
          .from("planned_maintenance")
          .update({ calendar_event_id: calEvent.id })
          .eq("id", entryId);
      }
    }
  };

  // ─── Planned maintenance ──────────────────────────────────────────────────────
  const handleCreatePlanned = async (payload: Parameters<typeof createEntry>[0]) => {
    const entry = await createEntry(payload);
    if (!entry) return;

    // Build a calendar event (place month-only entries on the 1st of the month)
    let calStartDate: string;
    let calEndDate: string;
    if (payload.date_type === "specific" && payload.scheduled_date) {
      const time = payload.scheduled_time ? payload.scheduled_time.slice(0, 5) : "09:00";
      calStartDate = `${payload.scheduled_date}T${time}:00`;
      const [h, m] = time.split(":").map(Number);
      const endH = String(Math.min(h + 1, 23)).padStart(2, "0");
      calEndDate = `${payload.scheduled_date}T${endH}:${String(m).padStart(2, "0")}:00`;
    } else if (payload.date_type === "month_only" && payload.scheduled_month && payload.scheduled_year) {
      const mm = String(payload.scheduled_month).padStart(2, "0");
      calStartDate = `${payload.scheduled_year}-${mm}-01T09:00:00`;
      calEndDate = `${payload.scheduled_year}-${mm}-01T17:00:00`;
    } else {
      calStartDate = new Date().toISOString();
      calEndDate = new Date().toISOString();
    }

    const calTitle = `🔧 ${payload.title}`;
    const { data: calEvent } = await supabase
      .from("calendar_events")
      .insert({
        title: calTitle,
        description: payload.description ?? undefined,
        event_type: "maintenance",
        start_date: calStartDate,
        end_date: calEndDate,
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

    // Re-read the entry from DB to capture any auto-rolled dates from the hook
    const { data: updated } = await supabase
      .from("planned_maintenance")
        .select(PLANNED_FULL_COLS)
      .eq("id", editPlanned.id)
      .single();

    if (updated) {
      await syncCalendarForPlanned(editPlanned.id, updated.calendar_event_id, updated as PlannedMaintenanceEntry);
    }

    refetchPlanned();
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
              <IssueCard key={issue.id} issue={issue} onClick={() => openIssueDetail(issue)} compact />
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
            onEdit={openIssueEditor}
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

        {/* Repairs / Planned tabs */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setActiveTab("repairs")}
            className={cn("text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
              activeTab === "repairs" ? "bg-gold/10 border-gold/50 text-gold" : "border-border text-muted-foreground hover:border-gold/30")}>
            {isL ? "Reparaciones" : "Repairs"}
          </button>
          <button onClick={() => setActiveTab("planned")}
            className={cn("text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
              activeTab === "planned" ? "bg-gold/10 border-gold/50 text-gold" : "border-border text-muted-foreground hover:border-gold/30")}>
            {isL ? "Planificado" : "Planned"}
          </button>
        </div>

        {properties.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setFilterProp("")}
              className={cn("flex-shrink-0 text-xs rounded-full border px-3 py-1 font-medium transition-colors",
                !filterProp ? "bg-gold/10 border-gold/50 text-gold" : "border-border text-muted-foreground hover:border-gold/30"
              )}>
              {isL ? "Todas" : "All"}
            </button>
            {properties.map(p => (
              <button key={p.id} onClick={() => setFilterProp(p.id)}
                className={cn("flex-shrink-0 text-xs rounded-full border px-3 py-1 font-medium transition-colors",
                  filterProp === p.id ? "bg-gold/10 border-gold/50 text-gold" : "border-border text-muted-foreground hover:border-gold/30"
                )}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        {activeTab === "repairs" ? (
          <div className="space-y-3">
            {displayIssues.map(issue => (
              <IssueCard key={issue.id} issue={issue} onClick={() => openIssueDetail(issue)} compact />
            ))}
          </div>
        ) : (
          <PlannedMaintenanceList
            entries={plannedEntries}
            loading={plannedLoading}
            canManage={canEdit("maintenance")}
            properties={properties}
            propertyFilter={filterProp}
            onPropertyFilterChange={setFilterProp}
            onAdd={() => { setEditPlanned(null); setPlannedModalOpen(true); }}
            onEdit={(entry) => { setEditPlanned(entry); setPlannedModalOpen(true); }}
            onDelete={deleteEntry}
            onStatusChange={async (id, status) => { await updateEntry(id, { status }); }}
            refetch={refetchPlanned}
          />
        )}

        <IssueModal open={modalOpen} onClose={() => { setModalOpen(false); setEditIssue(null); }}
          onSave={editIssue ? handleEdit : handleCreate}
          initial={editIssue ?? undefined}
          categories={categories} onCategoryAdded={fetchIssues}
          properties={properties} profiles={profiles}
          existingIssues={issues.map(i => ({ id: i.id, title: i.title, created_at: i.created_at }))}
          mode={editIssue ? "edit" : "create"} />
        {detailIssue && (
          <IssueDetailDrawer issue={detailIssue} onClose={() => setDetailIssue(null)}
            onEdit={detailIssue.reported_by === userId && detailIssue.status === "reported"
              ? openIssueEditor
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
                {showResolved ? (
                  <>
                    {displayIssues.filter(i => i.status === "resolved").length} {isL ? "resueltos" : "resolved"}
                    <button onClick={() => setShowResolved(false)} className="ml-2 text-gold hover:underline font-semibold">
                      ← {isL ? "Volver a activos" : "Back to active"}
                    </button>
                    <button
                      onClick={() => setShowArchived(v => !v)}
                      className={cn(
                        "ml-2 hover:underline",
                        showArchived ? "text-gold font-semibold" : "text-muted-foreground",
                      )}
                      title={isL ? "Los archivados se ocultan del PDF" : "Archived items are hidden from the PDF"}
                    >
                      {showArchived
                        ? (isL ? "· Ocultar archivados" : "· Hide archived")
                        : (isL ? "· Mostrar archivados" : "· Show archived")}
                    </button>
                  </>
                ) : (
                  <>
                    {openCount} {isL ? "abiertos" : "open"}
                    <button onClick={() => setShowResolved(true)} className="ml-2 text-gold hover:underline">
                      · {displayIssues.filter(i => i.status === "resolved").length} {isL ? "resueltos →" : "resolved →"}
                    </button>
                    {reportedCount > 0 && (
                      <span className="ml-2 text-amber-400 font-semibold">· {reportedCount} {t("awaitingApproval")}</span>
                    )}
                  </>
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

            {/* Sort/view bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
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

              {/* Include notes toggle (affects PDF download) */}
              <label
                title={isL ? "Incluir notas en el PDF" : "Include notes in PDF"}
                className="flex-shrink-0 flex items-center gap-1.5 text-[11px] text-muted-foreground ml-auto cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => setIncludeNotes(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border accent-gold cursor-pointer"
                />
                {isL ? "Notas" : "Notes"}
              </label>

              {/* Download PDF (current filters/view + current sort) */}
              <button
                onClick={async () => {
                  const sortedForExport =
                    viewMode === "table"
                      ? sortForTable(displayIssues)
                      : viewMode === "board"
                        ? [...displayIssues].sort(
                            (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
                          )
                        : displayIssues;

                  // Ensure the export uses the latest notes from the database.
                  let issuesForExport = sortedForExport;
                  if (includeNotes && sortedForExport.length > 0) {
                    const ids = sortedForExport.map(i => i.id);
                    const { data: descs } = await supabase
                      .from("maintenance_issues")
                      .select("id, description")
                      .in("id", ids);
                    const descMap = new Map((descs ?? []).map(d => [d.id, d.description]));
                    issuesForExport = sortedForExport.map(i => ({
                      ...i,
                      description: descMap.get(i.id) ?? i.description ?? null,
                    }));
                  }

                  exportRepairsPDF({
                    issues: issuesForExport,
                    viewMode: viewMode === "table" ? "list" : "tile",
                    includeNotes,
                    filters: {
                      propertyName: filterProp
                        ? properties.find(p => p.id === filterProp)?.name ?? null
                        : null,
                      category: filterCat || null,
                      priority: filterPri || null,
                      search: search || null,
                    },
                  });
                }}
                disabled={displayIssues.length === 0}
                title="Download current view as PDF"
                className="flex-shrink-0 p-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed">
                <Download size={13} />
              </button>


              {/* View toggle */}
              <div className="flex-shrink-0 flex items-center border border-border rounded-full overflow-hidden">
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

            {/* Always-visible filters */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-muted/30 rounded-xl border border-border">
              <select value={filterProp} onChange={e => setFilterProp(e.target.value)}
                className={cn(
                  "text-xs rounded-lg border px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30 font-medium transition-colors",
                  filterProp
                    ? "bg-gold/15 border-gold text-gold ring-1 ring-gold/40"
                    : "border-input bg-background"
                )}>
                <option value="">{t("allPropertiesFilter")}</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className={cn(
                  "text-xs rounded-lg border px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30 transition-colors",
                  filterCat ? "bg-gold/10 border-gold/60 text-gold font-medium" : "border-input bg-background"
                )}>
                <option value="">{t("allCategories")}</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
              </select>
              <select value={filterPri} onChange={e => setFilterPri(e.target.value)}
                className={cn(
                  "text-xs rounded-lg border px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30 transition-colors",
                  filterPri ? "bg-gold/10 border-gold/60 text-gold font-medium" : "border-input bg-background"
                )}>
                  <option value="">{t("allPriorities")}</option>
                  <option value="urgent">🔴 {isL ? "Urgente" : "Urgent"}</option>
                  <option value="high">🟠 {isL ? "Alto" : "High"}</option>
                  <option value="medium">🟡 {isL ? "Medio" : "Medium"}</option>
                  <option value="low">⚪ {isL ? "Bajo" : "Low"}</option>
                </select>
              </div>

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
          onStatusChange={async (id, status) => {
            const entry = plannedEntries.find(e => e.id === id);
            await updateEntry(id, { status });
            // After updateEntry (which may have rolled dates forward), refetch and sync calendar
            if (entry) {
              // Re-read the updated entry to get rolled-forward dates
              const { data: updated } = await supabase
                .from("planned_maintenance")
                .select(PLANNED_FULL_COLS)
                .eq("id", id)
                .single();
              if (updated) {
                await syncCalendarForPlanned(id, updated.calendar_event_id, updated as PlannedMaintenanceEntry);
              }
            }
          }}
          refetch={refetchPlanned}
        />
      ) : (
      <>
      {/* ─── Repairs content ─── */}
      {(() => {
        const viewIssues = showResolved
          ? displayIssues.filter(i => i.status === "resolved")
          : displayIssues.filter(i => i.status !== "resolved");
        return loading ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : viewIssues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3">
          <Wrench size={40} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {showResolved ? (isL ? "Sin problemas resueltos" : "No resolved issues") : (isL ? "Sin problemas encontrados" : "No issues found")}
          </p>
        </div>
      ) : showResolved ? (
        <div className="px-4 pb-4 space-y-3">
          {viewIssues.map(issue => (
            <IssueCard key={issue.id} issue={issue} onClick={() => openIssueDetail(issue)} compact />
          ))}
        </div>
      ) : viewMode === "board" ? (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STATUS_COLUMNS.map(col => {
              const colIssues = displayIssues.filter(i => i.status === col.key || (col.key === "scheduled" && i.status === "in_progress"));
              const isEmpty = colIssues.length === 0;
              const isDragOver = dragOverCol === col.key;
              return (
                <div key={col.key} className={cn("min-w-0", isEmpty && !isDragOver && "hidden sm:block")}>
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
                  <div
                    onDragOver={canManage ? (e) => { e.preventDefault(); if (dragOverCol !== col.key) setDragOverCol(col.key); } : undefined}
                    onDragLeave={canManage ? () => setDragOverCol(prev => prev === col.key ? null : prev) : undefined}
                    onDrop={canManage ? async (e) => {
                      e.preventDefault();
                      setDragOverCol(null);
                      const id = e.dataTransfer.getData("text/issue-id");
                      const issue = issues.find(i => i.id === id);
                      if (!issue || issue.status === col.key) return;
                      const scheduledDate = col.key === "scheduled" ? new Date().toISOString() : undefined;
                      await handleStatusChange(issue, col.key, scheduledDate);
                    } : undefined}
                    className={cn(
                      "rounded-b-xl p-2 space-y-2 min-h-[100px] max-h-[60vh] overflow-y-auto transition-colors",
                      isDragOver ? "bg-gold/10 ring-2 ring-gold/40" : "bg-muted/20"
                    )}>
                    {colIssues.map(issue => (
                      <div
                        key={issue.id}
                        className="relative group/card"
                        draggable={canManage}
                        onDragStart={canManage ? (e) => {
                          e.dataTransfer.setData("text/issue-id", issue.id);
                          e.dataTransfer.effectAllowed = "move";
                        } : undefined}
                      >
                        <IssueCard
                          issue={issue}
                          onClick={() => openIssueDetail(issue)}
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
                        {isDragOver ? (isL ? "Suelta aquí" : "Drop here") : (isL ? "Sin problemas" : "No issues")}
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
          {viewIssues.map(issue => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onClick={() => openIssueDetail(issue)}
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
                {([
                  { key: "title",    label: isL ? "Título" : "Title" },
                  { key: "status",   label: isL ? "Estado" : "Status" },
                  { key: "priority", label: isL ? "Prioridad" : "Priority" },
                  { key: "category", label: isL ? "Categoría" : "Category" },
                  { key: "property", label: isL ? "Propiedad" : "Property" },
                  { key: "assignee", label: isL ? "Asignado a" : "Assigned" },
                  { key: "date",     label: isL ? "Fecha" : "Date" },
                ] as { key: TableSortKey; label: string }[]).map(h => {
                  const active = tableSort.key === h.key;
                  return (
                    <th
                      key={h.key}
                      onClick={() => toggleTableSort(h.key)}
                      onTouchEnd={(e) => { e.preventDefault(); toggleTableSort(h.key); }}
                      className={cn(
                        "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {h.label}
                        {active && (tableSort.dir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortForTable(viewIssues).map(issue => (
                <tr
                  key={issue.id}
                  onClick={() => openIssueDetail(issue)}
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
      );
      })()}
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
          onEdit={openIssueEditor}
          onStatusChange={canManage ? handleStatusChange : undefined}
          onArchiveToggle={canManage ? handleArchiveToggle : undefined}
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
