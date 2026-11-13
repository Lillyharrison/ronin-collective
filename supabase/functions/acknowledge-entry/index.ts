import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { houseScopedRecipients } from "../_shared/houseAccess.ts";
import { acknowledgeAndPush, type AcknowledgementResult } from "../_shared/acknowledgeEntry.ts";

Deno.serve(async req => {
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return respond({ error: "Missing configuration" }, 503);
    const authorization = req.headers.get("Authorization");
    if (!authorization) return respond({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return respond({ error: "Unauthorized" }, 401);
    const parsed = z.object({ kind: z.enum(["repair", "task"]), id: z.string().uuid(), note: z.string().trim().max(1000).nullable().optional() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return respond({ error: "Invalid entry or note" }, 400);
    const admin = createClient(url, service);
    const { kind, id, note } = parsed.data;
    const result = await acknowledgeAndPush(kind, id, note || null, async (_kind, _id, _note) => {
      // Caller JWT is essential: the existing RPC alone authorizes and persists acknowledgement.
      const { data, error: rpcError } = await userClient.rpc("acknowledge_entry", { _kind, _id, _note });
      if (rpcError) throw new Error(rpcError.message);
      return data as AcknowledgementResult;
    }, async (result, target) => {
      const { data: ids, error: loginError } = await admin.rpc("ids_with_login", { _ids: [result.sender_id] });
      if (loginError) throw loginError;
      if (!ids?.includes(result.sender_id)) return;
      if (!(await houseScopedRecipients(admin, [result.sender_id], { entityType: kind === "repair" ? "maintenance_issue" : "task", entityId: id, label: "acknowledge-entry" })).length) return;
      const response = await fetch(`${url}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${service}` },
        body: JSON.stringify({ recipientUserIds: [result.sender_id], title: result.title, body: result.body ?? "", url: target }),
      });
      if (!response.ok) throw new Error("Push dispatch failed");
    });
    return respond(result);
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "Could not acknowledge entry" }, 400);
  }
});