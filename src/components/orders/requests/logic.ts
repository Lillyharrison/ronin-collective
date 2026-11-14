import { dateInputToPlainDate, plainDateToLocal, localDateKey } from '@/lib/calendarTime';

export type RequestStatus = 'draft' | 'requested' | 'ordered' | 'received' | 'cancelled';
export interface HouseRequest {
  id: string; name: string; category: string; quantity: string | null; notes: string | null;
  property_id: string; created_by: string | null; library_item_id: string | null;
  photo_url: string | null; urgent: boolean; status: RequestStatus; order_id: string | null;
  created_at: string; ordered_at: string | null; received_at: string | null; received_by: string | null;
  batch_id?: string | null; sent_at?: string | null;
}
export interface RequestLibraryItem {
  id: string; name: string; category: string; image_url: string | null; size: string | null;
  default_quantity: string | null; notes?: string | null;
}
export const managementView = (role: string | null) => ['admin', 'master_admin', 'manager'].includes(role ?? '');
export const validRequest = (name: string, photo: unknown) => !!name.trim() || !!photo;
export const requestPhotoPath = () => `order-requests/${crypto.randomUUID()}.jpg`;
export function requestPayload(input: {
  houseId: string; userId: string; name: string; quantity: number; notes: string; urgent?: boolean;
  photoUrl?: string | null; libraryItem?: RequestLibraryItem | null;
}) {
  if (!input.houseId || !input.userId) throw new Error('A house and signed-in person are required');
  if (!validRequest(input.name, input.photoUrl)) throw new Error('Photo or text required');
  return {
    name: input.name.trim() || 'Photo request', category: input.libraryItem?.category ?? 'other',
    property_id: input.houseId, created_by: input.userId, quantity: String(Math.max(1, input.quantity)),
    notes: input.notes.trim() || null, urgent: input.urgent ?? false, photo_url: input.photoUrl ?? null,
    library_item_id: input.libraryItem?.id ?? null,
  };
}
export const defaultQuantity = (value: string | null) => /^\d+$/.test(value?.trim() ?? '') && Number(value) > 0 ? Number(value) : 1;
export const canChangeRequest = (row: HouseRequest, uid: string | null) => ['draft','requested'].includes(row.status) && !!uid && row.created_by === uid;
export const ownDrafts = (rows: HouseRequest[], house: string, uid: string) => rows.filter(r => r.property_id === house && r.created_by === uid && r.status === 'draft');
export function requestCounts(rows: HouseRequest[], house: string, uid: string) {
  const scoped = rows.filter(r => r.property_id === house);
  const requested = scoped.filter(r => r.status === 'requested').length, ordered = scoped.filter(r => r.status === 'ordered').length;
  return { draft: ownDrafts(scoped,house,uid).length, requested, ordered, way: requested + ordered };
}
export const addedQuantity = (rows: HouseRequest[], house: string, item: string, uid: string) => ownDrafts(rows,house,uid).filter(r => r.library_item_id === item).reduce((n, r) => n + defaultQuantity(r.quantity), 0);
export const sendListArgs = (house: string, ids?: string[]) => ids ? { _property_id: house, _ids: ids } : { _property_id: house };
export function byBatch(rows: HouseRequest[]) {
  const groups = new Map<string, HouseRequest[]>();
  for (const row of rows.filter(r => r.status === 'requested')) {
    const key = row.batch_id ?? row.id; groups.set(key,[...(groups.get(key) ?? []),row]);
  }
  return [...groups.entries()].sort((a,b) => Number(b[1].some(r=>r.urgent))-Number(a[1].some(r=>r.urgent)) || (a[1][0].sent_at ?? a[1][0].created_at).localeCompare(b[1][0].sent_at ?? b[1][0].created_at));
}
export const arrivalGroups = (rows: HouseRequest[]) => [...byBatch(rows).map(([id,lines])=>({id:`batch:${id}`,sent:true,rows:lines})), ...byOrder(rows).map(([id,lines])=>({id,sent:false,rows:lines}))];
export const displaySentDate = (stamp: string, es: boolean) => displayDelivery(localDateKey(new Date(stamp)),es);
export const urgentFirst = (rows: HouseRequest[]) => [...rows].sort((a,b) => Number(b.urgent) - Number(a.urgent) || a.created_at.localeCompare(b.created_at));
export function byOrder(rows: HouseRequest[]) {
  const groups = new Map<string, HouseRequest[]>();
  for (const row of rows.filter(r => r.status === 'ordered')) {
    const key = row.order_id ?? 'unlinked'; groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}
export function toggleQueueSelection(selected: string[], row: HouseRequest, rows: HouseRequest[]) {
  if (selected.includes(row.id)) return selected.filter(id => id !== row.id);
  const house = rows.find(r => selected.includes(r.id))?.property_id;
  return house && house !== row.property_id ? [row.id] : [...selected, row.id];
}
export function createOrderArgs(ids: string[], rows: HouseRequest[], delivery: string) {
  const picked = rows.filter(r => ids.includes(r.id) && r.status === 'requested');
  if (!picked.length || picked.length !== ids.length || new Set(picked.map(r => r.property_id)).size !== 1) throw new Error('Select requests from one house');
  return { _ids: ids, _expected_delivery: dateInputToPlainDate(delivery), _title: null };
}
export function orderNotificationPath(type: string | null, id: string | null, manager: boolean, house?: string | null) {
  const q = new URLSearchParams();
  if (type === 'order_request') { q.set('view', manager ? 'requests' : 'way'); if (manager && id) q.set('batch',id); }
  else if (type === 'order') { if (id) q.set('order', id); if (!manager) q.set('view', 'way'); }
  else return null;
  if (house) q.set('house', house);
  return `/orders?${q}`;
}
export const displayDelivery = (date: string, es: boolean) => plainDateToLocal(date).toLocaleDateString(es ? 'es-ES' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
export function compressedDimensions(width: number, height: number) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export async function compressRequestPhoto(file: File): Promise<Blob> {
  // Decode via the browser (orientation is honoured); never send the original oversized file.
  const image = await createImageBitmap(file);
  try {
    const size = compressedDimensions(image.width, image.height);
    const canvas = document.createElement('canvas'); Object.assign(canvas, size);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Photo could not be prepared');
    ctx.drawImage(image, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Photo could not be prepared')), 'image/jpeg', 0.8));
  } finally { image.close(); }
}
