import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Filter, SortAsc, Wrench, ChevronDown, LayoutGrid, List, RefreshCw, Eye } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useMaintenanceIssues, MaintenanceIssue, IssueStatus } from "@/hooks/useMaintenanceIssues";
import { supabase } from "@/integrations/supabase/client";
import { IssueCard } from "@/components/maintenance/IssueCard";
import { IssueModal } from "@/components/maintenance/IssueModal";
import { IssueStatusBadge } from "@/components/maintenance/IssueStatusBadge";
import { IssueDetailDrawer } from "@/components/maintenance/IssueDetailDrawer";
import { cn } from "@/lib/utils";

const STATUS_COLUMNS: { key: IssueStatus; label: string }[] = [
  { key: "reported",    label: "Reported" },
  { key: "approved",    label: "Approved" },
  { key: "assigned",    label: "Assigned" },
  { key: "scheduled",   label: "Scheduled" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved",    label: "Resolved" },
];

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function MaintenanceSection() {
  const { isAdmin, isManager, isMasterAdmin, isFamily, userId } = usePermissions();
  const canManage = isMasterAdmin || isAdmin || isManager;
  const { issues, categories, loading, fetchIssues, createIssue, updateIssue, deleteIssue } = useMaintenanceIssues();

  const [search,       setSearch]       = useState("");
  const [filterProp,   setFilterProp]   = useState("");
  const [filterCat,    setFilterCat]    = useState("");
  const [filterPri,    setFilterPri]    = useState("");
  const [sortBy,       setSortBy]       = useState<"newest" | "oldest" | "priority" | "status">("newest");
  const [viewMode,     setViewMode]     = useState<"board" | "list">("board");
  const [showFilters,  setShowFilters]  = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editIssue,    setEditIssue]    = useState<MaintenanceIssue | null>(null);
  const [detailIssue,  setDetailIssue]  = useState<MaintenanceIssue | null>(null);
  const [properties,   setProperties]   = useState<{ id: string; name: string }[]>([]);
  const [profiles,     setProfiles]     = useState<{ id: string; name: string; avatar: string | null }[]>([]);

  // Load properties + profiles for modals
  useEffect(() => {
    supabase.from("properties").select("id, name").order("name")
      .then(({ data }) => setProperties((data ?? []).map((p: { id: string; name: string }) => p)));
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name")
      .then(({ data }) => setProfiles((data ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => ({
        id: p.id, name: p.full_name ?? "Unknown", avatar: p.avatar_url,
      }))));
  }, []);

  const filtered = useCallback(() => {
    let list = [...issues];
    if (search)     list = list.filter(i => i.title.toLowerCase().includes(search.toLowerCase()) || (i.description ?? "").toLowerCase().includes(search.toLowerCase()));
    if (filterProp) list = list.filter(i => i.property_id === filterProp);
    if (filterCat)  list = list.filter(i => i.category === filterCat);
    if (filterPri)  list = list.filter(i => i.priority === filterPri);

    list.sort((a, b) => {
      if (sortBy === "newest")   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest")   return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      return 0;
    });
    return list;
  }, [issues, search, filterProp, filterCat, filterPri, sortBy]);

  const displayIssues = filtered();
  const openCount = displayIssues.filter(i => i.status !== "resolved").length;

  const handleCreate = async (payload: Partial<MaintenanceIssue>) => {
    if (!userId) return;
    await createIssue({ ...payload, reported_by: userId } as Parameters<typeof createIssue>[0]);
  };

  const handleEdit = async (patch: Partial<MaintenanceIssue>) => {
    if (!editIssue) return;
    await updateIssue(editIssue.id, patch);
    setEditIssue(null);
  };

  const handleStatusChange = async (issue: MaintenanceIssue, newStatus: IssueStatus) => {
    const patch: Partial<MaintenanceIssue> = { status: newStatus };
    if (newStatus === "resolved") patch.resolved_at = new Date().toISOString();
    await updateIssue(issue.id, patch);
  };

  // ─── Family read-only status feed ────────────────────────────────────────────
  if (isFamily && !canManage) {
    const openIssues = displayIssues.filter(i => i.status !== "resolved");
    return (
      <div className="animate-fade-in px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl text-foreground">Maintenance</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{openIssues.length} open issue{openIssues.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => { setModalOpen(true); setEditIssue(null); }}
            className="flex items-center gap-2 bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Report
          </button>
        </div>

        {/* Filter bar */}
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
            <p className="font-medium text-foreground text-sm">All clear</p>
            <p className="text-xs text-muted-foreground mt-1">No open maintenance issues.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openIssues.map(issue => (
              <IssueCard key={issue.id} issue={issue} onClick={() => setDetailIssue(issue)} compact />
            ))}
          </div>
        )}

        <IssueModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleCreate}
          categories={categories} properties={properties} profiles={profiles}
          existingIssues={issues.map(i => ({ id: i.id, title: i.title, created_at: i.created_at }))}
          mode="create" />
        {detailIssue && (
          <IssueDetailDrawer issue={detailIssue} onClose={() => setDetailIssue(null)}
            onEdit={canManage ? (i) => { setEditIssue(i); setDetailIssue(null); } : undefined}
            onStatusChange={canManage ? handleStatusChange : undefined}
            onDelete={canManage ? deleteIssue : undefined}
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
        {/* Title + actions */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-foreground">Maintenance</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {openCount} open · {displayIssues.filter(i => i.status === "resolved").length} resolved
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchIssues}
              className={cn("p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground", loading && "animate-spin text-gold")}>
              <RefreshCw size={15} />
            </button>
            <button
              onClick={() => { setEditIssue(null); setModalOpen(true); }}
              className="flex items-center gap-1.5 bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <Plus size={14} /> Report Issue
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search issues…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
          />
        </div>

        {/* Filter/sort bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex-shrink-0 flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 font-medium transition-colors",
              showFilters ? "bg-gold/10 border-gold/50 text-gold" : "border-border text-muted-foreground hover:border-gold/30"
            )}>
            <Filter size={11} /> Filters {(filterProp || filterCat || filterPri) ? "●" : ""}
          </button>

          {/* Sort */}
          <div className="relative flex-shrink-0">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="appearance-none text-xs rounded-full border border-border bg-background pl-7 pr-6 py-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold/30 cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="priority">By priority</option>
              <option value="status">By status</option>
            </select>
            <SortAsc size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* View toggle */}
          <div className="flex-shrink-0 flex items-center border border-border rounded-full overflow-hidden ml-auto">
            <button onClick={() => setViewMode("board")} className={cn("p-1.5 transition-colors", viewMode === "board" ? "bg-gold/20 text-gold" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid size={13} />
            </button>
            <button onClick={() => setViewMode("list")} className={cn("p-1.5 transition-colors", viewMode === "list" ? "bg-gold/20 text-gold" : "text-muted-foreground hover:text-foreground")}>
              <List size={13} />
            </button>
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="grid grid-cols-3 gap-2 p-3 bg-muted/30 rounded-xl border border-border">
            <select value={filterProp} onChange={e => setFilterProp(e.target.value)}
              className="text-xs rounded-lg border border-input bg-background px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30">
              <option value="">All properties</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="text-xs rounded-lg border border-input bg-background px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30">
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
            <select value={filterPri} onChange={e => setFilterPri(e.target.value)}
              className="text-xs rounded-lg border border-input bg-background px-2 py-2 focus:outline-none focus:ring-1 focus:ring-gold/30">
              <option value="">All priorities</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">⚪ Low</option>
            </select>
          </div>
        )}
      </div>

      {/* ─── Board / List content ─── */}
      {loading ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : displayIssues.length === 0 ? (
        <div className="mx-4 rounded-2xl bg-card border border-border p-10 text-center">
          <Wrench size={36} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-semibold text-foreground">No issues found</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {search || filterProp || filterCat || filterPri ? "Try adjusting your filters" : "Report the first issue to get started"}
          </p>
          {!search && !filterProp && !filterCat && !filterPri && (
            <button onClick={() => setModalOpen(true)} className="bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
              + Report Issue
            </button>
          )}
        </div>
      ) : viewMode === "board" ? (
        // ── Kanban Board ──
        <div className="overflow-x-auto pb-6">
          <div className="flex gap-3 px-4 min-w-max">
            {STATUS_COLUMNS.map(col => {
              const colIssues = displayIssues.filter(i => i.status === col.key);
              return (
                <div key={col.key} className="w-64 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <IssueStatusBadge status={col.key} />
                    <span className="ml-auto text-[10px] text-muted-foreground bg-muted rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                      {colIssues.length}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {colIssues.map(issue => (
                      <IssueCard key={issue.id} issue={issue} onClick={() => setDetailIssue(issue)} />
                    ))}
                    {colIssues.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border h-16 flex items-center justify-center">
                        <p className="text-xs text-muted-foreground/40">—</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // ── List View ──
        <div className="px-4 space-y-2 pb-6">
          {displayIssues.map(issue => (
            <IssueCard key={issue.id} issue={issue} onClick={() => setDetailIssue(issue)} compact />
          ))}
        </div>
      )}

      {/* Create modal */}
      <IssueModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleCreate}
        categories={categories}
        properties={properties}
        profiles={profiles}
        existingIssues={issues.map(i => ({ id: i.id, title: i.title, created_at: i.created_at }))}
        mode="create"
      />

      {/* Edit modal */}
      {editIssue && (
        <IssueModal
          open={!!editIssue}
          onClose={() => setEditIssue(null)}
          onSave={handleEdit}
          initial={editIssue}
          categories={categories}
          properties={properties}
          profiles={profiles}
          existingIssues={issues.map(i => ({ id: i.id, title: i.title, created_at: i.created_at }))}
          mode="edit"
        />
      )}

      {/* Detail drawer */}
      {detailIssue && (
        <IssueDetailDrawer
          issue={detailIssue}
          onClose={() => setDetailIssue(null)}
          onEdit={canManage ? (i) => { setEditIssue(i); setDetailIssue(null); } : undefined}
          onStatusChange={canManage ? handleStatusChange : undefined}
          onDelete={canManage ? deleteIssue : undefined}
          categories={categories}
        />
      )}
    </div>
  );
}
