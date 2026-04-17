import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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
// WhatsApp-style: serve cached data immediately, revalidate in background.
// The cache is keyed by userId so switching accounts works correctly.
const CACHE_VERSION = "v2";
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 min — fresh enough, avoids stale role issues

interface PermissionsCache {
  version: string;
  userId: string;
  role: AppRole | null;
  level: UserLevel | null;
  department: UserDepartment;
  assignedPropertyIds: string[];
  fullName: string | null;
  avatarUrl: string | null;
  sectionPermissions: Record<string, { view: boolean; edit: boolean; notifications: boolean }> | null;
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
    // Clear any ronin_perms_* keys
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
};

const PermissionsContext = createContext<UserPermissions>(defaultPermissions);

function buildPermissions(
  userId: string | null,
  role: AppRole | null,
  level: UserLevel | null,
  department: UserDepartment,
  assignedPropertyIds: string[],
  fullName: string | null,
  avatarUrl: string | null,
  sectionPermissions: Record<string, { view: boolean; edit: boolean; notifications: boolean }> | null,
  loading: boolean,
): UserPermissions {
  const isMasterAdmin = role === "master_admin";
  const isAdmin = role === "admin" || isMasterAdmin;
  const isManager = role === "manager" || isAdmin;
  const isFamily = level === "principal" || level === "extended_family";

  // "vendors" section is displayed as "contacts" in permissions UI
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
  };
}

/**
 * PermissionsProvider — stale-while-revalidate strategy.
 *
 * 1. On mount: immediately serve cached permissions (loading = false instantly)
 *    so the rest of the app can render without waiting for DB.
 * 2. In parallel: fetch fresh data from DB and update cache + context.
 *
 * This is exactly how WhatsApp / Telegram show their UI instantly — they paint
 * from local state while network data rehydrates silently behind the scenes.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [perms, setPerms] = useState<UserPermissions>(defaultPermissions);

  useEffect(() => {
    let cancelled = false;

    async function load(userId: string) {
      // ── 1. Serve from cache immediately (zero network latency) ───────────
      const cached = readCache(userId);
      if (cached && !cancelled) {
        setPerms(buildPermissions(
          cached.userId, cached.role, cached.level, cached.department,
          cached.assignedPropertyIds, cached.fullName, cached.avatarUrl,
          cached.sectionPermissions, false, // loading = false — use cache now
        ));
      }

      // ── 2. Fetch fresh from DB (3 queries in one round-trip) ─────────────
      // SOURCE OF TRUTH: user_section_permissions table.
      // The profiles.section_permissions JSONB still exists for backwards
      // compat (older code reads it), but we DO NOT fall back to it here —
      // doing so caused silent drift when the admin UI saved to JSONB only.
      // The admin UI now writes to BOTH places; this reader trusts only the table.
      const [{ data: roleRow }, { data: profile }, rowPermsResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles")
          .select("level, department, assigned_property_ids, full_name, avatar_url")
          .eq("id", userId).maybeSingle(),
        (supabase.from("user_section_permissions" as never)
          .select("section, can_view, can_edit, notifications")
          .eq("user_id", userId)) as unknown as Promise<{
            data: { section: string; can_view: boolean; can_edit: boolean; notifications: boolean }[] | null
          }>,
      ]);

      if (cancelled) return;

      const role = (roleRow?.role as AppRole) ?? null;
      const level = (profile?.level as UserLevel) ?? null;
      const department = (profile?.department as UserDepartment) ?? null;
      const assignedPropertyIds = profile?.assigned_property_ids ?? [];
      const fullName = profile?.full_name ?? null;
      const avatarUrl = profile?.avatar_url ?? null;

      let sectionPermissions: Record<string, { view: boolean; edit: boolean; notifications: boolean }> | null = null;
      const rowPerms = rowPermsResult.data;
      if (rowPerms && rowPerms.length > 0) {
        sectionPermissions = {};
        for (const row of rowPerms) {
          sectionPermissions[row.section] = { view: row.can_view, edit: row.can_edit, notifications: row.notifications };
        }
      }
      // No JSONB fallback — if the table has no rows, we use the role-based default matrix below.

      // ── 3. Write back to cache ─────────────────────────────────────────────
      writeCache({ userId, role, level, department, assignedPropertyIds, fullName, avatarUrl, sectionPermissions });

      // ── 4. Update context with fresh data ─────────────────────────────────
      setPerms(buildPermissions(
        userId, role, level, department, assignedPropertyIds,
        fullName, avatarUrl, sectionPermissions, false,
      ));
    }

    // Wire up auth — use onAuthStateChange as single source of truth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        if (cancelled) return;
        clearCache();
        setPerms({ ...defaultPermissions, loading: false });
      } else {
        load(session.user.id);
      }
    });

    // Also trigger on mount for users already signed in (getSession is local/cached)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !cancelled) load(session.user.id);
      else if (!session && !cancelled) setPerms({ ...defaultPermissions, loading: false });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <PermissionsContext.Provider value={perms}>
      {children}
    </PermissionsContext.Provider>
  );
}

/**
 * usePermissions — reads from PermissionsContext.
 * Zero DB calls; data is fetched once by PermissionsProvider at the app root.
 */
export function usePermissions(): UserPermissions {
  return useContext(PermissionsContext);
}
