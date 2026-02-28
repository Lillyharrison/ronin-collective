import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Service-role client — full DB access for the agent
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth — identify the calling user
    const authHeader = req.headers.get("Authorization");
    let callerUserId: string | null = null;
    let callerProfile: Record<string, unknown> | null = null;
    let callerProperties: string[] = [];
    let callerRole: string = "staff";

    if (authHeader?.startsWith("Bearer ")) {
      const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anonClient.auth.getUser();
      if (user) {
        callerUserId = user.id;
        const { data: profile } = await adminClient
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (profile) {
          callerProfile = profile;
          callerProperties = (profile.assigned_property_ids as string[]) ?? [];
        }
        const { data: roleRow } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();
        if (roleRow) callerRole = roleRow.role;
      }
    }

    const body = await req.json();
    const { type, content, thread_id, csv_content, property_id } = body;

    // ─── SYSTEM PROMPT ────────────────────────────────────────────────────────
    const systemPrompt = `You are Ronin AI, the intelligent operations backbone for Ronin Collective — a luxury estate management platform.

CALLER CONTEXT:
- User ID: ${callerUserId ?? "anonymous"}
- Name: ${(callerProfile?.full_name as string) ?? "Unknown"}
- Role: ${callerRole}
- Assigned property IDs: ${callerProperties.length ? callerProperties.join(", ") : "none"}
- Active property context: ${property_id ?? "none"}

YOUR CAPABILITIES:
- You have read/write access to all estate data: tasks, properties, assets, manuals, messages, user stats, system events.
- You enforce permission boundaries: staff only see their assigned properties; admins see all.
- You respond in the same language the user writes in (English or Spanish).
- You are concise, professional, and proactive.

RULES:
- Never reveal other users' personal data to non-admins.
- Always confirm destructive operations before executing.
- When creating tasks, always set created_by to the calling user's ID unless told otherwise.`;

    // ─── CSV IMPORT MODE ───────────────────────────────────────────────────────
    if (type === "csv_import") {
      if (!["master_admin", "admin"].includes(callerRole)) {
        return new Response(JSON.stringify({ error: "Insufficient permissions for import" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ask the AI to parse CSV rows into structured task objects
      const parsePrompt = `You are a data parser. Parse this CSV content into a JSON array of task objects.
Each row should produce: { title_en, description_en, category (one of: housekeeping, maintenance, general), priority (1=urgent,2=normal,3=low), property_hint (name or id hint from the data) }
Only return valid JSON array, nothing else.

CSV:
${csv_content}`;

      const parseResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [{ role: "user", content: parsePrompt }],
          temperature: 0.1,
        }),
      });

      if (!parseResponse.ok) {
        const errText = await parseResponse.text();
        throw new Error(`AI parse failed: ${parseResponse.status} ${errText}`);
      }

      const parseData = await parseResponse.json();
      let rawJson = parseData.choices?.[0]?.message?.content ?? "[]";
      // Strip markdown code fences if present
      rawJson = rawJson.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

      let parsedTasks: Array<{
        title_en: string;
        description_en?: string;
        category?: string;
        priority?: number;
        property_hint?: string;
      }> = [];

      try {
        parsedTasks = JSON.parse(rawJson);
      } catch {
        throw new Error("AI returned invalid JSON for CSV parse");
      }

      // Fetch properties so we can match hints
      const { data: allProperties } = await adminClient.from("properties").select("id, name");
      const propertyMap: Record<string, string> = {};
      (allProperties ?? []).forEach((p: { id: string; name: string }) => {
        propertyMap[p.name.toLowerCase()] = p.id;
      });

      // Resolve property_id for each task
      const resolvedPropertyId = property_id ?? null;

      const taskRows = parsedTasks.map((t) => {
        let resolvedPropId: string | null = resolvedPropertyId;
        if (!resolvedPropId && t.property_hint) {
          const hint = t.property_hint.toLowerCase();
          for (const [name, id] of Object.entries(propertyMap)) {
            if (name.includes(hint) || hint.includes(name)) {
              resolvedPropId = id;
              break;
            }
          }
        }
        return {
          title_en: t.title_en,
          description_en: t.description_en ?? null,
          category: t.category ?? "general",
          priority: t.priority ?? 2,
          property_id: resolvedPropId,
          status: "pending" as const,
          created_by: callerUserId!,
        };
      });

      const { data: inserted, error: insertError } = await adminClient
        .from("tasks")
        .insert(taskRows)
        .select("id");

      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

      const taskCount = inserted?.length ?? 0;

      // Post a summary message to the property chat thread if thread_id provided
      if (thread_id) {
        const summaryMsg = `🤖 **Ronin AI** — I have processed the new import. **${taskCount} new tasks** have been added across the relevant properties. All tasks are now visible in the Tasks section.`;
        await adminClient.from("messages").insert({
          thread_id,
          content_text: summaryMsg,
          sender_id: null,
          is_ai_generated: true,
        });
      }

      // Log system event
      await adminClient.from("system_events").insert({
        event_type: "csv_import",
        entity_type: "tasks",
        property_id: resolvedPropertyId,
        triggered_by: callerUserId,
        payload: { task_count: taskCount },
        processed_by_ai: true,
        ai_response: `Imported ${taskCount} tasks`,
      });

      return new Response(
        JSON.stringify({
          success: true,
          task_count: taskCount,
          summary: `I have processed the new import. ${taskCount} new tasks have been added.`,
          tasks: taskRows,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CHAT MESSAGE MODE ─────────────────────────────────────────────────────
    if (type === "message") {
      const { messages: conversationHistory = [] } = body;

      // Load recent context: tasks count, open issues for this user/property
      let contextNote = "";
      if (callerUserId) {
        const { data: pendingTasks } = await adminClient
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "in_progress"])
          .eq("assigned_to", callerUserId);
        const pendingCount = (pendingTasks as unknown as { count: number } | null)?.count ?? 0;
        contextNote = `\nLive context: User has ${pendingCount} pending/in-progress tasks.`;
      }

      const aiMessages = [
        { role: "system", content: systemPrompt + contextNote },
        ...conversationHistory,
        { role: "user", content },
      ];

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: aiMessages,
          stream: true,
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in workspace settings." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await aiResponse.text();
        throw new Error(`AI error: ${aiResponse.status} ${t}`);
      }

      // Save the user message and queue the AI message to be stored after streaming
      if (thread_id && callerUserId) {
        await adminClient.from("messages").insert({
          thread_id,
          content_text: content,
          sender_id: callerUserId,
          is_ai_generated: false,
        });
      }

      return new Response(aiResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "X-Thread-Id": thread_id ?? "",
        },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown request type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ronin-ai error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
