import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Search, Filter, SortAsc, Wrench, ChevronDown,
  LayoutGrid, Table2, RefreshCw, MapPin, User, Calendar,
  Flag, Tag, Clock, CheckCircle2,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useMaintenanceIssues, MaintenanceIssue, IssueStatus } from "@/hooks/useMaintenanceIssues";
import { supabase } from "@/integrations/supabase/client";
import { IssueCard } from "@/components/maintenance/IssueCard";
import { IssueModal } from "@/components/maintenance/IssueModal";
import { IssueStatusBadge, IssuePriorityBadge } from "@/components/maintenance/IssueStatusBadge";
import { IssueDetailDrawer } from "@/components/maintenance/IssueDetailDrawer";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const STATUS_COLUMNS: { key: IssueStatus; label: string }[] = [
  { key: "reported",    label: "Reported" },
  { key: "approved",    label: "Approved" },
  { key: "assigned",    label: "Assigned" },
  { key: "scheduled",   label: "Scheduled" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved",    label: "Resolved" },
];

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

type ViewMode = "board" | "list" | "table";

export function MaintenanceSection() {
  const { isAdmin, isManager, isMasterAdmin, isFamily, userId, assignedPropertyIds } = usePermissions();
  const canManage = isMasterAdmin || isAdmin || isManager;
  const { issues, categories, loading, fetchIssues, createIssue, updateIssue, deleteIssue, addCategory } = useMaintenanceIssues();

  const [search,       setSearch]       = useState("");
  const [filterProp,   setFilterProp]   = useState("");
  const [filterCat,    setFilterCat]    = useState("");
  const [filterPri,    setFilterPri]    = useState("");
  const [sortBy,       setSortBy]       = useState<"newest" | "oldest" | "priority" | "status">("newest");
  const [viewMode,     setViewMode]     = useState<ViewMode>("board");
  const [showFilters,  setShowFilters]  = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editIssue,    setEditIssue]    = useState<MaintenanceIssue | null>(null);
  const [detailIssue,  setDetailIssue]  = useState<MaintenanceIssue | null>(null);
  const [allProperties, setAllProperties] = useState<{ id: string; name: string }[]>([]);
  const [profiles,     setProfiles]     = useState<{ id: string; name: string; avatar: string | null }[]>([]);

  // Scoped properties: master_admin/admin/manager see all; others only see assigned
  const properties = (isMasterAdmin || isAdmin || isManager)
    ? allProperties
    : allProperties.filter(p => assignedPropertyIds.includes(p.id));

  useEffect(() => {
    supabase.from("properties").select("id, name").order("name")
      .then(({ data }) => setAllProperties((data ?? []).map((p: any) => p)));
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name")
      .then(({ data }) => setProfiles((data ?? []).map((p: any) => ({
        id: p.id, name: p.full_name ?? "Unknown", avatar: p.avatar_url,
      }))));
  }, []);

  const filtered = useCallback(() => {
    let list = [...issues];

    // Non-admin: always scope to assigned properties
    if (!isMasterAdmin && !isAdmin && !isManager && assignedPropertyIds.length > 0) {
      list = list.filter(i => !i.property_id || assignedPropertyIds.includes(i.property_id));
    }

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
  }, [issues, search, filterProp, filterCat, filterPri, sortBy, isMasterAdmin, isAdmin, isManager, assignedPropertyIds]);

  const displayIssues = filtered();
  // Pending = reported status (staff-logged, not yet approved)
  const pendingIssues = displayIssues.filter(i => i.status === "reported");
  const openCount = displayIssues.filter(i => i.status !== "resolved").length;
  // Non-pending for the main board
  const boardIssues = displayIssues.filter(i => i.status !== "reported");

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

  const handleApprove = async (issue: MaintenanceIssue) => {
    await updateIssue(issue.id, { status: "approved" });
  };

  const handleCategoryAdded = () => {
    fetchIssues();
  };

  // ─── Family read-only status feed ────────────────────────────────────────────
  if (isFamily && !canManage) {
    const openIssues = displayIssues.filter(i => i.status !== "resolved");
    return (
      <div className="animate-fade-in px-4 py-4">
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
          categories={categories} onCategoryAdded={handleCategoryAdded}
          properties={properties} profiles={profiles}
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
            <button onClick={() => { setEditIssue(null); setModalOpen(true); }}
              className="flex items-center gap-1.5 bg-gold/90 hover:bg-gold text-charcoal text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
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

      {/* ─── Pending Approvals (master admin only) ─── */}
      {isMasterAdmin && pendingIssues.length > 0 && (
        <div className="mx-4 mb-4 rounded-xl border border-amber-400/30 bg-amber-400/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-400/20 bg-amber-400/10">
            <Clock size={13} className="text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">Pending Approval</span>
            <span className="ml-auto text-[10px] bg-amber-400/20 text-amber-400 rounded-full px-2 py-0.5 font-bold">
              {pendingIssues.length}
            </span>
          </div>
          <div className="divide-y divide-amber-400/10">
            {pendingIssues.map(issue => (
              <div key={issue.id} className="flex items-start gap-3 px-4 py-3">
                {issue.photo_url && (
                  <img src={issue.photo_url} alt={issue.title}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 cursor-pointer"
                    onClick={() => setDetailIssue(issue)} />
                )}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailIssue(issue)}>
                  <p className="text-sm font-semibold text-foreground truncate">{issue.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{issue.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <IssuePriorityBadge priority={issue.priority} />
                    {issue.reporter_name && (
                      <span className="text-[10px] text-muted-foreground">by {issue.reporter_name}</span>
                    )}
                    {issue.property_name && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <MapPin size={8} />{issue.property_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(issue)}
                    className="flex items-center gap-1 text-[11px] font-semibold bg-[hsl(var(--status-done)/0.15)] text-[hsl(var(--status-done))] border border-[hsl(var(--status-done)/0.3)] rounded-lg px-2.5 py-1.5 hover:bg-[hsl(var(--status-done)/0.25)] transition-colors"
                  >
                    <CheckCircle2 size={11} /> Approve
                  </button>
                  <button
                    onClick={() => { setEditIssue(issue); }}
                    className="text-[11px] text-muted-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Content ─── */}
      {loading ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : boardIssues.length === 0 && pendingIssues.length === 0 ? (
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
        <BoardView
          displayIssues={boardIssues}
          onCardClick={setDetailIssue}
          onStatusChange={handleStatusChange}
          canManage={canManage}
        />
      ) : viewMode === "table" ? (
        <TableView
          displayIssues={displayIssues}
          onRowClick={setDetailIssue}
        />
      ) : (
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
        onCategoryAdded={handleCategoryAdded}
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
          onCategoryAdded={handleCategoryAdded}
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

// ─── Drag-and-drop Kanban Board ───────────────────────────────────────────────
function BoardView({
  displayIssues,
  onCardClick,
  onStatusChange,
  canManage,
}: {
  displayIssues: MaintenanceIssue[];
  onCardClick: (i: MaintenanceIssue) => void;
  onStatusChange: (i: MaintenanceIssue, s: IssueStatus) => void;
  canManage: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<IssueStatus | null>(null);

  // Non-reported statuses for the board
  const BOARD_COLS = STATUS_COLUMNS.filter(c => c.key !== "reported");

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData("issueId", issueId);
    setDraggingId(issueId);
  };

  const handleDragOver = (e: React.DragEvent, status: IssueStatus) => {
    e.preventDefault();
    setDragOverCol(status);
  };

  const handleDrop = (e: React.DragEvent, status: IssueStatus) => {
    e.preventDefault();
    const issueId = e.dataTransfer.getData("issueId");
    const issue = displayIssues.find(i => i.id === issueId);
    if (issue && issue.status !== status && canManage) {
      onStatusChange(issue, status);
    }
    setDraggingId(null);
    setDragOverCol(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
  };

  return (
    <>
      {/* Mobile: 2-column grid grouped by status */}
      <div className="md:hidden px-4 pb-6 space-y-4">
        {BOARD_COLS.map(col => {
          const colIssues = displayIssues.filter(i => i.status === col.key);
          if (colIssues.length === 0) return null;
          return (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-2">
                <IssueStatusBadge status={col.key} />
                <span className="text-[10px] text-muted-foreground bg-muted rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                  {colIssues.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {colIssues.map(issue => (
                  <KanbanCard
                    key={issue.id}
                    issue={issue}
                    onClick={() => onCardClick(issue)}
                    isDragging={draggingId === issue.id}
                    onDragStart={canManage ? handleDragStart : undefined}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop ≥md: 2-column layout — col 1: Reported/Approved/Assigned, col 2: Scheduled/In Progress/Resolved */}
      <div className="hidden md:grid md:grid-cols-2 gap-4 px-4 pb-6">
        {[
          { label: "Incoming", cols: ["reported", "approved", "assigned"] as IssueStatus[] },
          { label: "Active",   cols: ["scheduled", "in_progress", "resolved"] as IssueStatus[] },
        ].map(group => (
          <div key={group.label} className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">{group.label}</p>
            {group.cols.map(colKey => {
              const col = STATUS_COLUMNS.find(c => c.key === colKey)!;
              const colIssues = displayIssues.filter(i => i.status === col.key);
              const isOver = dragOverCol === col.key;
              return (
                <div
                  key={col.key}
                  className={cn(
                    "rounded-xl border border-border p-3 transition-colors",
                    isOver && canManage ? "bg-gold/5 border-gold/30" : "bg-card/50"
                  )}
                  onDragOver={e => handleDragOver(e, col.key)}
                  onDrop={e => handleDrop(e, col.key)}
                  onDragLeave={() => setDragOverCol(null)}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <IssueStatusBadge status={col.key} />
                    <span className="ml-auto text-[10px] text-muted-foreground bg-muted rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                      {colIssues.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 min-h-[3rem]">
                    {colIssues.map(issue => (
                      <KanbanCard
                        key={issue.id}
                        issue={issue}
                        onClick={() => onCardClick(issue)}
                        isDragging={draggingId === issue.id}
                        onDragStart={canManage ? handleDragStart : undefined}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                    {colIssues.length === 0 && (
                      <div className={cn(
                        "col-span-2 rounded-xl border border-dashed h-12 flex items-center justify-center transition-colors",
                        isOver && canManage ? "border-gold/50 bg-gold/5" : "border-border/50"
                      )}>
                        <p className="text-xs text-muted-foreground/30">
                          {isOver && canManage ? "Drop here" : "—"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

// Kanban card with photo thumbnail + drag handle
function KanbanCard({
  issue,
  onClick,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  issue: MaintenanceIssue;
  onClick: () => void;
  isDragging: boolean;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragEnd?: () => void;
}) {
  const CATEGORY_ICONS: Record<string, string> = {
    "Plumbing": "🔵", "Electrical / Tech": "⚡", "Climate / HVAC": "❄️",
    "Outdoor / Grounds": "🌿", "Appliances": "🏠", "Structural": "🧱",
    "Security": "🔒", "General": "🔧",
  };
  const icon = CATEGORY_ICONS[issue.category] ?? "🔧";

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? e => onDragStart(e, issue.id) : undefined}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-xl overflow-hidden cursor-pointer",
        "hover:border-gold/30 hover:shadow-sm transition-all active:scale-[0.99] group",
        issue.priority === "urgent" && "border-l-4 border-l-[hsl(var(--status-urgent))]",
        issue.priority === "high" && "border-l-4 border-l-orange-400",
        isDragging && "opacity-40 scale-95 rotate-1",
        onDragStart && "cursor-grab active:cursor-grabbing"
      )}
    >
      {/* Photo thumbnail */}
      {issue.photo_url && (
        <div className="relative h-24 bg-muted overflow-hidden">
          <img
            src={issue.photo_url}
            alt={issue.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      )}
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-start gap-1.5">
          <span className="text-base flex-shrink-0">{icon}</span>
          <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 flex-1">{issue.title}</p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <IssuePriorityBadge priority={issue.priority} />
          {issue.scheduled_date && (
            <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
              <Calendar size={8} />
              {format(new Date(issue.scheduled_date), "MMM d")}
            </span>
          )}
        </div>
        {issue.assignee_name && (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            {issue.assignee_avatar
              ? <img src={issue.assignee_avatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
              : <div className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center"><User size={7} /></div>
            }
            <span className="truncate">{issue.assignee_name}</span>
          </div>
        )}
        {issue.property_name && (
          <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
            <MapPin size={8} /><span className="truncate">{issue.property_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Spreadsheet / Table view ─────────────────────────────────────────────────
function TableView({ displayIssues, onRowClick }: { displayIssues: MaintenanceIssue[]; onRowClick: (i: MaintenanceIssue) => void }) {
  return (
    <div className="px-4 pb-6 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {[
              { icon: <Tag size={11}/>,      label: "Issue" },
              { icon: <Flag size={11}/>,     label: "Priority" },
              { icon: <Filter size={11}/>,   label: "Status" },
              { icon: <Tag size={11}/>,      label: "Category" },
              { icon: <MapPin size={11}/>,   label: "Property / Room" },
              { icon: <User size={11}/>,     label: "Assigned" },
              { icon: <Calendar size={11}/>, label: "Date" },
            ].map(h => (
              <th key={h.label} className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <span className="flex items-center gap-1">{h.icon}{h.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {displayIssues.map(issue => (
            <tr
              key={issue.id}
              onClick={() => onRowClick(issue)}
              className="hover:bg-muted/40 cursor-pointer transition-colors group"
            >
              <td className="py-2.5 px-3 max-w-[200px]">
                <div className="flex items-center gap-2">
                  {issue.photo_url && (
                    <img src={issue.photo_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                  )}
                  <span className="font-medium text-foreground truncate text-xs group-hover:text-gold transition-colors">
                    {issue.title}
                  </span>
                </div>
              </td>
              <td className="py-2.5 px-3 whitespace-nowrap">
                <IssuePriorityBadge priority={issue.priority} />
              </td>
              <td className="py-2.5 px-3 whitespace-nowrap">
                <IssueStatusBadge status={issue.status} />
              </td>
              <td className="py-2.5 px-3 whitespace-nowrap">
                <span className="text-xs text-muted-foreground">{issue.category}</span>
              </td>
              <td className="py-2.5 px-3">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground">{issue.property_name ?? "—"}</span>
                  {issue.location_detail && <span className="text-[10px] text-muted-foreground">{issue.location_detail}</span>}
                </div>
              </td>
              <td className="py-2.5 px-3 whitespace-nowrap">
                {issue.assignee_name ? (
                  <div className="flex items-center gap-1.5">
                    {issue.assignee_avatar
                      ? <img src={issue.assignee_avatar} alt={issue.assignee_name} className="w-5 h-5 rounded-full object-cover" />
                      : <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                          {issue.assignee_name.charAt(0)}
                        </div>
                    }
                    <span className="text-xs text-foreground">{issue.assignee_name}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/50">Unassigned</span>
                )}
              </td>
              <td className="py-2.5 px-3 whitespace-nowrap">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(issue.created_at), "MMM d, yy")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
