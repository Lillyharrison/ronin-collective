import { signedInUserId, unauthorized } from "../_shared/internalAuth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { TRANSLATION_PROMPT, validTexts } from "./rules.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!(await signedInUserId(req))) return unauthorized(corsHeaders);

  try {
    const body = await req.json().catch(() => null);
    if (!validTexts(body?.texts)) return new Response(JSON.stringify({error: "Expected at most 50 strings, each at most 2000 characters"}), {status: 400, headers: {...corsHeaders, "Content-Type": "application/json"}});
    const texts = body.texts as string[];
    if (!texts || texts.length === 0) {
      return new Response(JSON.stringify({ translations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    // Build a compact numbered list so the model returns a matching list
    const numbered = JSON.stringify(texts);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: TRANSLATION_PROMPT,
          },
          { role: "user", content: numbered },
        ],
        temperature: 0.1,
      }),
    });

    if (!resp.ok) {
      throw new Error(`AI gateway error: ${resp.status}`);
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "[]";

    // Strip markdown code fences if model wraps in ```json ... ```
    const cleaned = raw.replace(/^```[\w]*\n?/m, "").replace(/```$/m, "").trim();
    let translations: string[];
    try {
      translations = JSON.parse(cleaned);
    } catch {
      throw new Error("Invalid translation response");
    }

    if (!validTexts(translations) || translations.length !== texts.length) throw new Error("Invalid translation response");
    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[translate-entries] translation failed");
    return new Response(JSON.stringify({ error: "Translation unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
