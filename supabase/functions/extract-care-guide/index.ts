// Reads a manufacturer fabric/spec sheet (image or PDF) and drafts a care guide.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM = `You read manufacturer fabric / material specification sheets (often bilingual Italian/English) for a luxury estate team and draft a printable care guide for housekeeping staff.
Interpret ISO/GINETEX care symbols precisely:
- washtub with hand / crossed tub = do not wash; crossed triangle = do not bleach; square with circle crossed = do not tumble dry;
- iron with 1 dot = iron on low (max 110°C), 2 dots = medium, 3 dots = hot, crossed iron = do not iron;
- circle with P or F = professional dry clean only (F = hydrocarbon solvent only), crossed circle = do not dry clean;
- sun symbol crossed = keep out of direct sunlight.
Write short, plain, practical instructions in English. Do not invent symbols that are not present.
daily_care: 3-5 routine tips suited to this material (vacuuming, blotting spills, rotating cushions, etc).
care_rules: one line per care symbol found.
specs_line: ONE compact line of key ratings (e.g. "Martindale 20,000 · Light 5/8 · Pilling 4/5 · Fire: TB117, EN 1021-1&2, BS 5852") or empty.
swatch_box: the bounding box of the fabric swatch/sample photo on the page, as fractions 0-1 of page width/height (x,y = top-left). If there is no swatch, return all zeros.`;

const TOOL = {
  type: "function",
  function: {
    name: "submit_care_guide",
    description: "Submit the drafted care guide.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title e.g. 'Edra Pack sofa fabric'" },
        fabric_code: { type: "string" },
        composition: { type: "string" },
        daily_care: { type: "array", items: { type: "string" } },
        care_rules: { type: "array", items: { type: "string" } },
        specs_line: { type: "string" },
        swatch_box: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
          required: ["x", "y", "w", "h"],
        },
      },
      required: ["title", "fabric_code", "composition", "daily_care", "care_rules", "specs_line", "swatch_box"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!u?.user) return json({ error: "Please sign in again." }, 401);

    const { fileBase64, mimeType, fileName, hint } = await req.json();
    if (typeof fileBase64 !== "string" || !fileBase64 || typeof mimeType !== "string" || !/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(mimeType)) {
      return json({ error: "Upload a PNG, JPG, WEBP or PDF." }, 400);
    }
    if (fileBase64.length > 14_000_000) return json({ error: "File is too large (max ~10MB)." }, 400);

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI is not configured." }, 500);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: [
            { type: "text", text: `File: ${String(fileName ?? "sheet").slice(0, 120)}${hint ? `\nItem: ${String(hint).slice(0, 200)}` : ""}\nDraft the care guide.` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          ] },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "submit_care_guide" } },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      if (resp.status === 429) return json({ error: "AI is busy — try again in a minute." }, 429);
      if (resp.status === 402) return json({ error: "AI credits are used up. Add credits in Settings → Plans & credits." }, 402);
      return json({ error: `AI request failed (${resp.status}).` }, resp.status >= 500 ? 502 : resp.status);
    }
    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return json({ error: "Couldn't read this sheet. Try a clearer image." }, 422);
    return json(JSON.parse(args));
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
