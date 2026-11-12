export interface AcknowledgementFields {
  ack_required?: boolean;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  acknowledged_note?: string | null;
}
export interface AcknowledgementEntry extends AcknowledgementFields {
  id: string;
  property_id?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  reported_by?: string | null;
}
export interface AcknowledgementViewer {
  userId: string | null;
  role?: string | null;
  assignedPropertyIds?: string[];
}
export const acknowledgementColumns = "ack_required, acknowledged_at, acknowledged_by, acknowledged_note";
export const ENTRY_ACK_CHANGED = "entry-acknowledged";
export function canAcknowledgeEntry(entry: AcknowledgementEntry, viewer: AcknowledgementViewer) {
  const sender = entry.reported_by ?? entry.created_by;
  if (!viewer.userId || !sender || sender === viewer.userId) return false;
  return viewer.role === "master_admin" || viewer.role === "admin"
    || entry.assigned_to === viewer.userId
    || (viewer.role === "manager" && !!entry.property_id && !!viewer.assignedPropertyIds?.includes(entry.property_id));
}
export function needsAcknowledgement(entry: AcknowledgementFields) {
  return entry.ack_required === true && !entry.acknowledged_at;
}