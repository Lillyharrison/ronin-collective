export interface ReceiptResult {
  acknowledged?: boolean;
  already_acknowledged?: boolean;
  notified?: boolean;
  sender_id?: string;
  title?: string;
  body?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  via_entry?: boolean;
}
export async function receiptAndPush(
  id: string,
  rpc: (id: string) => Promise<ReceiptResult>,
  push: (result: ReceiptResult, target: string) => Promise<void>,
) {
  const result = await rpc(id);
  if (!result.acknowledged && !result.already_acknowledged) throw new Error("Acknowledgement was not confirmed");
  let pushFailed = false;
  if (result.acknowledged && !result.already_acknowledged && result.notified && result.sender_id && result.title) {
    const kind = result.entity_type === "maintenance_issue" ? "repair" : result.entity_type === "task" ? "task" : null;
    const target = kind && result.entity_id ? `/?entryKind=${kind}&entryId=${encodeURIComponent(result.entity_id)}` : "/";
    try { await push(result, target); } catch { pushFailed = true; }
  }
  return { ...result, push_failed: pushFailed };
}