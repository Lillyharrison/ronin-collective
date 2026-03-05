import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UserLevel = "principal" | "extended_family" | "manager" | "staff";
export type UserDepartment = "exterior" | "interior" | "kitchen" | "security" | "office" | null;
export type AppRole = "master_admin" | "admin" | "manager" | "staff" | "principal";

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
  canSee: (section: string) => boolean;
  loading: boolean;
}

// Fallback permission matrix: which sections each role can access
const SECTION_PERMISSIONS: Record<string, AppRole[]> = {
  dashboard:       ["master_admin", "admin", "manager", "staff", "principal"],
  property:        ["master_admin", "admin", "manager", "principal"],
  maintenance:     ["master_admin", "admin", "manager", "staff"],
  messages:        ["master_admin", "admin", "manager", "staff", "principal"],
  profile:         ["master_admin", "admin", "manager", "staff", "principal"],
  achievements:    ["master_admin", "admin", "manager", "staff", "principal"],
  manuals:         ["master_admin", "admin", "manager", "staff"],
  tasks:           ["master_admin", "admin", "manager", "staff"],
  contacts:        ["master_admin", "admin", "manager"],
  inventory:       ["master_admin", "admin", "manager"],
  laundry:         ["master_admin", "admin", "manager", "staff"],
  orders:          ["master_admin", "admin", "manager"],
  "meet-team":     ["master_admin", "admin", "manager", "principal"],
  travel:          ["master_admin", "admin", "principal"],
  calendar:        ["master_admin", "admin", "manager", "staff", "principal"],
  "master-import": ["master_admin"],
};

export function usePermissions(): UserPermissions {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [level, setLevel] = useState<UserLevel | null>(null);
  const [department, setDepartment] = useState<UserDepartment>(null);
  const [assignedPropertyIds, setAssignedPropertyIds] = useState<string[]>([]);
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sectionPermissions, setSectionPermissions] = useState<Record<string, { view: boolean }> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const [{ data: roleRow }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("level, department, assigned_property_ids, full_name, avatar_url, section_permissions").eq("id", user.id).maybeSingle(),
      ]);

      if (roleRow) setRole(roleRow.role as AppRole);
      if (profile) {
        setLevel((profile.level as UserLevel) || null);
        setDepartment((profile.department as UserDepartment) || null);
        setAssignedPropertyIds(profile.assigned_property_ids || []);
        setFullName(profile.full_name || null);
        setAvatarUrl(profile.avatar_url || null);
        // Load section_permissions if present and non-empty
        if (profile.section_permissions && typeof profile.section_permissions === "object") {
          const perms = profile.section_permissions as Record<string, unknown>;
          if (Object.keys(perms).length > 0) {
            setSectionPermissions(perms as Record<string, { view: boolean }>);
          }
        }
      }
      setLoading(false);
    }

    // Load on mount and whenever auth state changes (e.g. different user logs in)
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      load();
    });
    return () => subscription.unsubscribe();
  }, []);

  const isMasterAdmin = role === "master_admin";
  const isAdmin = role === "admin" || isMasterAdmin;
  const isManager = role === "manager" || isAdmin;
  const isFamily = level === "principal" || level === "extended_family";

  const canSee = (section: string): boolean => {
    // master_admin always sees everything
    if (isMasterAdmin) return true;

    // If the user has custom section_permissions JSONB, use that as source of truth
    if (sectionPermissions) {
      const perm = sectionPermissions[section];
      if (perm !== undefined) {
        return (perm as { view: boolean }).view === true;
      }
      // Section not in their permissions map → deny
      return false;
    }

    // Fallback: use the role-based matrix
    if (!role) return false;
    const allowed = SECTION_PERMISSIONS[section];
    if (!allowed) return isMasterAdmin;
    return allowed.includes(role);
  };

  return { userId, role, level, department, assignedPropertyIds, isMasterAdmin, isAdmin, isManager, isFamily, fullName, avatarUrl, canSee, loading };
}
