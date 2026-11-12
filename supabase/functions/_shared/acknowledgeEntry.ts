export interface AcknowledgementResult {
  acknowledged?: boolean;
  already_acknowledged?: boolean;
  sender_id?: string;
  title?: string;
  body?: string;
  acknowledged_by_name?: string;
}
/** Only the winning atomic RPC call dispatches push; the RPC owns the in-app notice. */
export async function acknowledgeAndPush(
  kind: "repair" | "task", id: string, note: string | null,
  rpc: (kind: string, id: string, note: string | null) => Promise<AcknowledgementResult>,
  push: (result: AcknowledgementResult, url: string) => Promise<void>,
) {
  const result = await rpc(kind, id, note);
  if (!result.acknowledged && !result.already_acknowledged) throw new Error("Acknowledgement was not confirmed");
  let pushFailed = false;
  if (result.acknowledged && !result.already_acknowledged && result.sender_id && result.title) {
    try {
      await push(result, `/?entryKind=${kind}&entryId=${encodeURIComponent(id)}`);
    } catch {
      pushFailed = true;
    }
  }
  return { ...result, push_failed: pushFailed };
}