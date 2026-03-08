import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texts } = await req.json() as { texts: string[] };
    if (!texts || texts.length === 0) {
      return new Response(JSON.stringify({ translations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    // Build a compact numbered list so the model returns a matching list
    const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");

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
            content:
              "You are a professional translator. Translate each numbered item from English to Spanish. " +
              "Return ONLY a JSON array of translated strings in the same order, e.g. [\"...\",\"...\"]. " +
              "Do not include explanations, numbering, or any other text — only the JSON array.",
          },
          { role: "user", content: numbered },
        ],
        temperature: 0.1,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`AI gateway error: ${resp.status} ${err}`);
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "[]";

    // Strip markdown code fences if model wraps in ```json ... ```
    const cleaned = raw.replace(/^```[\w]*\n?/m, "").replace(/```$/m, "").trim();
    let translations: string[];
    try {
      translations = JSON.parse(cleaned);
    } catch {
      translations = texts;
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[translate-entries]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
