import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { houseScopedRecipients } from "../_shared/houseAccess.ts";
import { receiptAndPush, type ReceiptResult } from "../_shared/notificationReceipt.ts";

Deno.serve(async req => {
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return respond({ ok: true });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return respond({ error: "Missing configuration" }, 503);
    const authorization = req.headers.get("Authorization");
    if (!authorization) return respond({ error: "Unauthorized" }, 401);
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error } = await caller.auth.getUser();
    if (error || !user) return respond({ error: "Unauthorized" }, 401);
    const parsed = z.object({ id: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return respond({ error: "Invalid notification" }, 400);
    const admin = createClient(url, service);
    const result = await receiptAndPush(parsed.data.id, async id => {
      const { data, error } = await caller.rpc("acknowledge_notification_receipt", { _notification_id: id });
      if (error) throw new Error(error.message);
      const receipt = data as ReceiptResult;
      // The owner's via_entry response omits the entity fields; read the caller's
      // own original notification for the same record tap target.
      if (receipt.via_entry && receipt.notified && !receipt.entity_id) {
        const { data: original } = await caller.from("notifications").select("entity_type, entity_id")
          .eq("id", id).eq("user_id", user.id).maybeSingle();
        return { ...receipt, entity_type: original?.entity_type, entity_id: original?.entity_id };
      }
      return receipt;
    }, async (receipt, target) => {
      const { data: ids, error } = await admin.rpc("ids_with_login", { _ids: [receipt.sender_id] });
      if (error) throw error;
      if (!ids?.includes(receipt.sender_id)) return;
      if (!(await houseScopedRecipients(admin, [receipt.sender_id], { entityType: (receipt as any).entity_type ?? null, entityId: (receipt as any).entity_id ?? null, label: "acknowledge-notification" })).length) return;
      const pushed = await fetch(`${url}/functions/v1/send-push-notification`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${service}` },
        body: JSON.stringify({ recipientUserIds: [receipt.sender_id], title: receipt.title, body: receipt.body ?? "", url: target }),
      });
      if (!pushed.ok) throw new Error("Push dispatch failed");
    });
    return respond(result);
  } catch (error) { return respond({ error: error instanceof Error ? error.message : "Could not acknowledge notification" }, 400); }
});