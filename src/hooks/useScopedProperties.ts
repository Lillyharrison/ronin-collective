import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

export interface PropertyOption {
  id: string;
  name: string;
  is_primary?: boolean;
}

/**
 * sortProperties — primary residence always first, then alphabetical.
 * Safe to call on any array of objects with `name` and optional `is_primary`.
 */
export function sortProperties<T extends { name: string; is_primary?: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Returns only the properties the current user is allowed to see:
 * - master_admin / admin / manager → all properties
 * - staff / principal / family → only their assigned_property_ids
 */
export function useScopedProperties() {
  const { isMasterAdmin, isAdmin, isManager, assignedPropertyIds, loading: permLoading } = usePermissions();
  const [allProperties, setAllProperties] = useState<PropertyOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("properties")
      .select("id, name, is_primary")
      .then(({ data }) => {
        setAllProperties(sortProperties((data ?? []) as PropertyOption[]));
        setLoading(false);
      });
  }, []);

  const canSeeAll = isMasterAdmin || isAdmin || isManager;

  const properties: PropertyOption[] = canSeeAll
    ? allProperties
    : allProperties.filter(p => assignedPropertyIds.includes(p.id));

  return { properties, loading: loading || permLoading };
}
