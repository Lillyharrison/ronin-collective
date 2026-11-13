// House (property) scoping for every server-built alert audience.
// Principle: nobody may receive an alert about a house they are not assigned to
// (admins / master admins excepted, as user_can_access_property defines).

export type HouseCheck = (userId: string, propertyId: string) => Promise<boolean>;

/** Keep only recipients who can access every house the alert is about. No house → unchanged. Never throws. */
export async function filterRecipientsByHouse(
  recipients: string[], propertyIds: Array<string | null | undefined>, canAccess: HouseCheck,
): Promise<{ kept: string[]; dropped: number }> {
  const unique = [...new Set(recipients)];
  const houses = [...new Set(propertyIds.filter((p): p is string => typeof p === "string" && p.length > 0))];
  if (!houses.length) return { kept: unique, dropped: 0 };
  const kept: string[] = [];
  for (const uid of unique) {
    let ok = true;
    for (const h of houses) {
      try { if (!(await canAccess(uid, h))) { ok = false; break; } } catch { ok = false; break; }
    }
    if (ok) kept.push(uid);
  }
  return { kept, dropped: unique.length - kept.length };
}

/** Access check through the database rule user_can_access_property (service-role client). Errors deny. */
// deno-lint-ignore no-explicit-any
export function rpcHouseCheck(db: any): HouseCheck {
  return async (userId, propertyId) => {
    const { data, error } = await db.rpc("user_can_access_property", { _user_id: userId, _property_id: propertyId });
    return !error && data === true;
  };
}

const ENTITY_HOUSE: Record<string, [string, string]> = {
  maintenance_issue: ["maintenance_issues", "property_id"],
  repair: ["maintenance_issues", "property_id"],
  task: ["tasks", "property_id"],
  tasks: ["tasks", "property_id"],
  planned_maintenance: ["planned_maintenance", "property_id"],
  order: ["orders", "property_id"],
  calendar_event: ["calendar_events", "property_id"],
  car_wash_booking: ["car_wash_bookings", "location_property_id"],
  asset: ["assets", "current_property_id"],
  property: ["properties", "id"],
  shift: ["staff_shifts", "property_id"],
  staff_shift: ["staff_shifts", "property_id"],
  checklist_public_session: ["checklist_public_sessions", "property_id"],
  shopping_list_item: ["shopping_list_items", "property_id"],
  property_rule: ["property_rules", "property_id"],
};

/** House the alert's record belongs to, or null when unknown / not house-bound. */
// deno-lint-ignore no-explicit-any
export async function entityHouse(db: any, entityType?: string | null, entityId?: string | null): Promise<string | null> {
  if (!entityType || !entityId) return null;
  const map = ENTITY_HOUSE[entityType];
  if (!map) return null;
  try {
    const { data } = await db.from(map[0]).select(map[1]).eq("id", entityId).maybeSingle();
    return (data?.[map[1]] as string | null | undefined) ?? null;
  } catch { return null; }
}

/** Filter + log. Never fails the caller. */
// deno-lint-ignore no-explicit-any
export async function houseScopedRecipients(db: any, recipients: string[], where: {
  propertyId?: string | null; entityType?: string | null; entityId?: string | null; label: string;
}): Promise<string[]> {
  const derived = await entityHouse(db, where.entityType, where.entityId);
  const { kept, dropped } = await filterRecipientsByHouse(recipients, [where.propertyId, derived], rpcHouseCheck(db));
  if (dropped > 0) console.log(`[${where.label}] house scope dropped ${dropped} recipient(s)`);
  return kept;
}
