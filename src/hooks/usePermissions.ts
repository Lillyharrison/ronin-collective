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
  /** Returns true if the user has edit rights for the section */
  canEdit: (section: string) => boolean;
  /** Returns true if the user wants notifications/alerts for the section */
  wantsAlerts: (section: string) => boolean;
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
  checklists:      ["master_admin", "admin", "manager", "staff"],
  tasks:           ["master_admin", "admin", "manager", "staff"],
  contacts:        ["master_admin", "admin", "manager"],
  inventory:       ["master_admin", "admin", "manager"],
  laundry:         ["master_admin", "admin", "manager", "staff"],
  orders:          ["master_admin", "admin", "manager"],
  "meet-team":     ["master_admin", "admin", "manager", "principal"],
  travel:          ["master_admin", "admin", "principal"],
  calendar:        ["master_admin", "admin", "manager", "staff", "principal"],
  "master-import": ["master_admin"],
  rules:           ["master_admin", "admin", "manager", "staff"],
};

export function usePermissions(): UserPermissions {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [level, setLevel] = useState<UserLevel | null>(null);
  const [department, setDepartment] = useState<UserDepartment>(null);
  const [assignedPropertyIds, setAssignedPropertyIds] = useState<string[]>([]);
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sectionPermissions, setSectionPermissions] = useState<Record<string, { view: boolean; edit: boolean; notifications: boolean }> | null>(null);
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
        if (profile.section_permissions && typeof profile.section_permissions === "object") {
          const perms = profile.section_permissions as Record<string, unknown>;
          if (Object.keys(perms).length > 0) {
            setSectionPermissions(perms as Record<string, { view: boolean; edit: boolean; notifications: boolean }>);
          }
        }
      }
      setLoading(false);
    }

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
    if (isMasterAdmin) return true;
    if (sectionPermissions) {
      const perm = sectionPermissions[section];
      if (perm !== undefined) return perm.view === true;
    }
    if (!role) return false;
    const allowed = SECTION_PERMISSIONS[section];
    if (!allowed) return false;
    return allowed.includes(role);
  };

  /**
   * Returns true if the user may create/edit/delete items in this section.
   * master_admin/admin always can. Others need section_permissions[section].edit === true,
   * falling back to isManager for sections that historically always allowed manager edits.
   */
  const canEdit = (section: string): boolean => {
    if (isMasterAdmin || isAdmin) return true;
    // Must be able to see the section first
    if (!canSee(section)) return false;
    // If custom permissions are set, honour them
    if (sectionPermissions) {
      const perm = sectionPermissions[section];
      if (perm !== undefined) return perm.edit === true;
    }
    // Fallback: managers can edit operational sections
    const managerEditSections = [
      "property", "maintenance", "tasks", "checklists", "manuals",
      "contacts", "inventory", "laundry", "orders", "calendar", "travel", "rules",
    ];
    return isManager && managerEditSections.includes(section);
  };

  /**
   * Returns true if the user wants to receive notifications/alerts for this section.
   * master_admin always gets all alerts.
   */
  const wantsAlerts = (section: string): boolean => {
    if (isMasterAdmin) return true;
    if (!canSee(section)) return false;
    if (sectionPermissions) {
      const perm = sectionPermissions[section];
      if (perm !== undefined) return perm.notifications === true;
    }
    // Fallback: admins & managers get alerts by default
    return isAdmin || isManager;
  };

  return { userId, role, level, department, assignedPropertyIds, isMasterAdmin, isAdmin, isManager, isFamily, fullName, avatarUrl, canSee, canEdit, wantsAlerts, loading };
}
