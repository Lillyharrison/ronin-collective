import { notifySection, notifyUsers } from "./notifySection";

interface RepairNotice {
  id: string; title: string; assigned_to?: string | null; property_id?: string | null; location_detail?: string | null;
}

export async function notifyRepairCreated(issue: RepairNotice, actorId: string) {
  const payload = {
    body: issue.location_detail ? `Location: ${issue.location_detail}` : undefined,
    action_url: "maintenance", entity_id: issue.id, entity_type: "maintenance_issue",
    property_id: issue.property_id ?? undefined,
  };
  await notifySection("maintenance-repairs", {
    ...payload, title: `🔧 New issue reported: ${issue.title}`, type: "warning",
  }, actorId, { excludeUserIds: issue.assigned_to ? [issue.assigned_to] : [] });
  if (issue.assigned_to && issue.assigned_to !== actorId) {
    await notifyUsers([issue.assigned_to], {
      ...payload, title: `🔧 You've been assigned a repair: ${issue.title}`, type: "info",
    }, actorId);
  }
}

interface PlannedNotice {
  id: string; title: string; assigned_to: string | null; property_id: string | null;
  date_type: string; scheduled_date: string | null; scheduled_time: string | null;
  scheduled_month: number | null; scheduled_year: number | null;
}

export function isNewBooking(previous: PlannedNotice | null, current: PlannedNotice): boolean {
  return current.date_type === "specific" && Boolean(current.scheduled_date)
    && (!previous || previous.scheduled_date !== current.scheduled_date);
}

export async function notifyPlannedSaved(previous: PlannedNotice | null, current: PlannedNotice, actorId: string, propertyName?: string) {
  const booked = isNewBooking(previous, current);
  const dateLabel = current.date_type === "specific" && current.scheduled_date
    ? new Date(`${current.scheduled_date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : current.scheduled_month && current.scheduled_year
      ? `${new Date(Date.UTC(current.scheduled_year, current.scheduled_month - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })} (date TBC)` : undefined;
  const payload = {
    body: [dateLabel ? `Scheduled: ${dateLabel}${current.scheduled_time ? ` at ${current.scheduled_time.slice(0, 5)}` : ""}` : undefined, propertyName ? `Property: ${propertyName}` : undefined].filter(Boolean).join(" · ") || undefined,
    type: "info", action_url: "maintenance", entity_id: current.id,
    entity_type: "planned_maintenance", property_id: current.property_id ?? undefined,
  };
  if (booked) {
    await notifySection("maintenance-planned", { ...payload, title: `🔧 Booked: ${current.title}` }, actorId,
      { excludeUserIds: current.assigned_to ? [current.assigned_to] : [] });
  }
  if (current.assigned_to && current.assigned_to !== actorId && (booked || !previous || previous.assigned_to !== current.assigned_to)) {
    await notifyUsers([current.assigned_to], { ...payload, title: `🔧 You've been assigned planned maintenance: ${current.title}` }, actorId);
  }
}