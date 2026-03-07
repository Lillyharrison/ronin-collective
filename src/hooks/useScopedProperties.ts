import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

export interface PropertyOption {
  id: string;
  name: string;
  is_primary?: boolean;
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
      .order("sort_order")
      .then(({ data }) => {
        setAllProperties((data ?? []) as PropertyOption[]);
        setLoading(false);
      });
  }, []);

  const canSeeAll = isMasterAdmin || isAdmin || isManager;

  const properties: PropertyOption[] = canSeeAll
    ? allProperties
    : allProperties.filter(p => assignedPropertyIds.includes(p.id));

  return { properties, loading: loading || permLoading };
}
