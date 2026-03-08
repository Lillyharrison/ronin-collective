/**
 * usePermissions — thin re-export from PermissionsContext.
 *
 * All DB fetching now happens ONCE in PermissionsProvider (mounted in App.tsx).
 * This hook simply reads the shared context value — zero extra DB calls.
 *
 * All existing import sites (`import { usePermissions } from "@/hooks/usePermissions"`)
 * continue to work unchanged.
 */
export {
  usePermissions,
  type UserPermissions,
  type UserLevel,
  type UserDepartment,
  type AppRole,
} from "@/contexts/PermissionsContext";
