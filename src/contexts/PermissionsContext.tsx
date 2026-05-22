import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UserLevel = "principal" | "extended_family" | "manager" | "staff";
export type UserDepartment = "exterior" | "interior" | "kitchen" | "security" | "office" | null;
export type AppRole = "master_admin" | "admin" | "manager" | "staff" | "principal";

export interface SectionPermEntry {
  view: boolean;
  edit: boolean;
  notifications: boolean;
  scope?: "own" | "department" | "all";
}

export interface UserPermissions {
  userId: string | null;
  role: AppRole | null;
  level: UserLevel | null;
  department: UserDepartment;
  assignedPropertyIds: string[];
  isMasterAdmin: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isFamily: boolean;
  fullName: string | null;
  avatarUrl: string | null;
  sectionPermissions: Record<string, SectionPermEntry> | null;
  canSee: (section: string) => boolean;
  canEdit: (section: string) => boolean;
  wantsAlerts: (section: string) => boolean;
  loading: boolean;
  // ── Preview / "View as user" mode ─────────────────────────────────────────
  /** True when a master admin is currently viewing the app through another user's lens. */
  isPreviewing: boolean;
  /** The real signed-in master admin's userId (always set, even during preview). */
  realUserId: string | null;
  /** True if the actual signed-in user is a master_admin (independent of preview). */
  realIsMasterAdmin: boolean;
  /** Display name of the user currently being previewed (only when isPreviewing). */
  previewName: string | null;
}

// Fallback permission matrix: which sections each role can access
const SECTION_PERMISSIONS: Record<string, AppRole[]> = {
  dashboard:            ["master_admin", "admin", "manager", "staff", "principal"],
  property:             ["master_admin", "admin", "manager", "principal"],
  maintenance:          ["master_admin", "admin", "manager", "staff"],
  messages:             ["master_admin", "admin", "manager", "staff", "principal"],
  profile:              ["master_admin", "admin", "manager", "staff", "principal"],
  achievements:         ["master_admin", "admin", "manager", "staff", "principal"],
  manuals:              ["master_admin", "admin", "manager", "staff"],
  checklists:           ["master_admin", "admin", "manager", "staff"],
  tasks:                ["master_admin", "admin", "manager", "staff"],
  contacts:             ["master_admin", "admin", "manager"],
  inventory:            ["master_admin", "admin", "manager"],
  laundry:              ["master_admin", "admin", "manager", "staff"],
  orders:               ["master_admin", "admin", "manager"],
  "meet-team":          ["master_admin", "admin", "manager", "principal"],
  travel:               ["master_admin", "admin", "principal"],
  calendar:             ["master_admin", "admin", "manager", "staff", "principal"],
  "master-import":      ["master_admin"],
  rules:                ["master_admin", "admin", "manager", "staff"],
  "car-wash":           ["master_admin", "admin", "manager", "staff", "principal"],
  timeline:             ["master_admin"],
  // Feature visibility — defaults to admin/manager only; staff must be granted explicitly
  "principal-location":   ["master_admin", "admin", "manager", "principal"],
  // Calendar sub-tab visibility
  "family-calendar":      ["master_admin", "admin", "manager", "principal"],
  "calendar-travel":      ["master_admin", "admin", "manager", "staff", "principal"],
  "calendar-birthdays":   ["master_admin", "admin", "manager", "staff", "principal"],
  "calendar-maintenance": ["master_admin", "admin", "manager", "staff"],
  "calendar-deliveries":  ["master_admin", "admin", "manager"],
  "calendar-construction":["master_admin", "admin", "manager"],
  "calendar-staff":       ["master_admin", "admin", "manager"],
  // Staff-schedule overlay: family travel/guest events on the monthly view
  "family-movements":     ["master_admin", "admin", "manager", "principal"],
};

// ── localStorage cache helpers ────────────────────────────────────────────────
const CACHE_VERSION = "v4";
const CACHE_TTL_MS  = 5 * 60 * 1000;

interface PermissionsCache {
  version: string;
  userId: string;
  role: AppRole | null;
  level: UserLevel | null;
  department: UserDepartment;
  assignedPropertyIds: string[];
  fullName: string | null;
  avatarUrl: string | null;
  sectionPermissions: Record<string, SectionPermEntry> | null;
  cachedAt: number;
}

function readCache(userId: string): PermissionsCache | null {
  try {
    const raw = localStorage.getItem(`ronin_perms_${userId}`);
    if (!raw) return null;
    const parsed: PermissionsCache = JSON.parse(raw);
    if (parsed.version !== CACHE_VERSION) return null;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(data: Omit<PermissionsCache, "version" | "cachedAt">) {
  try {
    localStorage.setItem(
      `ronin_perms_${data.userId}`,
      JSON.stringify({ ...data, version: CACHE_VERSION, cachedAt: Date.now() })
    );
  } catch { /* quota exceeded — silently skip */ }
}

function clearCache(userId?: string) {
  if (userId) {
    localStorage.removeItem(`ronin_perms_${userId}`);
  } else {
    Object.keys(localStorage)
      .filter(k => k.startsWith("ronin_perms_"))
      .forEach(k => localStorage.removeItem(k));
  }
}

// ── Permission builder ────────────────────────────────────────────────────────
const defaultPermissions: UserPermissions = {
  userId: null,
  role: null,
  level: null,
  department: null,
  assignedPropertyIds: [],
  isMasterAdmin: false,
  isAdmin: false,
  isManager: false,
  isFamily: false,
  fullName: null,
  avatarUrl: null,
  sectionPermissions: null,
  canSee: () => false,
  canEdit: () => false,
  wantsAlerts: () => false,
  loading: true,
  isPreviewing: false,
  realUserId: null,
  realIsMasterAdmin: false,
  previewName: null,
};

interface PermissionsControl {
  /** Enter preview mode — start viewing the app as `targetUserId`. Master admin only. */
  enterPreview: (targetUserId: string) => Promise<void>;
  /** Exit preview mode and restore the master admin's own view. */
  exitPreview: () => void;
}

const PermissionsContext = createContext<UserPermissions>(defaultPermissions);
const PermissionsControlContext = createContext<PermissionsControl>({
  enterPreview: async () => {},
  exitPreview: () => {},
});

function buildPermissions(
  userId: string | null,
  role: AppRole | null,
  level: UserLevel | null,
  department: UserDepartment,
  assignedPropertyIds: string[],
  fullName: string | null,
  avatarUrl: string | null,
  sectionPermissions: Record<string, SectionPermEntry> | null,
  loading: boolean,
  preview: { isPreviewing: boolean; realUserId: string | null; realIsMasterAdmin: boolean; previewName: string | null },
): UserPermissions {
  const isMasterAdmin = role === "master_admin";
  const isAdmin = role === "admin" || isMasterAdmin;
  const isManager = role === "manager" || isAdmin;
  const isFamily = level === "principal" || level === "extended_family";

  const SECTION_ALIASES: Record<string, string> = { vendors: "contacts" };

  const canSee = (section: string): boolean => {
    if (isMasterAdmin) return true;
    const key = SECTION_ALIASES[section] ?? section;
    if (sectionPermissions) {
      const perm = sectionPermissions[key] ?? sectionPermissions[section];
      if (perm !== undefined) return perm.view === true;
    }
    if (!role) return false;
    const allowed = SECTION_PERMISSIONS[section];
    if (!allowed) return false;
    return allowed.includes(role);
  };

  const canEdit = (section: string): boolean => {
    if (isMasterAdmin || isAdmin) return true;
    const key = SECTION_ALIASES[section] ?? section;
    if (!canSee(section)) return false;
    if (sectionPermissions) {
      const perm = sectionPermissions[key] ?? sectionPermissions[section];
      if (perm !== undefined) return perm.edit === true;
    }
    const managerEditSections = [
      "property", "maintenance", "tasks", "checklists", "manuals",
      "contacts", "inventory", "laundry", "orders", "calendar", "travel", "rules",
    ];
    return isManager && managerEditSections.includes(section);
  };

  const wantsAlerts = (section: string): boolean => {
    if (isMasterAdmin) return true;
    const key = SECTION_ALIASES[section] ?? section;
    if (!canSee(section)) return false;
    if (sectionPermissions) {
      const perm = sectionPermissions[key] ?? sectionPermissions[section];
      if (perm !== undefined) return perm.notifications === true;
    }
    return isAdmin || isManager;
  };

  return {
    userId,
    role,
    level,
    department,
    assignedPropertyIds,
    isMasterAdmin,
    isAdmin,
    isManager,
    isFamily,
    fullName,
    avatarUrl,
    sectionPermissions,
    canSee,
    canEdit,
    wantsAlerts,
    loading,
    ...preview,
  };
}

/**
 * Fetch the full permissions snapshot for a given user from the database.
 * Used both for the real signed-in user and for the previewed target user.
 */
async function fetchPermissionsSnapshot(userId: string) {
  const [{ data: roleRow }, { data: profile }, rowPermsResult] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles")
      .select("level, department, assigned_property_ids, full_name, avatar_url")
      .eq("id", userId).maybeSingle(),
    (supabase.from("user_section_permissions" as never)
      .select("section, can_view, can_edit, notifications, scope")
      .eq("user_id", userId)) as unknown as Promise<{
        data: { section: string; can_view: boolean; can_edit: boolean; notifications: boolean; scope: "own" | "department" | "all" | null }[] | null
      }>,
  ]);

  const role = (roleRow?.role as AppRole) ?? null;
  const level = (profile?.level as UserLevel) ?? null;
  const department = (profile?.department as UserDepartment) ?? null;
  const assignedPropertyIds = profile?.assigned_property_ids ?? [];
  const fullName = profile?.full_name ?? null;
  const avatarUrl = profile?.avatar_url ?? null;

  let sectionPermissions: Record<string, SectionPermEntry> | null = null;
  const rowPerms = rowPermsResult.data;
  if (rowPerms && rowPerms.length > 0) {
    sectionPermissions = {};
    for (const row of rowPerms) {
      sectionPermissions[row.section] = {
        view: row.can_view,
        edit: row.can_edit,
        notifications: row.notifications,
        ...(row.scope ? { scope: row.scope } : {}),
      };
    }
  }

  return { userId, role, level, department, assignedPropertyIds, fullName, avatarUrl, sectionPermissions };
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [perms, setPerms] = useState<UserPermissions>(defaultPermissions);

  // Real signed-in user snapshot (preserved across preview enter/exit).
  const realSnapshotRef = useRef<Awaited<ReturnType<typeof fetchPermissionsSnapshot>> | null>(null);
  const [previewState, setPreviewState] = useState<{ targetUserId: string; previewName: string | null } | null>(null);
  // Mirror previewState into a ref so the auth listener (registered once) always
  // reads the LATEST value — without this, a token refresh ~every 5 min would
  // overwrite the preview snapshot and "kick" the admin back to their own view.
  const previewStateRef = useRef<typeof previewState>(null);
  useEffect(() => { previewStateRef.current = previewState; }, [previewState]);

  // Apply a snapshot (real or previewed) to the context state.
  const applySnapshot = useCallback((
    snap: Awaited<ReturnType<typeof fetchPermissionsSnapshot>>,
    preview: { isPreviewing: boolean; realUserId: string | null; realIsMasterAdmin: boolean; previewName: string | null },
  ) => {
    setPerms(buildPermissions(
      snap.userId, snap.role, snap.level, snap.department,
      snap.assignedPropertyIds, snap.fullName, snap.avatarUrl,
      snap.sectionPermissions, false, preview,
    ));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(userId: string) {
      const isPreviewing = previewStateRef.current !== null;

      // Serve from cache immediately — but ONLY if we are not currently previewing,
      // otherwise we'd flash back to the admin's own view on every token refresh.
      const cached = readCache(userId);
      if (cached && !cancelled && !isPreviewing) {
        const snap = {
          userId: cached.userId, role: cached.role, level: cached.level, department: cached.department,
          assignedPropertyIds: cached.assignedPropertyIds, fullName: cached.fullName, avatarUrl: cached.avatarUrl,
          sectionPermissions: cached.sectionPermissions,
        };
        realSnapshotRef.current = snap;
        applySnapshot(snap, {
          isPreviewing: false, realUserId: userId,
          realIsMasterAdmin: snap.role === "master_admin", previewName: null,
        });
      } else if (cached && !cancelled && isPreviewing) {
        // Still update the underlying real snapshot so exitPreview() has fresh data.
        realSnapshotRef.current = {
          userId: cached.userId, role: cached.role, level: cached.level, department: cached.department,
          assignedPropertyIds: cached.assignedPropertyIds, fullName: cached.fullName, avatarUrl: cached.avatarUrl,
          sectionPermissions: cached.sectionPermissions,
        };
      }

      // Fetch fresh from DB
      const fresh = await fetchPermissionsSnapshot(userId);
      if (cancelled) return;

      writeCache(fresh);
      realSnapshotRef.current = fresh;

      // Re-check preview state AFTER the await — user may have entered/exited preview meanwhile.
      if (previewStateRef.current === null) {
        applySnapshot(fresh, {
          isPreviewing: false, realUserId: userId,
          realIsMasterAdmin: fresh.role === "master_admin", previewName: null,
        });
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        if (cancelled) return;
        clearCache();
        realSnapshotRef.current = null;
        setPreviewState(null);
        previewStateRef.current = null;
        setPerms({ ...defaultPermissions, loading: false });
        return;
      }
      // Skip benign token refreshes entirely while previewing — nothing about
      // the admin's permissions changed, and we don't want to disturb the view.
      if (event === "TOKEN_REFRESHED" && previewStateRef.current !== null) return;
      load(session.user.id);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !cancelled) load(session.user.id);
      else if (!session && !cancelled) setPerms({ ...defaultPermissions, loading: false });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Preview controls ─────────────────────────────────────────────────────
  // Remember the path the admin was on when entering preview so we can restore
  // it on exit (otherwise gated sections redirect to dashboard during preview
  // and the admin loses their place).
  const preEnterPathRef = useRef<string | null>(null);

  const enterPreview = useCallback(async (targetUserId: string) => {
    const real = realSnapshotRef.current;
    if (!real) return;
    if (real.role !== "master_admin") {
      console.warn("[Permissions] enterPreview blocked — only master admins can preview other users.");
      return;
    }
    if (targetUserId === real.userId) return;

    if (typeof window !== "undefined") {
      preEnterPathRef.current = window.location.pathname + window.location.search;
    }

    const target = await fetchPermissionsSnapshot(targetUserId);
    setPreviewState({ targetUserId, previewName: target.fullName ?? "User" });
    applySnapshot(target, {
      isPreviewing: true,
      realUserId: real.userId,
      realIsMasterAdmin: true,
      previewName: target.fullName ?? "User",
    });
  }, [applySnapshot]);

  const exitPreview = useCallback(() => {
    const real = realSnapshotRef.current;
    if (!real) return;
    setPreviewState(null);
    applySnapshot(real, {
      isPreviewing: false,
      realUserId: real.userId,
      realIsMasterAdmin: real.role === "master_admin",
      previewName: null,
    });
    // Restore the admin to the page they were on before entering preview.
    const target = preEnterPathRef.current;
    preEnterPathRef.current = null;
    if (target && typeof window !== "undefined" && window.location.pathname + window.location.search !== target) {
      window.history.pushState({}, "", target);
      // Notify react-router (BrowserRouter listens to popstate).
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [applySnapshot]);

  return (
    <PermissionsContext.Provider value={perms}>
      <PermissionsControlContext.Provider value={{ enterPreview, exitPreview }}>
        {children}
      </PermissionsControlContext.Provider>
    </PermissionsContext.Provider>
  );
}

/**
 * usePermissions — reads the (possibly previewed) permission snapshot.
 */
export function usePermissions(): UserPermissions {
  return useContext(PermissionsContext);
}

/**
 * usePermissionsControl — exposes enterPreview / exitPreview for master admins.
 */
export function usePermissionsControl(): PermissionsControl {
  return useContext(PermissionsControlContext);
}
