// Turns a housekeeper's ticked order list into one Order + one task per
// recipient + in-app/push notifications, then clears the draft.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { template_id, note } = await req.json();
    if (typeof template_id !== "string" || template_id.length > 64) return json({ error: "template_id required" }, 400);
    if (note != null && (typeof note !== "string" || note.length > 2000)) return json({ error: "Invalid note" }, 400);

    // Read through the user's client so visibility rules apply.
    const { data: tpl } = await userClient
      .from("checklist_templates")
      .select("id, title, property_id, kind, order_recipient_ids")
      .eq("id", template_id).maybeSingle();
    if (!tpl || tpl.kind !== "order_list") return json({ error: "List not found" }, 404);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: lines } = await admin
      .from("order_list_draft_lines")
      .select("id, library_item_id, quantity, comment, photo_url")
      .eq("template_id", template_id);
    if (!lines || lines.length === 0) return json({ error: "Nothing ticked" }, 400);

    const recipients: string[] = (tpl.order_recipient_ids ?? []).filter(Boolean);
    if (recipients.length === 0) return json({ error: "No recipients set for this list" }, 400);

    const { data: lib } = await admin
      .from("order_library_items")
      .select("id, name, size, website_url, image_url")
      .in("id", lines.map((l) => l.library_item_id));
    const libMap = new Map((lib ?? []).map((l) => [l.id, l]));

    const { data: prop } = tpl.property_id
      ? await admin.from("properties").select("name").eq("id", tpl.property_id).maybeSingle()
      : { data: null };
    const { data: sender } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const propName = prop?.name ?? "";
    const senderName = sender?.full_name ?? "Someone";

    const snapshot = lines.map((l) => {
      const li = libMap.get(l.library_item_id);
      return {
        library_item_id: l.library_item_id,
        name: li?.name ?? "Item",
        size: li?.size ?? null,
        website_url: li?.website_url ?? null,
        image_url: li?.image_url ?? null,
        quantity: l.quantity, comment: l.comment, photo_url: l.photo_url,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const text = snapshot.map((s) => {
      let row = `• ${s.name}${s.size ? ` (${s.size})` : ""}${s.quantity ? ` × ${s.quantity}` : ""}`;
      if (s.comment) row += `\n   ↳ ${s.comment}`;
      if (s.photo_url) row += `\n   📷 ${s.photo_url}`;
      if (s.website_url) row += `\n   🔗 ${s.website_url}`;
      return row;
    }).join("\n");

    const title = `${tpl.title}${propName ? ` — ${propName}` : ""}`;
    const description = `Requested by ${senderName}. ${snapshot.length} item${snapshot.length === 1 ? "" : "s"}.${note ? `\nNote: ${note}` : ""}`;

    const { data: order, error: orderErr } = await admin.from("orders").insert({
      title, description, property_id: tpl.property_id, status: "not_placed",
      packing_list: text, notes: note ?? null, created_by: user.id, assigned_to: recipients[0],
    }).select("id").single();
    if (orderErr || !order) return json({ error: orderErr?.message ?? "Order failed" }, 500);

    const rollback = async (taskIds: string[]) => {
      if (taskIds.length) await admin.from("tasks").delete().in("id", taskIds);
      await admin.from("orders").delete().eq("id", order.id);
    };

    const { data: tasks, error: taskErr } = await admin.from("tasks").insert(recipients.map((rid) => ({
      title_en: `Place order: ${title}`,
      description_en: `${description}\n\n${text}\n\nFind it in Orders & Deliveries.`,
      status: "pending", priority: 2, assigned_to: rid, property_id: tpl.property_id,
      created_by: user.id, category: "orders", is_draft: false, ai_suggested: false,
      attachments: [], linked_inventory_ids: [],
    }))).select("id, assigned_to");
    if (taskErr || !tasks) { await rollback([]); return json({ error: taskErr?.message ?? "Task failed" }, 500); }

    await admin.from("orders").update({ source_task_id: tasks[0].id }).eq("id", order.id);

    const { error: subErr } = await admin.from("order_list_submissions").insert({
      template_id, property_id: tpl.property_id, submitted_by: user.id, lines: snapshot, order_id: order.id,
    });
    if (subErr) { await rollback(tasks.map((t) => t.id)); return json({ error: subErr.message }, 500); }

    await admin.from("order_list_draft_lines").delete().eq("template_id", template_id);

    const notifTitle = `🛒 Order request: ${title}`;
    const notifBody = `${senderName} ticked ${snapshot.length} item${snapshot.length === 1 ? "" : "s"} to order.`;
    await admin.from("notifications").insert(tasks.map((t) => ({
      user_id: t.assigned_to, title: notifTitle, body: notifBody, type: "info",
      action_url: "tasks", entity_id: t.id, entity_type: "task", property_id: tpl.property_id,
    })));
    try {
      await admin.functions.invoke("send-push-notification", {
        body: { recipientUserIds: recipients, title: notifTitle, body: notifBody, url: "tasks" },
      });
    } catch (e) { console.error("[order-list-submit] push failed", e); }

    return json({ ok: true, order_id: order.id, count: snapshot.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
